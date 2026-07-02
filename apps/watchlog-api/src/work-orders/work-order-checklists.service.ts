import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  applicableChecklistRules,
  blockingChecklistsForClose,
  formatEntryFolio,
  type AddWorkOrderChecklistRequest,
  type ReviewWorkOrderChecklistRequest,
  type UpsertWorkOrderChecklistRuleRequest,
  type WorkOrderChecklistDto,
  type WorkOrderChecklistRuleDto,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { LogEntriesService } from "../log-entries/log-entries.service";

/**
 * Checklists / Permisos de Trabajo (PTW) de una OT — Sesión 3 (Puerta 2). NO se
 * reinventa un motor de checklists: cada checklist ES una plantilla del Form Builder
 * (`Template`) instanciada como `LogEntry` vivo (fork W5). Dos capas:
 *
 *  - Capa A · diseño: `WorkOrderChecklistRule` (plantilla + reglas de aplicabilidad,
 *    patrón `ReportingObligation`). Gobernada por `workordercatalog:manage`.
 *  - Capa B · operación: `WorkOrderChecklist` (enlace OT↔plantilla + su LogEntry +
 *    estado). Gobernada por `workorder:checklist:manage`.
 *
 * Al ENTRAR al estado de preparación el ejecutor de flujo llama `materializeForWorkOrder`
 * (sugerencia automática, idempotente). La Puerta 2 (`assertChecklistsComplete`) bloquea
 * el avance si algún checklist obligatorio no está APROBADO; el revisor debe ser distinto
 * del responsable (segregación de funciones). ABAC por nodo ∩ estructura heredado de la OT.
 */
