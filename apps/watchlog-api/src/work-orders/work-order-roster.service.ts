import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  applicableCompetencyRules,
  deriveWorkerReasons,
  ROSTER_CONFIRM_SIGNATURE_MEANING,
  ROSTER_OVERRIDE_SIGNATURE_MEANING,
  workerStatusFromDetails,
  WORKER_BLOCK_REASON_META,
  type AddWorkOrderWorkerRequest,
  type ConfirmRosterRequest,
  type RemoveWorkOrderWorkerRequest,
  type RosterRoleDto,
  type WorkerCompanyAccreditationInput,
  type WorkerCompetencyRuleInput,
  type WorkerStatusDetail,
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

    // Gate/override POR PERSONA (S2-B): si hay personas en ROJO, cada una exige un motivo
    // (override) para poder autorizar pese al impedimento. Los rojos SIN motivo se explican.
    const blocked = roster.workers.filter((w) => w.status.level === "blocked");
    const overrideMap = new Map((dto.overrides ?? []).map((o) => [o.workerId, o.reason.trim()]));
    if (blocked.length > 0) {
      const missing = blocked.filter((w) => !overrideMap.get(w.id));
      if (missing.length > 0) {
        const detail = missing.map((w) => `${w.personName} (${this.explainBlock(w.status.details)})`).join("; ");
        throw new BadRequestException(
          `No se puede confirmar la dotación: hay personas con impedimentos. Resuélvalos o registre una justificación firmada (override) por cada una. Pendientes: ${detail}.`,
        );
      }
    }

    // Firma Part 11: re-autenticación del aprobador ANTES de sellar (§11.200). El significado
    // de la firma cambia si la confirmación incluye excepciones (una firma cubre todo el acto).
    const meaning = blocked.length > 0 ? ROSTER_OVERRIDE_SIGNATURE_MEANING : ROSTER_CONFIRM_SIGNATURE_MEANING;
    const reauth = await this.reauth.verifyForSignature(userId, { password: dto.password, mfaCode: dto.mfaCode }, { requireMfa: false });
    const now = new Date();

    // Persistir el override firmado por cada persona en rojo (motivo + firma; §6.3).
    for (const w of blocked) {
      const reason = overrideMap.get(w.id)!;
      await this.prisma.workOrderWorker.update({
        where: { id: w.id },
        // overrideSignatureId queda null (LogEntrySignature es deuda COMPARTIDA con las
        // transiciones); la re-autenticación anterior es el control efectivo.
        data: { overrideReason: reason, overrideById: userId, overrideAt: now, overrideSignatureId: null },
      });
      await this.addEvent(workOrderId, "WORKER_OVERRIDE", `Excepción firmada para ${w.personName} (${this.explainBlock(w.status.details)}): ${reason}`, userId, {
        workerId: w.id,
        personId: w.personId,
        reasons: w.status.reasons,
        reason,
      });
      await this.audit.record({ ...ctx, action: "workorder.roster.override", entityType: "WorkOrderWorker", entityId: w.id, after: { personId: w.personId, reasons: w.status.reasons, reason } });
    }

    await this.prisma.workOrder.update({ where: { id: workOrderId }, data: { rosterConfirmedAt: now, rosterConfirmedById: userId } });
    const overrideNote = blocked.length > 0 ? ` con ${blocked.length} excepción(es) documentada(s)` : "";
    await this.addEvent(workOrderId, "ROSTER_CONFIRMED", `Dotación confirmada y firmada por ${reauth.signerName} (${roster.workers.length} persona(s)${overrideNote})`, userId, { count: roster.workers.length, overrides: blocked.length, meaning });
    await this.audit.record({ ...ctx, action: "workorder.roster.confirmed", entityType: "WorkOrder", entityId: workOrderId, after: { count: roster.workers.length, overrides: blocked.length, signerName: reauth.signerName } });
    return this.buildRosterDto(await this.loadWorkOrder(workOrderId));
  }

  /** Redacta en español el impedimento de una persona a partir de sus detalles (§6.2). */
  private explainBlock(details: WorkerStatusDetail[]): string {
    const parts = details
      .filter((d) => WORKER_BLOCK_REASON_META[d.reason].level === "blocked")
      .map((d) => {
        if (d.reason === "COMPETENCY_MISSING") return `falta «${d.competencyTypeName ?? "competencia requerida"}»`;
        if (d.reason === "COMPETENCY_EXPIRED") return `«${d.competencyTypeName ?? "competencia"}» vencida`;
        if (d.reason === "RESTRICTION_ACTIVE") return `restricción activa (${d.restrictionReason ?? d.restrictionType ?? "veto"})`;
        if (d.reason === "COMPANY_NOT_ACCREDITED") {
          const co = d.companyName ? `empresa «${d.companyName}»` : "empresa contratista";
          // Si venció (había fecha), lo decimos; si no, es no acreditada/suspendida.
          return d.accreditedUntil ? `${co}: acreditación vencida` : `${co} no acreditada`;
        }
        return WORKER_BLOCK_REASON_META[d.reason].label.toLowerCase();
      });
    return parts.length ? parts.join(", ") : "impedimento";
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

    // === S2: derivar las causas del semáforo POR PERSONA (Ejes A/B), en vivo ===
    const personIds = [...new Set(workerRows.map((r) => r.personId))];
    const rolesByPerson = new Map<string, string[]>();
    for (const r of workerRows) {
      const arr = rolesByPerson.get(r.personId) ?? [];
      arr.push(r.rosterRoleId);
      rolesByPerson.set(r.personId, arr);
    }
    const detailsByPerson = personIds.length ? await this.deriveReasonsByPerson(wo, personIds, rolesByPerson) : new Map<string, WorkerStatusDetail[]>();

    const overrideUserIds = [...new Set(workerRows.map((r) => r.overrideById).filter((x): x is string => !!x))];
    const overrideNames = overrideUserIds.length
      ? new Map((await this.prisma.user.findMany({ where: { id: { in: overrideUserIds } }, select: { id: true, displayName: true, email: true } })).map((u) => [u.id, u.displayName ?? u.email]))
      : new Map<string, string>();

    const workers: WorkOrderWorkerDto[] = workerRows
      .map((r) => {
        const details = detailsByPerson.get(r.personId) ?? [];
        const status = workerStatusFromDetails(details);
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
          status: { level: status.level, reasons: status.reasons, details },
          override: r.overrideReason && r.overrideAt
            ? { reason: r.overrideReason, byName: r.overrideById ? overrideNames.get(r.overrideById) ?? null : null, at: r.overrideAt.toISOString() }
            : null,
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

  /**
   * Deriva las causas rojas/ámbar de cada persona de la dotación (S2). Cruza EN VIVO las
   * reglas de competencia aplicables a la OT × las competencias vigentes de la persona ×
   * sus restricciones activas. NO almacena nada (evita staleness). COMPANY_NOT_ACCREDITED
   * (empresa) se DIFIERE a S3 (S2-A). Devuelve el detalle legible por persona.
   */
  private async deriveReasonsByPerson(wo: RosterWorkOrder, personIds: string[], rolesByPerson: Map<string, string[]>): Promise<Map<string, WorkerStatusDetail[]>> {
    const nowMs = Date.now();
    // El gate de EMPRESA (S3) sólo se evalúa si el tipo de la OT lo exige; si no, ni siquiera
    // se leen las empresas (cero costo / cero riesgo de falso-bloqueo). Traza toggle por tipo.
    const requireAccreditation = wo.type.requireCompanyAccreditation;
    const [ruleRows, competencyRows, restrictionRows, personRows] = await Promise.all([
      this.prisma.workOrderCompetencyRule.findMany({
        where: { deletedAt: null, active: true },
        include: { competencyType: { select: { name: true, warningLeadDays: true } } },
      }),
      this.prisma.personCompetency.findMany({
        where: { personId: { in: personIds }, deletedAt: null },
        select: { personId: true, competencyTypeId: true, expiresAt: true },
      }),
      this.prisma.personRestriction.findMany({
        where: { personId: { in: personIds }, deletedAt: null, active: true },
        select: { personId: true, type: true, reason: true, startsAt: true, endsAt: true },
      }),
      // Empresa contratista de cada persona (sólo si el tipo exige acreditación).
      requireAccreditation
        ? this.prisma.person.findMany({
            where: { id: { in: personIds } },
            select: { id: true, kind: true, contractorCompany: { select: { name: true, accreditationStatus: true, accreditedUntil: true } } },
          })
        : Promise.resolve([] as { id: string; kind: string; contractorCompany: { name: string; accreditationStatus: string; accreditedUntil: Date | null } | null }[]),
    ]);
    // Reglas aplicables a ESTA OT (función pura, espejo de checklists); el filtro por rol
    // se aplica por persona dentro de `deriveWorkerReasons`.
    const applicable = applicableCompetencyRules(
      { typeId: wo.typeId, criticality: wo.criticality, requiresPtw: wo.requiresPtw, specialtyIds: wo.specialties.map((s) => s.specialtyId) },
      ruleRows,
    );
    const rules: WorkerCompetencyRuleInput[] = applicable.map((r) => ({
      competencyTypeId: r.competencyTypeId,
      competencyTypeName: r.competencyType.name,
      mandatory: r.mandatory,
      appliesToRosterRoleId: r.appliesToRosterRoleId,
      warningLeadDays: r.competencyType.warningLeadDays,
    }));
    const compByPerson = new Map<string, { competencyTypeId: string; expiresAtMs: number | null }[]>();
    for (const c of competencyRows) {
      const arr = compByPerson.get(c.personId) ?? [];
      arr.push({ competencyTypeId: c.competencyTypeId, expiresAtMs: c.expiresAt ? c.expiresAt.getTime() : null });
      compByPerson.set(c.personId, arr);
    }
    const restrByPerson = new Map<string, { type: string; reason: string }[]>();
    for (const r of restrictionRows) {
      const started = r.startsAt.getTime() <= nowMs;
      const notEnded = !r.endsAt || r.endsAt.getTime() > nowMs;
      if (!started || !notEnded) continue; // sólo activas Y vigentes
      const arr = restrByPerson.get(r.personId) ?? [];
      arr.push({ type: r.type, reason: r.reason });
      restrByPerson.set(r.personId, arr);
    }
    // Eje EMPRESA (S3): acreditación de la empresa contratista, por persona. Sólo se arma si
    // el tipo lo exige y la persona es CONTRATISTA con empresa (`deriveWorkerReasons` sólo
    // emite causas cuando `company.required`); internos ⇒ null.
    const companyByPerson = new Map<string, WorkerCompanyAccreditationInput>();
    for (const p of personRows) {
      if (p.kind !== "CONTRACTOR" || !p.contractorCompany) continue;
      companyByPerson.set(p.id, {
        required: true,
        companyName: p.contractorCompany.name,
        status: p.contractorCompany.accreditationStatus as WorkerCompanyAccreditationInput["status"],
        accreditedUntilMs: p.contractorCompany.accreditedUntil ? p.contractorCompany.accreditedUntil.getTime() : null,
      });
    }
    const out = new Map<string, WorkerStatusDetail[]>();
    for (const personId of personIds) {
      out.set(
        personId,
        deriveWorkerReasons({
          rules,
          personRosterRoleIds: rolesByPerson.get(personId) ?? [],
          competencies: compByPerson.get(personId) ?? [],
          restrictions: restrByPerson.get(personId) ?? [],
          company: companyByPerson.get(personId) ?? null,
          nowMs,
        }),
      );
    }
    return out;
  }

  private async loadWorkOrder(id: string): Promise<RosterWorkOrder> {
    const row = await this.prisma.workOrder.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        orgNodeId: true,
        lifecycle: true,
        typeId: true,
        criticality: true,
        requiresPtw: true,
        rosterConfirmedAt: true,
        rosterConfirmedById: true,
        type: { select: { rosterEnabled: true, requireCompanyAccreditation: true } },
        specialties: { select: { specialtyId: true } },
      },
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
  typeId: string;
  criticality: number;
  requiresPtw: boolean;
  rosterConfirmedAt: Date | null;
  rosterConfirmedById: string | null;
  type: { rosterEnabled: boolean; requireCompanyAccreditation: boolean };
  specialties: { specialtyId: string }[];
};
