import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  evaluateWorkerStatus,
  ROSTER_CONFIRM_SIGNATURE_MEANING,
  type AddWorkOrderWorkerRequest,
  type ConfirmRosterRequest,
  type RemoveWorkOrderWorkerRequest,
  type RosterRoleDto,
  type WorkOrderRosterDto,
  type WorkOrderWorkerDto,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { ReauthService } from "../auth/reauth.service";
import { PersonsService } from "./persons.service";

/**
 * DOTACIÓN de la OT (Gobierno 2, S1) — el ROSTER de personas que ingresan bajo el
 * permiso y su CONFIRMACIÓN FIRMADA por quien autoriza.
 *
 * Espejo EXACTO del set de ejecución (`WorkOrderChecklistsService`):
 *  - `addWorker`/`removeWorker` curan la dotación y AUTO-LIMPIAN la confirmación previa
 *    (`clearRosterConfirmation`) ⇒ "quien entra = quien fue autorizado".
 *  - `confirmRoster` sella `rosterConfirmedAt/ById` con FIRMA Part 11 (ReauthService).
 *    Traza OSHA 1910.146(e)(2): el supervisor de entrada FIRMA para autorizar la entrada.
 *  - `assertRosterConfirmed` es el GATE: si el tipo gestiona dotación y hay personas, no
 *    se autoriza el permiso sin confirmar. Sin dotación ⇒ no exige nada (retrocompatible).
 *
 * El semáforo por persona (§7 del diseño) se deriva en vivo; en S1 sin causas rojas
 * (competencias/veto/acreditación llegan en S2/S3), pero la forma es estable.
 */