@Injectable()
export class WorkOrderChecklistsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly logEntries: LogEntriesService,
  ) {}

  // === Capa A · catálogo de reglas ===========================================

  async listRules(includeInactive = false): Promise<WorkOrderChecklistRuleDto[]> {
    const rows = await this.prisma.workOrderChecklistRule.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return this.toRuleDtos(rows);
  }

  async upsertRule(dto: UpsertWorkOrderChecklistRuleRequest, ctx: AuditContext): Promise<WorkOrderChecklistRuleDto> {
    // La plantilla debe existir y estar PUBLICADA (sólo así podrá instanciarse).
    const template = await this.prisma.template.findFirst({ where: { id: dto.templateId, deletedAt: null }, select: { id: true, status: true } });
    if (!template) throw new BadRequestException("La plantilla indicada no existe");
    if (template.status !== "PUBLISHED") throw new BadRequestException("La plantilla del checklist debe estar publicada");
    if (dto.appliesToTypeIds && dto.appliesToTypeIds.length > 0) {
      const found = await this.prisma.workOrderType.count({ where: { id: { in: dto.appliesToTypeIds }, deletedAt: null } });
      if (found !== new Set(dto.appliesToTypeIds).size) throw new BadRequestException("Uno o más tipos de OT indicados no existen");
    }
    if (dto.specialtyId) {
      const spec = await this.prisma.specialty.findFirst({ where: { id: dto.specialtyId, deletedAt: null }, select: { id: true } });
      if (!spec) throw new BadRequestException("La especialidad indicada no existe");
    }
    const data = {
      name: dto.name,
      templateId: dto.templateId,
      mandatory: dto.mandatory ?? false,
      appliesToTypeIds: dto.appliesToTypeIds ?? [],
      minCriticality: dto.minCriticality ?? null,
      specialtyId: dto.specialtyId ?? null,
      requiresPtw: dto.requiresPtw ?? null,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const row = dto.id
      ? await this.prisma.workOrderChecklistRule.update({ where: { id: dto.id }, data })
      : await this.prisma.workOrderChecklistRule.create({ data });
    await this.audit.record({ ...ctx, action: "workorderchecklistrule.upserted", entityType: "WorkOrderChecklistRule", entityId: row.id, after: { name: row.name, templateId: row.templateId, mandatory: row.mandatory } });
    return (await this.toRuleDtos([row]))[0]!;
  }

  async deleteRule(id: string, ctx: AuditContext): Promise<void> {
    const row = await this.prisma.workOrderChecklistRule.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!row) throw new NotFoundException("Regla de checklist no encontrada");
    await this.prisma.workOrderChecklistRule.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await this.audit.record({ ...ctx, action: "workorderchecklistrule.deleted", entityType: "WorkOrderChecklistRule", entityId: id });
  }

  // === Capa B · checklists de una OT =========================================

  async listForWorkOrder(userId: string, workOrderId: string): Promise<WorkOrderChecklistDto[]> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    return this.loadChecklistDtos(workOrderId);
  }

  /**
   * Endpoint de re-derivación manual: sugiere (materializa) los checklists aplicables
   * a la OT que aún no existan. ABAC + idempotente. Devuelve la lista completa.
   */
  async suggest(userId: string, workOrderId: string, ctx: AuditContext): Promise<WorkOrderChecklistDto[]> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    await this.materializeForWorkOrder(workOrderId, ctx.actorId ?? userId);
    return this.loadChecklistDtos(workOrderId);
  }

  /**
   * Materializa (crea) los `WorkOrderChecklist` de las reglas APLICABLES que aún no
   * existan en la OT. Idempotente (no duplica por el @@unique OT×plantilla). SIN ABAC
   * (lo llama el ejecutor de flujo, que ya autorizó). Devuelve cuántos se crearon.
   */
  async materializeForWorkOrder(workOrderId: string, actorId: string | null): Promise<number> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { id: true, typeId: true, criticality: true, requiresPtw: true, specialties: { select: { specialtyId: true } } },
    });
    if (!wo) return 0;
    const rules = await this.prisma.workOrderChecklistRule.findMany({ where: { deletedAt: null, active: true } });
    const applicable = applicableChecklistRules(
      { typeId: wo.typeId, criticality: wo.criticality, requiresPtw: wo.requiresPtw, specialtyIds: wo.specialties.map((s) => s.specialtyId) },
      rules,
    );
    if (applicable.length === 0) return 0;
    const existing = await this.prisma.workOrderChecklist.findMany({ where: { workOrderId }, select: { templateId: true } });
    const have = new Set(existing.map((c) => c.templateId));
    let created = 0;
    for (const rule of applicable) {
      if (have.has(rule.templateId)) continue;
      have.add(rule.templateId);
      const row = await this.prisma.workOrderChecklist.create({
        data: { workOrderId, templateId: rule.templateId, sourceRuleId: rule.id, mandatory: rule.mandatory, status: "PENDING", addedById: actorId },
      });
      await this.addEvent(workOrderId, "CHECKLIST_ADDED", `Checklist sugerido: ${rule.name}${rule.mandatory ? " (obligatorio)" : ""}`, actorId, { checklistId: row.id, sourceRuleId: rule.id, mandatory: rule.mandatory });
      created++;
    }
    return created;
  }

  /** Agrega manualmente un checklist (plantilla) a la OT (no obligatorio, sin regla). */
  async addManual(userId: string, workOrderId: string, dto: AddWorkOrderChecklistRequest, ctx: AuditContext): Promise<WorkOrderChecklistDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertActive(wo);
    const template = await this.prisma.template.findFirst({ where: { id: dto.templateId, deletedAt: null }, select: { id: true, name: true, status: true } });
    if (!template) throw new BadRequestException("La plantilla indicada no existe");
    if (template.status !== "PUBLISHED") throw new BadRequestException("La plantilla del checklist debe estar publicada");
    const dup = await this.prisma.workOrderChecklist.findFirst({ where: { workOrderId, templateId: dto.templateId }, select: { id: true } });
    if (dup) throw new BadRequestException("Esta OT ya tiene ese checklist");
    const row = await this.prisma.workOrderChecklist.create({
      data: { workOrderId, templateId: dto.templateId, sourceRuleId: null, mandatory: false, status: "PENDING", addedById: userId },
    });
    await this.addEvent(workOrderId, "CHECKLIST_ADDED", `Checklist agregado: ${template.name}`, userId, { checklistId: row.id, manual: true });
    await this.audit.record({ ...ctx, action: "workorderchecklist.added", entityType: "WorkOrder", entityId: workOrderId, after: { checklistId: row.id, templateId: dto.templateId } });
    return (await this.loadChecklistDtos(workOrderId)).find((c) => c.id === row.id)!;
  }

  /** Quita un checklist NO obligatorio de la OT (los obligatorios no se pueden quitar). */
  async remove(userId: string, workOrderId: string, checklistId: string, ctx: AuditContext): Promise<void> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    const cl = await this.loadChecklist(workOrderId, checklistId);
    if (cl.mandatory) throw new BadRequestException("Un checklist obligatorio no puede quitarse");
    await this.prisma.workOrderChecklist.delete({ where: { id: checklistId } });
    await this.addEvent(workOrderId, "CHECKLIST_REMOVED", `Checklist quitado`, userId, { checklistId });
    await this.audit.record({ ...ctx, action: "workorderchecklist.removed", entityType: "WorkOrder", entityId: workOrderId, after: { checklistId } });
  }

  /**
   * Instancia el checklist como `LogEntry` vivo (reusa el flujo de llenado del Form
   * Builder). El actor queda como responsable. Válido desde PENDING o REJECTED (re-hacer
   * un rechazado abre un LogEntry nuevo). El equipo NO se propaga (el nodo carga el ABAC).
   */
  async instantiate(userId: string, workOrderId: string, checklistId: string, ctx: AuditContext): Promise<WorkOrderChecklistDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertActive(wo);
    const cl = await this.loadChecklist(workOrderId, checklistId);
    if (cl.status !== "PENDING" && cl.status !== "REJECTED") {
      throw new BadRequestException("El checklist ya fue instanciado");
    }
    // Reusa el motor de LogEntry (valida plantilla publicada, ABAC nodo×plantilla,
    // asignación de nodo y gobernanza de equipo). El LogEntry nace DRAFT.
    const entry = await this.logEntries.create(userId, { templateId: cl.templateId, orgNodeId: wo.orgNodeId }, ctx);
    await this.prisma.workOrderChecklist.update({
      where: { id: checklistId },
      data: { logEntryId: entry.id, status: "IN_PROGRESS", responsibleId: userId, reviewerId: null, reviewedAt: null, rejectReason: null },
    });
    await this.addEvent(workOrderId, "CHECKLIST_STARTED", `Checklist iniciado (${formatEntryFolio(entry.entryNumber)})`, userId, { checklistId, logEntryId: entry.id });
    await this.audit.record({ ...ctx, action: "workorderchecklist.instantiated", entityType: "WorkOrder", entityId: workOrderId, after: { checklistId, logEntryId: entry.id } });
    return (await this.loadChecklistDtos(workOrderId)).find((c) => c.id === checklistId)!;
  }

  /** Envía el checklist a revisión: exige el LogEntry SELLADO (completo + firmado). */
  async submit(userId: string, workOrderId: string, checklistId: string, ctx: AuditContext): Promise<WorkOrderChecklistDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    const cl = await this.loadChecklist(workOrderId, checklistId);
    if (cl.status !== "IN_PROGRESS") throw new BadRequestException("El checklist no está en llenado");
    if (!cl.logEntryId) throw new BadRequestException("El checklist no tiene una instancia iniciada");
    const entry = await this.prisma.logEntry.findUnique({ where: { id: cl.logEntryId }, select: { status: true } });
    if (!entry || entry.status !== "SUBMITTED") {
      throw new BadRequestException("Complete y selle el registro del checklist antes de enviarlo a revisión");
    }
    await this.prisma.workOrderChecklist.update({ where: { id: checklistId }, data: { status: "SUBMITTED" } });
    await this.addEvent(workOrderId, "CHECKLIST_SUBMITTED", `Checklist enviado a revisión`, userId, { checklistId });
    await this.audit.record({ ...ctx, action: "workorderchecklist.submitted", entityType: "WorkOrder", entityId: workOrderId, after: { checklistId } });
    return (await this.loadChecklistDtos(workOrderId)).find((c) => c.id === checklistId)!;
  }

  /** Revisa (aprueba/rechaza) un checklist enviado. Segregación: revisor ≠ responsable. */
  async review(userId: string, workOrderId: string, checklistId: string, dto: ReviewWorkOrderChecklistRequest, ctx: AuditContext): Promise<WorkOrderChecklistDto> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    const cl = await this.loadChecklist(workOrderId, checklistId);
    if (cl.status !== "SUBMITTED") throw new BadRequestException("El checklist no está en revisión");
    // Segregación de funciones: quien revisa no puede ser quien completó el checklist.
    if (cl.responsibleId && cl.responsibleId === userId) {
      throw new ForbiddenException("El revisor debe ser distinto de quien completó el checklist (segregación de funciones)");
    }
    if (dto.decision === "REJECT" && !dto.reason?.trim()) throw new BadRequestException("El rechazo exige un motivo");
    const now = new Date();
    const approved = dto.decision === "APPROVE";
    await this.prisma.workOrderChecklist.update({
      where: { id: checklistId },
      data: { status: approved ? "APPROVED" : "REJECTED", reviewerId: userId, reviewedAt: now, rejectReason: approved ? null : dto.reason!.trim() },
    });
    await this.addEvent(
      workOrderId,
      approved ? "CHECKLIST_APPROVED" : "CHECKLIST_REJECTED",
      approved ? `Checklist aprobado` : `Checklist rechazado · Motivo: ${dto.reason!.trim()}`,
      userId,
      { checklistId },
    );
    await this.audit.record({ ...ctx, action: approved ? "workorderchecklist.approved" : "workorderchecklist.rejected", entityType: "WorkOrder", entityId: workOrderId, after: { checklistId, reason: approved ? null : dto.reason } });
    return (await this.loadChecklistDtos(workOrderId)).find((c) => c.id === checklistId)!;
  }

  // === Guard de Puerta 2 (lo invoca el ejecutor de flujo) ====================

  /** Impide entrar al estado-puerta si hay checklists OBLIGATORIOS sin APROBAR. */
  async assertChecklistsComplete(workOrderId: string): Promise<void> {
    const checklists = await this.prisma.workOrderChecklist.findMany({ where: { workOrderId, mandatory: true }, select: { mandatory: true, status: true } });
    const blocking = blockingChecklistsForClose(checklists);
    if (blocking.length > 0) {
      throw new BadRequestException(`No se puede avanzar la Puerta 2: ${blocking.length} checklist(s) obligatorio(s) sin aprobar.`);
    }
  }

  // === Helpers ================================================================

  private async toRuleDtos(rows: Prisma.WorkOrderChecklistRuleGetPayload<object>[]): Promise<WorkOrderChecklistRuleDto[]> {
    const templateIds = [...new Set(rows.map((r) => r.templateId))];
    const specialtyIds = [...new Set(rows.map((r) => r.specialtyId).filter((x): x is string => !!x))];
    const typeIds = [...new Set(rows.flatMap((r) => r.appliesToTypeIds))];
    const [templates, specialties, types] = await Promise.all([
      templateIds.length ? this.prisma.template.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      specialtyIds.length ? this.prisma.specialty.findMany({ where: { id: { in: specialtyIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      typeIds.length ? this.prisma.workOrderType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const tName = new Map(templates.map((t) => [t.id, t.name]));
    const sName = new Map(specialties.map((s) => [s.id, s.name]));
    const tyName = new Map(types.map((t) => [t.id, t.name]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      templateId: r.templateId,
      templateName: tName.get(r.templateId) ?? null,
      mandatory: r.mandatory,
      appliesToTypeIds: r.appliesToTypeIds,
      appliesToTypeNames: r.appliesToTypeIds.map((id) => tyName.get(id)).filter((n): n is string => !!n),
      minCriticality: r.minCriticality,
      specialtyId: r.specialtyId,
      specialtyName: r.specialtyId ? sName.get(r.specialtyId) ?? null : null,
      requiresPtw: r.requiresPtw,
      active: r.active,
      sortOrder: r.sortOrder,
    }));
  }

  private async loadChecklistDtos(workOrderId: string): Promise<WorkOrderChecklistDto[]> {
    const rows = await this.prisma.workOrderChecklist.findMany({
      where: { workOrderId },
      include: {
        template: { select: { name: true } },
        rule: { select: { name: true } },
        logEntry: { select: { entryNumber: true, status: true } },
      },
      orderBy: [{ mandatory: "desc" }, { createdAt: "asc" }],
    });
    const userNames = await this.resolveUserNames(rows.flatMap((r) => [r.responsibleId, r.reviewerId]));
    return rows.map((r) => ({
      id: r.id,
      workOrderId: r.workOrderId,
      templateId: r.templateId,
      templateName: r.template?.name ?? null,
      logEntryId: r.logEntryId,
      logEntryCode: r.logEntry ? formatEntryFolio(r.logEntry.entryNumber) : null,
      logEntrySealed: r.logEntry?.status === "SUBMITTED",
      sourceRuleId: r.sourceRuleId,
      ruleName: r.rule?.name ?? null,
      mandatory: r.mandatory,
      status: r.status,
      responsibleId: r.responsibleId,
      responsibleName: r.responsibleId ? userNames.get(r.responsibleId) ?? null : null,
      reviewerId: r.reviewerId,
      reviewerName: r.reviewerId ? userNames.get(r.reviewerId) ?? null : null,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      rejectReason: r.rejectReason,
      addedById: r.addedById,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async loadWorkOrder(id: string): Promise<{ id: string; orgNodeId: string; lifecycle: string }> {
    const row = await this.prisma.workOrder.findFirst({ where: { id, deletedAt: null }, select: { id: true, orgNodeId: true, lifecycle: true } });
    if (!row) throw new NotFoundException("Orden de trabajo no encontrada");
    return row;
  }

  private async loadChecklist(workOrderId: string, checklistId: string): Promise<Prisma.WorkOrderChecklistGetPayload<object>> {
    const cl = await this.prisma.workOrderChecklist.findUnique({ where: { id: checklistId } });
    if (!cl || cl.workOrderId !== workOrderId) throw new NotFoundException("Checklist no encontrado en la orden de trabajo");
    return cl;
  }

  private assertActive(wo: { lifecycle: string }): void {
    if (wo.lifecycle === "CLOSED" || wo.lifecycle === "CANCELED") {
      throw new BadRequestException("La orden de trabajo ya está cerrada o anulada");
    }
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
