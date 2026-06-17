import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  incidentActionCode,
  type CancelIncidentActionRequest,
  type CompleteIncidentActionRequest,
  type CreateIncidentActionRequest,
  type IncidentActionDto,
  type IncidentActionStatus,
  type UpdateIncidentActionRequest,
  type VerifyIncidentActionRequest,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";

/**
 * Acciones CAPA (correctivas / preventivas / inmediatas) de una incidencia
 * (Fase 4.2a). El alcance de datos lo HEREDA de la incidencia (ABAC por nodo). Cada
 * mutación deja huella en el timeline (`IncidentActivity`) y en `AuditLog`. La
 * VERIFICACIÓN de eficacia se gobierna por un permiso aparte (segregación de
 * funciones) en el controller. Una acción `mandatory` aún abierta BLOQUEA el cierre
 * (la guarda vive en `IncidentsService.transition`). Sin borrado físico.
 */
@Injectable()
export class IncidentActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  async list(userId: string, incidentId: string): Promise<IncidentActionDto[]> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    const rows = await this.prisma.incidentAction.findMany({
      where: { incidentId },
      orderBy: [{ createdAt: "asc" }],
    });
    return this.toDtos(rows);
  }

  async create(
    userId: string,
    incidentId: string,
    dto: CreateIncidentActionRequest,
    ctx: AuditContext,
  ): Promise<IncidentActionDto> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("No se pueden agregar acciones a una incidencia cerrada o anulada");
    if (dto.responsibleId) await this.assertUserExists(dto.responsibleId);
    if (dto.responsibleRoleId) await this.assertRoleExists(dto.responsibleRoleId);
    if (dto.investigationStepId) await this.assertStepBelongsToIncident(dto.investigationStepId, incidentId);

    const row = await this.prisma.incidentAction.create({
      data: {
        incidentId,
        kind: dto.kind,
        title: dto.title,
        description: dto.description ?? null,
        mandatory: dto.mandatory ?? false,
        responsibleId: dto.responsibleId ?? null,
        responsibleRoleId: dto.responsibleRoleId ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        investigationStepId: dto.investigationStepId ?? null,
        status: "OPEN",
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.addActivity(incidentId, "ACTION_CREATED", `Acción ${incidentActionCode(row.number)} creada: ${row.title}`, ctx, {
      actionId: row.id,
      kind: row.kind,
      mandatory: row.mandatory,
    });
    await this.audit.record({ ...ctx, action: "incident.action.created", entityType: "IncidentAction", entityId: row.id, after: this.snapshot(row) });
    return (await this.toDtos([row]))[0]!;
  }

  async update(userId: string, actionId: string, dto: UpdateIncidentActionRequest, ctx: AuditContext): Promise<IncidentActionDto> {
    const before = await this.loadAction(actionId);
    const incident = await this.loadIncident(before.incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (before.status === "VERIFIED" || before.status === "CANCELED") {
      throw new BadRequestException("No se puede editar una acción verificada o anulada");
    }
    if (dto.responsibleId) await this.assertUserExists(dto.responsibleId);
    if (dto.responsibleRoleId) await this.assertRoleExists(dto.responsibleRoleId);
    if (dto.investigationStepId) await this.assertStepBelongsToIncident(dto.investigationStepId, before.incidentId);
    // `status` solo conmuta entre los NO terminales (OPEN ↔ IN_PROGRESS).
    const nextStatus: IncidentActionStatus | undefined =
      dto.status === undefined ? undefined : dto.status;

    const row = await this.prisma.incidentAction.update({
      where: { id: actionId },
      data: {
        kind: dto.kind === undefined ? undefined : dto.kind,
        title: dto.title === undefined ? undefined : dto.title,
        description: dto.description === undefined ? undefined : dto.description,
        mandatory: dto.mandatory === undefined ? undefined : dto.mandatory,
        responsibleId: dto.responsibleId === undefined ? undefined : dto.responsibleId,
        responsibleRoleId: dto.responsibleRoleId === undefined ? undefined : dto.responsibleRoleId,
        dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
        investigationStepId: dto.investigationStepId === undefined ? undefined : dto.investigationStepId,
        status: nextStatus,
        updatedById: userId,
      },
    });
    await this.audit.record({ ...ctx, action: "incident.action.updated", entityType: "IncidentAction", entityId: actionId, before: this.snapshot(before), after: this.snapshot(row) });
    return (await this.toDtos([row]))[0]!;
  }

  /** Marcar como realizada (→ DONE). */
  async complete(userId: string, actionId: string, dto: CompleteIncidentActionRequest, ctx: AuditContext): Promise<IncidentActionDto> {
    const before = await this.loadAction(actionId);
    const incident = await this.loadIncident(before.incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (before.status !== "OPEN" && before.status !== "IN_PROGRESS") {
      throw new BadRequestException("Solo se puede completar una acción abierta o en progreso");
    }
    const row = await this.prisma.incidentAction.update({
      where: { id: actionId },
      data: {
        status: "DONE",
        completedAt: new Date(),
        completedById: userId,
        completionNote: dto.completionNote ?? null,
        updatedById: userId,
      },
    });
    await this.addActivity(before.incidentId, "ACTION_COMPLETED", `Acción ${incidentActionCode(row.number)} realizada`, ctx, { actionId });
    await this.audit.record({ ...ctx, action: "incident.action.completed", entityType: "IncidentAction", entityId: actionId, after: { status: "DONE" } });
    return (await this.toDtos([row]))[0]!;
  }

  /**
   * Verificar la eficacia (DONE → VERIFIED si EFECTIVA; DONE → IN_PROGRESS si NO
   * EFECTIVA, reabriendo para retrabajo). Permiso `incident:action:verify` (gate en
   * el controller); segregación de funciones respecto de `manage`.
   */
  async verify(userId: string, actionId: string, dto: VerifyIncidentActionRequest, ctx: AuditContext): Promise<IncidentActionDto> {
    const before = await this.loadAction(actionId);
    const incident = await this.loadIncident(before.incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (before.status !== "DONE") throw new BadRequestException("Solo se puede verificar una acción realizada (DONE)");

    const now = new Date();
    const effective = dto.effectivenessOutcome === "EFFECTIVE";
    const row = await this.prisma.incidentAction.update({
      where: { id: actionId },
      data: effective
        ? {
            status: "VERIFIED",
            verifiedAt: now,
            verifiedById: userId,
            effectivenessOutcome: "EFFECTIVE",
            verificationNote: dto.verificationNote ?? null,
            updatedById: userId,
          }
        : {
            // No efectiva → reabre para retrabajo; la verificación efectiva queda limpia.
            status: "IN_PROGRESS",
            completedAt: null,
            completedById: null,
            verifiedAt: null,
            verifiedById: null,
            effectivenessOutcome: null,
            verificationNote: null,
            updatedById: userId,
          },
    });
    await this.addActivity(
      before.incidentId,
      "ACTION_VERIFIED",
      effective
        ? `Acción ${incidentActionCode(row.number)} verificada: eficaz`
        : `Acción ${incidentActionCode(row.number)} verificada: NO eficaz — reabierta`,
      ctx,
      { actionId, outcome: dto.effectivenessOutcome },
    );
    await this.audit.record({ ...ctx, action: "incident.action.verified", entityType: "IncidentAction", entityId: actionId, after: { outcome: dto.effectivenessOutcome } });
    return (await this.toDtos([row]))[0]!;
  }

  async cancel(userId: string, actionId: string, dto: CancelIncidentActionRequest, ctx: AuditContext): Promise<IncidentActionDto> {
    const before = await this.loadAction(actionId);
    const incident = await this.loadIncident(before.incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (before.status === "VERIFIED" || before.status === "CANCELED") {
      throw new BadRequestException("No se puede anular una acción verificada o ya anulada");
    }
    const row = await this.prisma.incidentAction.update({
      where: { id: actionId },
      data: { status: "CANCELED", canceledAt: new Date(), canceledById: userId, cancelReason: dto.reason, updatedById: userId },
    });
    await this.addActivity(before.incidentId, "ACTION_CANCELED", `Acción ${incidentActionCode(row.number)} anulada: ${dto.reason}`, ctx, { actionId });
    await this.audit.record({ ...ctx, action: "incident.action.canceled", entityType: "IncidentAction", entityId: actionId, after: { reason: dto.reason } });
    return (await this.toDtos([row]))[0]!;
  }

  // === Helpers ================================================================

  private async toDtos(rows: IncidentActionRow[]): Promise<IncidentActionDto[]> {
    if (rows.length === 0) return [];
    const userIds = rows.flatMap((r) => [r.responsibleId, r.completedById, r.verifiedById]);
    const userNames = await this.resolveUserNames(userIds);
    const roleIds = [...new Set(rows.map((r) => r.responsibleRoleId).filter((x): x is string => !!x))];
    const roleNames = roleIds.length
      ? new Map((await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]))
      : new Map<string, string>();
    const stepIds = [...new Set(rows.map((r) => r.investigationStepId).filter((x): x is string => !!x))];
    const stepLabels = stepIds.length
      ? new Map((await this.prisma.incidentInvestigationStep.findMany({ where: { id: { in: stepIds } }, select: { id: true, statement: true } })).map((s) => [s.id, s.statement]))
      : new Map<string, string>();
    const now = Date.now();
    return rows.map((r) => {
      const open = r.status === "OPEN" || r.status === "IN_PROGRESS";
      return {
        id: r.id,
        code: incidentActionCode(r.number),
        incidentId: r.incidentId,
        kind: r.kind,
        title: r.title,
        description: r.description,
        mandatory: r.mandatory,
        responsibleId: r.responsibleId,
        responsibleName: r.responsibleId ? userNames.get(r.responsibleId) ?? null : null,
        responsibleRoleId: r.responsibleRoleId,
        responsibleRoleName: r.responsibleRoleId ? roleNames.get(r.responsibleRoleId) ?? null : null,
        dueAt: r.dueAt?.toISOString() ?? null,
        status: r.status,
        overdue: open && !!r.dueAt && r.dueAt.getTime() < now,
        completedAt: r.completedAt?.toISOString() ?? null,
        completedById: r.completedById,
        completedByName: r.completedById ? userNames.get(r.completedById) ?? null : null,
        completionNote: r.completionNote,
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        verifiedById: r.verifiedById,
        verifiedByName: r.verifiedById ? userNames.get(r.verifiedById) ?? null : null,
        effectivenessOutcome: r.effectivenessOutcome,
        verificationNote: r.verificationNote,
        investigationStepId: r.investigationStepId,
        investigationStepLabel: r.investigationStepId ? stepLabels.get(r.investigationStepId) ?? null : null,
        canceledAt: r.canceledAt?.toISOString() ?? null,
        cancelReason: r.cancelReason,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  private async loadAction(id: string): Promise<IncidentActionRow> {
    const row = await this.prisma.incidentAction.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Acción no encontrada");
    return row;
  }

  private async loadIncident(id: string): Promise<{ id: string; orgNodeId: string; lifecycle: string }> {
    const row = await this.prisma.incident.findUnique({ where: { id }, select: { id: true, orgNodeId: true, lifecycle: true } });
    if (!row) throw new NotFoundException("Incidencia no encontrada");
    return row;
  }

  private async addActivity(incidentId: string, kind: string, summary: string, ctx: AuditContext, metadata?: Record<string, unknown>): Promise<void> {
    await this.prisma.incidentActivity.create({
      data: { incidentId, kind, summary, actorId: ctx.actorId ?? null, actorName: null, metadata: (metadata ?? null) as Prisma.InputJsonValue },
    });
  }

  private async resolveUserNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("La incidencia está fuera de su alcance");
    }
  }

  private async assertUserExists(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException("El usuario responsable no existe");
  }

  private async assertRoleExists(roleId: string): Promise<void> {
    const r = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!r) throw new BadRequestException("El rol responsable no existe");
  }

  /** La causa raíz ligada debe pertenecer a la investigación de ESTA incidencia. */
  private async assertStepBelongsToIncident(stepId: string, incidentId: string): Promise<void> {
    const step = await this.prisma.incidentInvestigationStep.findUnique({
      where: { id: stepId },
      select: { investigation: { select: { incidentId: true } } },
    });
    if (!step || step.investigation.incidentId !== incidentId) {
      throw new BadRequestException("La causa raíz indicada no pertenece a esta incidencia");
    }
  }

  private snapshot(row: IncidentActionRow): Prisma.InputJsonValue {
    return { title: row.title, kind: row.kind, mandatory: row.mandatory, status: row.status, responsibleId: row.responsibleId };
  }
}

type IncidentActionRow = Prisma.IncidentActionGetPayload<Record<string, never>>;
