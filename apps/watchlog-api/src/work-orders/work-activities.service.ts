import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  blockingActivitiesForClose,
  planReadyToFreeze,
  type CreateWorkActivitiesBatchRequest,
  type CreateWorkActivityRequest,
  type ReorderWorkActivitiesRequest,
  type UpdateWorkActivityRequest,
  type WorkActivityDto,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";

/** Cliente de transacción (o el prisma normal) para las operaciones que corren dentro de la tx del ejecutor. */
type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Plan de actividades de una OT (Sesión 4 — Puerta 3). `WorkActivity` es una entidad
 * PROPIA (fork W1). El plan se arma en la fase Planificación; al autorizar el plan
 * (Puerta 3) se CONGELA la baseline (planned* → baseline*) para medir desviación.
 *
 * Las mutaciones del plan (crear/editar/reordenar/eliminar) sólo se permiten ANTES de
 * congelar (`planFrozenAt == null`) y con la OT abierta; una vez congelado, el plan es
 * la línea base (el avance real llega en S5). ABAC por nodo heredado de la OT.
 *
 * Guards PUROS (contracts) invocados por el ejecutor de flujo (WorkOrdersService):
 *  - `planReadyToFreeze` (≥1 actividad no cancelada) antes de autorizar el plan;
 *  - `blockingActivitiesForClose` (mandatory abiertas) antes de cerrar (Puerta 4).
 */