@Injectable()
export class WorkOrderRosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly reauth: ReauthService,
    private readonly persons: PersonsService,
  ) {}

  async getRoster(userId: string, workOrderId: string): Promise<WorkOrderRosterDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    return this.buildRosterDto(wo);
  }

  async addWorker(userId: string, workOrderId: string, dto: AddWorkOrderWorkerRequest, ctx: AuditContext): Promise<WorkOrderRosterDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertActive(wo);
    this.assertRosterEnabled(wo);
    const person = await this.prisma.person.findFirst({ where: { id: dto.personId, deletedAt: null, active: true }, select: { id: true, fullName: true } });
    if (!person) throw new BadRequestException("La persona indicada no existe o está inactiva");
    const role = await this.prisma.rosterRole.findFirst({ where: { id: dto.rosterRoleId, deletedAt: null, active: true }, select: { id: true, name: true } });
    if (!role) throw new BadRequestException("El rol de dotación indicado no existe o está inactivo");
    // El índice único (OT, persona, rol) abarca también las filas soft-removed; si la
    // persona con ese rol ya estuvo y fue quitada, se REVIVE la fila (en vez de insertar y
    // violar el unique). Si está activa ⇒ duplicado.
    const existing = await this.prisma.workOrderWorker.findFirst({ where: { workOrderId, personId: dto.personId, rosterRoleId: dto.rosterRoleId } });
    if (existing && !existing.removedAt) throw new BadRequestException("La persona ya está en la dotación con ese rol");
    const row = existing
      ? await this.prisma.workOrderWorker.update({
          where: { id: existing.id },
          data: { note: dto.note?.trim() || null, addedById: userId, addedAt: new Date(), removedAt: null, removedById: null, removeReason: null },
        })
      : await this.prisma.workOrderWorker.create({
          data: { workOrderId, personId: dto.personId, rosterRoleId: dto.rosterRoleId, note: dto.note?.trim() || null, addedById: userId },
        });
    await this.addEvent(workOrderId, "WORKER_ADDED", `Persona agregada a la dotación: ${person.fullName} (${role.name})`, userId, { workerId: row.id, personId: dto.personId, rosterRoleId: dto.rosterRoleId });
    await this.clearRosterConfirmation(workOrderId, userId);
    await this.audit.record({ ...ctx, action: "workorder.roster.added", entityType: "WorkOrder", entityId: workOrderId, after: { workerId: row.id, personId: dto.personId, rosterRoleId: dto.rosterRoleId } });
    return this.buildRosterDto(await this.loadWorkOrder(workOrderId));
  }

  async removeWorker(userId: string, workOrderId: string, workerId: string, dto: RemoveWorkOrderWorkerRequest, ctx: AuditContext): Promise<WorkOrderRosterDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertActive(wo);
    const worker = await this.prisma.workOrderWorker.findUnique({ where: { id: workerId }, include: { person: { select: { fullName: true } } } });
    if (!worker || worker.workOrderId !== workOrderId || worker.removedAt) throw new NotFoundException("Persona no encontrada en la dotación");
    await this.prisma.workOrderWorker.update({ where: { id: workerId }, data: { removedAt: new Date(), removedById: userId, removeReason: dto.reason?.trim() || null } });
    await this.addEvent(workOrderId, "WORKER_REMOVED", `Persona quitada de la dotación: ${worker.person.fullName}`, userId, { workerId, reason: dto.reason ?? null });
    await this.clearRosterConfirmation(workOrderId, userId);
    await this.audit.record({ ...ctx, action: "workorder.roster.removed", entityType: "WorkOrder", entityId: workOrderId, after: { workerId, reason: dto.reason ?? null } });
    return this.buildRosterDto(await this.loadWorkOrder(workOrderId));
  }

  /**
   * CONFIRMA (sella) la dotación con firma Part 11. Exige el tipo con dotación activa y
   * ≥1 persona. Si hubiera personas en ROJO (S2/S3), exige override firmado por persona
   * (aquí, en S1, no puede haber rojos). Traza OSHA 1910.146(e)(2).
   */
  async confirmRoster(userId: string, workOrderId: string, dto: ConfirmRosterRequest, ctx: AuditContext): Promise<WorkOrderRosterDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertActive(wo);
    this.assertRosterEnabled(wo);
    const roster = await this.buildRosterDto(wo);
    if (roster.workers.length === 0) throw new BadRequestException("No hay personas en la dotación para confirmar");
    if (roster.hasBlocked) throw new BadRequestException("Hay personas con impedimentos: resuélvalos o registre un override firmado antes de confirmar");
    // Firma Part 11: re-autenticación del aprobador ANTES de sellar (§11.200).
    const reauth = await this.reauth.verifyForSignature(userId, { password: dto.password, mfaCode: dto.mfaCode }, { requireMfa: false });
    const now = new Date();
    await this.prisma.workOrder.update({ where: { id: workOrderId }, data: { rosterConfirmedAt: now, rosterConfirmedById: userId } });
    await this.addEvent(workOrderId, "ROSTER_CONFIRMED", `Dotación confirmada y firmada por ${reauth.signerName} (${roster.workers.length} persona(s))`, userId, { count: roster.workers.length, meaning: ROSTER_CONFIRM_SIGNATURE_MEANING });
    await this.audit.record({ ...ctx, action: "workorder.roster.confirmed", entityType: "WorkOrder", entityId: workOrderId, after: { count: roster.workers.length, signerName: reauth.signerName } });
    return this.buildRosterDto(await this.loadWorkOrder(workOrderId));
  }

  /** Invalida una confirmación previa cuando la dotación cambia (auto-limpieza al curar). */
  private async clearRosterConfirmation(workOrderId: string, actorId: string | null): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { rosterConfirmedAt: true } });
    if (!wo?.rosterConfirmedAt) return;
    await this.prisma.workOrder.update({ where: { id: workOrderId }, data: { rosterConfirmedAt: null, rosterConfirmedById: null } });
    await this.addEvent(workOrderId, "ROSTER_CHANGED", "La dotación cambió: requiere volver a confirmarse antes de autorizar el permiso", actorId);
  }

  /**
   * GATE (Gobierno 2): si el tipo de la OT gestiona dotación y hay ≥1 persona, el
   * aprobador debe haber CONFIRMADO la dotación antes de autorizar el permiso. Sin
   * dotación (tipo sin `rosterEnabled` o roster vacío) ⇒ no exige nada (retrocompatible).
   */
  async assertRosterConfirmed(workOrderId: string): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: { rosterConfirmedAt: true, type: { select: { rosterEnabled: true } } },
    });
    if (!wo?.type.rosterEnabled) return;
    const count = await this.prisma.workOrderWorker.count({ where: { workOrderId, removedAt: null } });
    if (count === 0) return;
    if (!wo.rosterConfirmedAt) {
      throw new BadRequestException("Antes de autorizar el permiso, confirme la dotación que ingresará a ejecutarlo.");
    }
  }

  // === Helpers ================================================================

  private async buildRosterDto(wo: RosterWorkOrder): Promise<WorkOrderRosterDto> {
    const [workerRows, roles] = await Promise.all([
      this.prisma.workOrderWorker.findMany({
        where: { workOrderId: wo.id, removedAt: null },
        include: {
          person: { select: { fullName: true, kind: true, contractorCompany: { select: { name: true } } } },
          rosterRole: { select: { name: true, isSupervisorRole: true, sortOrder: true } },
        },
        orderBy: [{ addedAt: "asc" }],
      }),
      this.persons.listRosterRoles(false),
    ]);
    const workers: WorkOrderWorkerDto[] = workerRows
      .map((r) => {
        // S1: sin causas rojas (competencias/veto/acreditación = S2/S3). Forma estable.
        const status = evaluateWorkerStatus({ reasons: [] });
        return {
          id: r.id,
          workOrderId: wo.id,
          personId: r.personId,
          personName: r.person.fullName,
          personKind: r.person.kind as WorkOrderWorkerDto["personKind"],
          contractorCompanyName: r.person.contractorCompany?.name ?? null,
          rosterRoleId: r.rosterRoleId,
          rosterRoleName: r.rosterRole.name,
          isSupervisorRole: r.rosterRole.isSupervisorRole,
          note: r.note,
          addedAt: r.addedAt.toISOString(),
          status: { level: status.level, reasons: status.reasons },
          _sort: r.rosterRole.sortOrder,
        };
      })
      // Ordena por rol (sortOrder) y luego por nombre; descarta el campo auxiliar.
      .sort((a, b) => a._sort - b._sort || a.personName.localeCompare(b.personName))
      .map(({ _sort: _drop, ...w }) => w);
    const confirmedByName = wo.rosterConfirmedById ? (await this.resolveUserName(wo.rosterConfirmedById)) : null;
    return {
      enabled: wo.type.rosterEnabled,
      workers,
      roles: roles as RosterRoleDto[],
      confirmedAt: wo.rosterConfirmedAt?.toISOString() ?? null,
      confirmedById: wo.rosterConfirmedById,
      confirmedByName,
      hasBlocked: workers.some((w) => w.status.level === "blocked"),
    };
  }

  private async loadWorkOrder(id: string): Promise<RosterWorkOrder> {
    const row = await this.prisma.workOrder.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, orgNodeId: true, lifecycle: true, rosterConfirmedAt: true, rosterConfirmedById: true, type: { select: { rosterEnabled: true } } },
    });
    if (!row) throw new NotFoundException("Orden de trabajo no encontrada");
    return row;
  }

  private assertActive(wo: { lifecycle: string }): void {
    if (wo.lifecycle === "CLOSED" || wo.lifecycle === "CANCELED") {
      throw new BadRequestException("La orden de trabajo ya está cerrada o anulada");
    }
  }

  private assertRosterEnabled(wo: RosterWorkOrder): void {
    if (!wo.type.rosterEnabled) throw new BadRequestException("El tipo de esta orden de trabajo no gestiona dotación");
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
  }

  private async addEvent(workOrderId: string, kind: string, summary: string, actorId: string | null, metadata?: Record<string, unknown>): Promise<void> {
    await this.prisma.workOrderEvent.create({
      data: { workOrderId, kind, summary, actorId, actorName: null, metadata: (metadata ?? null) as Prisma.InputJsonValue },
    });
  }

  private async resolveUserName(id: string): Promise<string | null> {
    const u = await this.prisma.user.findUnique({ where: { id }, select: { displayName: true, email: true } });
    return u ? u.displayName ?? u.email : null;
  }
}

type RosterWorkOrder = {
  id: string;
  orgNodeId: string;
  lifecycle: string;
  rosterConfirmedAt: Date | null;
  rosterConfirmedById: string | null;
  type: { rosterEnabled: boolean };
};