@Injectable()
export class WorkActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  // === Lectura ===============================================================

  async listForWorkOrder(userId: string, workOrderId: string): Promise<WorkActivityDto[]> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    return this.loadActivityDtos(workOrderId);
  }

  // === Mutaciones del plan ===================================================

  async create(userId: string, workOrderId: string, dto: CreateWorkActivityRequest, ctx: AuditContext): Promise<WorkActivityDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertEditable(wo);
    await this.validateRefs(workOrderId, dto, null);
    const nextSeq = await this.nextSequence(workOrderId);
    const row = await this.prisma.workActivity.create({
      data: { ...this.toData(dto), workOrderId, sequence: nextSeq, createdById: userId, updatedById: userId },
    });
    await this.addEvent(workOrderId, "ACTIVITY_ADDED", `Actividad agregada: ${row.title}`, userId, { activityId: row.id });
    await this.audit.record({ ...ctx, action: "workactivity.created", entityType: "WorkActivity", entityId: row.id, after: { workOrderId, title: row.title } });
    return (await this.loadActivityDtos(workOrderId)).find((a) => a.id === row.id)!;
  }

  /** Crea varias actividades de una vez (lo usa el ASISTENTE guiado). Secuencia continua. */
  async createBatch(userId: string, workOrderId: string, dto: CreateWorkActivitiesBatchRequest, ctx: AuditContext): Promise<WorkActivityDto[]> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertEditable(wo);
    for (const a of dto.activities) await this.validateRefs(workOrderId, a, null);
    let seq = await this.nextSequence(workOrderId);
    const created: string[] = [];
    for (const a of dto.activities) {
      const row = await this.prisma.workActivity.create({
        data: { ...this.toData(a), workOrderId, sequence: seq++, createdById: userId, updatedById: userId },
      });
      created.push(row.id);
    }
    await this.addEvent(workOrderId, "ACTIVITY_ADDED", `Plan generado con el asistente: ${created.length} actividad(es)`, userId, { count: created.length });
    await this.audit.record({ ...ctx, action: "workactivity.batch_created", entityType: "WorkOrder", entityId: workOrderId, after: { count: created.length } });
    return this.loadActivityDtos(workOrderId);
  }

  async update(userId: string, workOrderId: string, activityId: string, dto: UpdateWorkActivityRequest, ctx: AuditContext): Promise<WorkActivityDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertEditable(wo);
    const before = await this.loadActivity(workOrderId, activityId);
    await this.validateRefs(workOrderId, dto, activityId);
    await this.prisma.workActivity.update({
      where: { id: activityId },
      data: {
        title: dto.title === undefined ? undefined : dto.title,
        description: dto.description === undefined ? undefined : dto.description,
        responsibleId: dto.responsibleId === undefined ? undefined : dto.responsibleId,
        specialtyId: dto.specialtyId === undefined ? undefined : dto.specialtyId,
        plannedStart: dto.plannedStart === undefined ? undefined : dto.plannedStart ? new Date(dto.plannedStart) : null,
        plannedEnd: dto.plannedEnd === undefined ? undefined : dto.plannedEnd ? new Date(dto.plannedEnd) : null,
        mandatory: dto.mandatory === undefined ? undefined : dto.mandatory,
        priority: dto.priority === undefined ? undefined : dto.priority,
        dependsOnId: dto.dependsOnId === undefined ? undefined : dto.dependsOnId,
        status: dto.status === undefined ? undefined : dto.status,
        updatedById: userId,
      },
    });
    await this.audit.record({ ...ctx, action: "workactivity.updated", entityType: "WorkActivity", entityId: activityId, before: { title: before.title, status: before.status }, after: { title: dto.title ?? before.title } });
    return (await this.loadActivityDtos(workOrderId)).find((a) => a.id === activityId)!;
  }

  async remove(userId: string, workOrderId: string, activityId: string, ctx: AuditContext): Promise<void> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertEditable(wo);
    const act = await this.loadActivity(workOrderId, activityId);
    // onDelete: SetNull en dependsOn ⇒ las dependientes quedan sin predecesora (no rompe).
    await this.prisma.workActivity.delete({ where: { id: activityId } });
    await this.addEvent(workOrderId, "ACTIVITY_REMOVED", `Actividad eliminada: ${act.title}`, userId, { activityId });
    await this.audit.record({ ...ctx, action: "workactivity.removed", entityType: "WorkActivity", entityId: activityId });
  }

  async reorder(userId: string, workOrderId: string, dto: ReorderWorkActivitiesRequest, ctx: AuditContext): Promise<WorkActivityDto[]> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertEditable(wo);
    const rows = await this.prisma.workActivity.findMany({ where: { workOrderId }, select: { id: true } });
    const known = new Set(rows.map((r) => r.id));
    if (dto.orderedIds.length !== known.size || !dto.orderedIds.every((id) => known.has(id))) {
      throw new BadRequestException("La lista de orden debe contener exactamente las actividades de la OT");
    }
    await this.prisma.$transaction(dto.orderedIds.map((id, idx) => this.prisma.workActivity.update({ where: { id }, data: { sequence: idx, updatedById: userId } })));
    await this.audit.record({ ...ctx, action: "workactivity.reordered", entityType: "WorkOrder", entityId: workOrderId, after: { order: dto.orderedIds } });
    return this.loadActivityDtos(workOrderId);
  }

  // === Guards + freeze (invocados por el ejecutor de flujo) ==================

  /** Puerta 3: exige ≥1 actividad no cancelada antes de autorizar/congelar el plan. */
  async assertPlanReadyToFreeze(workOrderId: string): Promise<void> {
    const rows = await this.prisma.workActivity.findMany({ where: { workOrderId }, select: { status: true } });
    if (!planReadyToFreeze(rows)) {
      throw new BadRequestException("No se puede autorizar el plan: agregue al menos una actividad al plan de trabajo.");
    }
  }

  /** Puerta 4: impide cerrar si hay actividades `mandatory` abiertas (no DONE/CANCELED). */
  async assertActivitiesComplete(workOrderId: string): Promise<void> {
    const rows = await this.prisma.workActivity.findMany({ where: { workOrderId }, select: { mandatory: true, status: true } });
    const blocking = blockingActivitiesForClose(rows);
    if (blocking.length > 0) {
      throw new BadRequestException(`No se puede cerrar: ${blocking.length} actividad(es) obligatoria(s) del plan sin completar.`);
    }
  }

  /**
   * CONGELA la baseline del plan (copia planned* → baseline*) dentro de la transacción
   * del ejecutor. Idempotente (sólo copia las que aún no tienen baseline). Devuelve
   * cuántas se congelaron. NO setea `WorkOrder.planFrozenAt` (lo hace el ejecutor en el
   * mismo update de estado).
   */
  async freezeBaselineWithinTx(tx: Tx, workOrderId: string): Promise<number> {
    const rows = await tx.workActivity.findMany({
      where: { workOrderId, status: { not: "CANCELED" }, baselineStart: null, baselineEnd: null },
      select: { id: true, plannedStart: true, plannedEnd: true },
    });
    for (const r of rows) {
      await tx.workActivity.update({ where: { id: r.id }, data: { baselineStart: r.plannedStart, baselineEnd: r.plannedEnd } });
    }
    return rows.length;
  }

  // === Helpers ================================================================

  /** Campos comunes de creación (sin workOrderId/sequence/auditoría, los pone el llamador). */
  private toData(dto: CreateWorkActivityRequest) {
    return {
      title: dto.title,
      description: dto.description ?? null,
      responsibleId: dto.responsibleId ?? null,
      specialtyId: dto.specialtyId ?? null,
      plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
      plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : null,
      mandatory: dto.mandatory ?? true,
      priority: dto.priority ?? null,
      dependsOnId: dto.dependsOnId ?? null,
    } satisfies Partial<Prisma.WorkActivityUncheckedCreateInput>;
  }

  private assertEditable(wo: { lifecycle: string; planFrozenAt: Date | null }): void {
    if (wo.lifecycle === "CLOSED" || wo.lifecycle === "CANCELED") {
      throw new BadRequestException("La orden de trabajo ya está cerrada o anulada");
    }
    if (wo.planFrozenAt) {
      throw new BadRequestException("El plan ya fue autorizado (baseline congelada): no se puede modificar el plan.");
    }
  }

  /** Valida responsable/especialidad/dependencia (misma OT, sin auto-referencia). */
  private async validateRefs(workOrderId: string, dto: { responsibleId?: string | null; specialtyId?: string | null; dependsOnId?: string | null }, selfId: string | null): Promise<void> {
    if (dto.responsibleId) {
      const u = await this.prisma.user.findUnique({ where: { id: dto.responsibleId }, select: { id: true } });
      if (!u) throw new BadRequestException("El responsable indicado no existe");
    }
    if (dto.specialtyId) {
      const s = await this.prisma.specialty.findFirst({ where: { id: dto.specialtyId, deletedAt: null, active: true }, select: { id: true } });
      if (!s) throw new BadRequestException("La especialidad indicada no existe o está inactiva");
    }
    if (dto.dependsOnId) {
      if (dto.dependsOnId === selfId) throw new BadRequestException("Una actividad no puede depender de sí misma");
      const dep = await this.prisma.workActivity.findFirst({ where: { id: dto.dependsOnId, workOrderId }, select: { id: true } });
      if (!dep) throw new BadRequestException("La actividad predecesora no pertenece a esta OT");
    }
  }

  private async nextSequence(workOrderId: string): Promise<number> {
    const max = await this.prisma.workActivity.aggregate({ where: { workOrderId }, _max: { sequence: true } });
    return (max._max.sequence ?? -1) + 1;
  }

  private async loadWorkOrder(id: string): Promise<{ id: string; orgNodeId: string; lifecycle: string; planFrozenAt: Date | null }> {
    const row = await this.prisma.workOrder.findFirst({ where: { id, deletedAt: null }, select: { id: true, orgNodeId: true, lifecycle: true, planFrozenAt: true } });
    if (!row) throw new NotFoundException("Orden de trabajo no encontrada");
    return row;
  }

  private async loadActivity(workOrderId: string, activityId: string): Promise<Prisma.WorkActivityGetPayload<object>> {
    const row = await this.prisma.workActivity.findUnique({ where: { id: activityId } });
    if (!row || row.workOrderId !== workOrderId) throw new NotFoundException("Actividad no encontrada en la orden de trabajo");
    return row;
  }

  private async loadActivityDtos(workOrderId: string): Promise<WorkActivityDto[]> {
    const rows = await this.prisma.workActivity.findMany({
      where: { workOrderId },
      include: { specialty: { select: { name: true } } },
      orderBy: [{ sequence: "asc" }, { createdAt: "asc" }],
    });
    const userNames = await this.resolveUserNames(rows.map((r) => r.responsibleId));
    return rows.map((r) => ({
      id: r.id,
      workOrderId: r.workOrderId,
      title: r.title,
      description: r.description,
      sequence: r.sequence,
      responsibleId: r.responsibleId,
      responsibleName: r.responsibleId ? userNames.get(r.responsibleId) ?? null : null,
      responsibleRoleId: r.responsibleRoleId,
      specialtyId: r.specialtyId,
      specialtyName: r.specialty?.name ?? null,
      plannedStart: r.plannedStart?.toISOString() ?? null,
      plannedEnd: r.plannedEnd?.toISOString() ?? null,
      baselineStart: r.baselineStart?.toISOString() ?? null,
      baselineEnd: r.baselineEnd?.toISOString() ?? null,
      actualStart: r.actualStart?.toISOString() ?? null,
      actualEnd: r.actualEnd?.toISOString() ?? null,
      progressPct: r.progressPct,
      status: r.status,
      mandatory: r.mandatory,
      dependsOnId: r.dependsOnId,
      priority: r.priority,
      delayReason: r.delayReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
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

  private async resolveUserNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }
}
