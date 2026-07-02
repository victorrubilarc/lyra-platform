import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  applicableChecklistRules,
  applicableExecutionRulesForActivity,
  blockingChecklistsForMoment,
  blockingExecutionChecklistsForActivity,
  formatEntryFolio,
  DEFAULT_WORK_ORDER_CHECKLIST_SUGGEST_STATE_KEY,
  DEFAULT_WORK_ORDER_CLOSURE_CHECKLIST_SUGGEST_STATE_KEY,
  DEFAULT_WORK_ORDER_EXECUTE_STATE_KEY,
  type AddWorkOrderChecklistRequest,
  type ReviewWorkOrderChecklistRequest,
  type UpsertWorkOrderChecklistRuleRequest,
  type WorkOrderChecklistDto,
  type WorkOrderChecklistMoment,
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
      moment: dto.moment ?? "AUTHORIZATION",
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
   * al ESTADO ACTUAL de la OT que aún no existan. ABAC + idempotente. Reusa la MISMA
   * orquestación que el ejecutor de flujo (`materializeForState`): en preparación deriva
   * los de autorización + el SET de ejecución por actividad; en revisión de cierre, los de cierre.
   */
  async suggest(userId: string, workOrderId: string, ctx: AuditContext): Promise<WorkOrderChecklistDto[]> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    const state = await this.prisma.workOrder.findFirst({ where: { id: workOrderId }, select: { currentStateKey: true } });
    if (state?.currentStateKey) await this.materializeForState(workOrderId, state.currentStateKey, ctx.actorId ?? userId);
    return this.loadChecklistDtos(workOrderId);
  }

  /**
   * Orquesta la materialización de checklists que corresponde a un ESTADO del flujo
   * (data-driven por las claves del tipo, paridad con folioOnStateKey). Lo invocan tanto
   * el ejecutor de flujo (al ENTRAR a un estado) como `suggest()` (re-derivación manual):
   *  - estado de preparación (`checklistSuggestStateKey`) ⇒ AUTORIZACIÓN + SET de EJECUCIÓN
   *    por actividad (Slice B; solo si el plan está congelado, así hay actividades fijas);
   *  - estado de ejecución (`executeStateKey`) ⇒ re-deriva el SET de ejecución (idempotente);
   *  - estado de revisión de cierre (`closureChecklistSuggestStateKey`) ⇒ CIERRE.
   */
  async materializeForState(workOrderId: string, stateKey: string, actorId: string | null): Promise<void> {
    const wo = await this.prisma.workOrder.findFirst({ where: { id: workOrderId }, select: { typeId: true, planFrozenAt: true } });
    if (!wo) return;
    const type = await this.prisma.workOrderType.findUnique({
      where: { id: wo.typeId },
      select: { checklistSuggestStateKey: true, executeStateKey: true, closureChecklistSuggestStateKey: true },
    });
    const suggestKey = type?.checklistSuggestStateKey ?? DEFAULT_WORK_ORDER_CHECKLIST_SUGGEST_STATE_KEY;
    const executeKey = type?.executeStateKey ?? DEFAULT_WORK_ORDER_EXECUTE_STATE_KEY;
    const closureKey = type?.closureChecklistSuggestStateKey ?? DEFAULT_WORK_ORDER_CLOSURE_CHECKLIST_SUGGEST_STATE_KEY;
    if (stateKey === closureKey) {
      await this.materializeForWorkOrder(workOrderId, "CLOSURE", actorId);
      return;
    }
    if (stateKey === suggestKey) {
      await this.materializeForWorkOrder(workOrderId, "AUTHORIZATION", actorId);
      if (wo.planFrozenAt) await this.materializeExecutionSet(workOrderId, actorId);
      return;
    }
    if (stateKey === executeKey && wo.planFrozenAt) {
      await this.materializeExecutionSet(workOrderId, actorId);
    }
  }

  /**
   * Deriva el MOMENTO de checklist a nivel-OT que corresponde al estado ACTUAL (para el
   * momento por defecto de un checklist manual). Data-driven por las claves del tipo.
   */
  private async momentForState(workOrderId: string): Promise<WorkOrderChecklistMoment> {
    const wo = await this.prisma.workOrder.findFirst({ where: { id: workOrderId }, select: { currentStateKey: true, typeId: true } });
    const type = wo ? await this.prisma.workOrderType.findUnique({ where: { id: wo.typeId }, select: { checklistSuggestStateKey: true, executeStateKey: true, closureChecklistSuggestStateKey: true } }) : null;
    const state = wo?.currentStateKey;
    if (state && state === (type?.closureChecklistSuggestStateKey ?? DEFAULT_WORK_ORDER_CLOSURE_CHECKLIST_SUGGEST_STATE_KEY)) return "CLOSURE";
    if (state && state === (type?.executeStateKey ?? DEFAULT_WORK_ORDER_EXECUTE_STATE_KEY)) return "EXECUTION";
    return "AUTHORIZATION";
  }

  /**
   * Materializa (crea) los `WorkOrderChecklist` de las reglas APLICABLES DE UN MOMENTO
   * que aún no existan en la OT. Idempotente (no duplica por el @@unique OT×plantilla).
   * SIN ABAC (lo llama el ejecutor de flujo, que ya autorizó). Devuelve cuántos se crearon.
   */
  async materializeForWorkOrder(workOrderId: string, moment: WorkOrderChecklistMoment, actorId: string | null): Promise<number> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { id: true, typeId: true, criticality: true, requiresPtw: true, specialties: { select: { specialtyId: true } } },
    });
    if (!wo) return 0;
    const rules = await this.prisma.workOrderChecklistRule.findMany({ where: { deletedAt: null, active: true, moment } });
    const applicable = applicableChecklistRules(
      { typeId: wo.typeId, criticality: wo.criticality, requiresPtw: wo.requiresPtw, specialtyIds: wo.specialties.map((s) => s.specialtyId) },
      rules,
    );
    if (applicable.length === 0) return 0;
    // Dedup sólo contra checklists de NIVEL-OT (workActivityId null): los de ejecución
    // (que cuelgan de una actividad) pueden usar la misma plantilla sin colisionar.
    const existing = await this.prisma.workOrderChecklist.findMany({ where: { workOrderId, workActivityId: null }, select: { templateId: true } });
    const have = new Set(existing.map((c) => c.templateId));
    let created = 0;
    for (const rule of applicable) {
      if (have.has(rule.templateId)) continue;
      have.add(rule.templateId);
      const row = await this.prisma.workOrderChecklist.create({
        data: { workOrderId, templateId: rule.templateId, moment, sourceRuleId: rule.id, mandatory: rule.mandatory, status: "PENDING", addedById: actorId },
      });
      await this.addEvent(workOrderId, "CHECKLIST_ADDED", `Checklist sugerido: ${rule.name}${rule.mandatory ? " (obligatorio)" : ""}`, actorId, { checklistId: row.id, sourceRuleId: rule.id, mandatory: rule.mandatory, moment });
      created++;
    }
    return created;
  }

  /**
   * Materializa el SET de checklists de EJECUCIÓN por ACTIVIDAD (Slice B, §11.4.2): para
   * cada actividad NO cancelada del plan congelado, crea una fila por cada regla EXECUTION
   * que matchee (aplicabilidad de OT ∩ especialidad de la actividad; regla sin especialidad
   * = todas). Idempotente por (plantilla, actividad). Los controles de terreno (LOTO físico,
   * toma-5) se aplican por tarea. Devuelve cuántos se crearon.
   */
  async materializeExecutionSet(workOrderId: string, actorId: string | null): Promise<number> {
    const wo = await this.prisma.workOrder.findFirst({
      where: { id: workOrderId, deletedAt: null },
      select: { id: true, typeId: true, criticality: true, requiresPtw: true },
    });
    if (!wo) return 0;
    const [rules, activities, existing] = await Promise.all([
      this.prisma.workOrderChecklistRule.findMany({ where: { deletedAt: null, active: true, moment: "EXECUTION" } }),
      this.prisma.workActivity.findMany({ where: { workOrderId, status: { not: "CANCELED" } }, select: { id: true, specialtyId: true } }),
      this.prisma.workOrderChecklist.findMany({ where: { workOrderId, moment: "EXECUTION" }, select: { templateId: true, workActivityId: true } }),
    ]);
    if (rules.length === 0 || activities.length === 0) return 0;
    // Clave de dedup por (plantilla, actividad): un checklist de terreno por regla y tarea.
    const have = new Set(existing.map((c) => `${c.templateId}::${c.workActivityId ?? ""}`));
    let created = 0;
    for (const activity of activities) {
      const applicable = applicableExecutionRulesForActivity({ typeId: wo.typeId, criticality: wo.criticality, requiresPtw: wo.requiresPtw }, activity, rules);
      for (const rule of applicable) {
        const key = `${rule.templateId}::${activity.id}`;
        if (have.has(key)) continue;
        have.add(key);
        const row = await this.prisma.workOrderChecklist.create({
          data: { workOrderId, templateId: rule.templateId, moment: "EXECUTION", workActivityId: activity.id, sourceRuleId: rule.id, mandatory: rule.mandatory, status: "PENDING", addedById: actorId },
        });
        await this.addEvent(workOrderId, "CHECKLIST_ADDED", `Verificación de ejecución sugerida: ${rule.name}${rule.mandatory ? " (obligatoria)" : ""}`, actorId, { checklistId: row.id, sourceRuleId: rule.id, mandatory: rule.mandatory, moment: "EXECUTION", workActivityId: activity.id });
        created++;
      }
    }
    // Si el set cambió (se agregaron filas obligatorias), invalida una confirmación previa
    // para forzar que el aprobador re-confirme "lo aplicado = lo autorizado".
    if (created > 0) await this.clearExecutionConfirmation(workOrderId, actorId);
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
    // Actividad destino (checklists de EJECUCIÓN, Slice B): debe pertenecer a la OT.
    if (dto.workActivityId) {
      const act = await this.prisma.workActivity.findFirst({ where: { id: dto.workActivityId, workOrderId }, select: { id: true } });
      if (!act) throw new BadRequestException("La actividad indicada no pertenece a esta orden de trabajo");
    }
    // El manual hereda el momento indicado; si se ancla a una actividad, es EJECUCIÓN. Si no,
    // el del estado actual (los manuales son SIEMPRE opcionales; la obligatoriedad vive en la regla).
    const moment = dto.workActivityId ? "EXECUTION" : dto.moment ?? (await this.momentForState(workOrderId));
    const dup = await this.prisma.workOrderChecklist.findFirst({ where: { workOrderId, templateId: dto.templateId, workActivityId: dto.workActivityId ?? null }, select: { id: true } });
    if (dup) throw new BadRequestException("Esta OT ya tiene ese checklist en esa actividad");
    const row = await this.prisma.workOrderChecklist.create({
      data: { workOrderId, templateId: dto.templateId, moment, workActivityId: dto.workActivityId ?? null, sourceRuleId: null, mandatory: false, status: "PENDING", addedById: userId },
    });
    await this.addEvent(workOrderId, "CHECKLIST_ADDED", `Checklist agregado: ${template.name}`, userId, { checklistId: row.id, manual: true, ...(dto.workActivityId ? { workActivityId: dto.workActivityId } : {}) });
    if (moment === "EXECUTION") await this.clearExecutionConfirmation(workOrderId, userId);
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
    // Curar el set de ejecución invalida una confirmación previa (Gobierno 2).
    if (cl.moment === "EXECUTION") await this.clearExecutionConfirmation(workOrderId, userId);
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

  // === Guard de puerta por MOMENTO (lo invoca el ejecutor de flujo, S5b) ======

  /**
   * Impide cruzar la puerta de un MOMENTO si hay checklists OBLIGATORIOS de ESE momento
   * sin APROBAR. AUTHORIZATION → al ENTRAR al estado-puerta (Puerta 2); CLOSURE → al
   * CERRAR (Puerta 4). Mensaje que EXPLICA qué falta (nombre de la plantilla). Data-driven.
   */
  async assertChecklistsCompleteForMoment(workOrderId: string, moment: WorkOrderChecklistMoment): Promise<void> {
    const checklists = await this.prisma.workOrderChecklist.findMany({
      where: { workOrderId, moment, mandatory: true },
      include: { template: { select: { name: true } } },
    });
    const blocking = blockingChecklistsForMoment(checklists, moment);
    if (blocking.length > 0) {
      const names = blocking.map((c) => c.template?.name ?? "verificación").join(", ");
      const label = moment === "CLOSURE" ? "cerrar" : "avanzar";
      throw new BadRequestException(`No se puede ${label}: falta aprobar ${blocking.length} verificación(es) obligatoria(s): ${names}.`);
    }
  }

  // === Gobierno 2 — set de EJECUCIÓN (Slice B) ================================

  /**
   * El aprobador CONFIRMA (Gobierno 2) el set de verificaciones de EJECUCIÓN que se
   * exigirá en terreno (derivado de las reglas EXECUTION, curable). Sella
   * `executionSetConfirmedAt/ById` ⇒ trazabilidad "lo aplicado = lo autorizado". Exige el
   * plan congelado y ≥1 checklist de ejecución (materializado). ABAC por nodo heredado.
   */
  async confirmExecutionSet(userId: string, workOrderId: string, ctx: AuditContext): Promise<WorkOrderChecklistDto[]> {
    const wo = await this.loadWorkOrder(workOrderId);
    await this.assertNodeAccess(userId, wo.orgNodeId);
    this.assertActive(wo);
    const full = await this.prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { planFrozenAt: true } });
    if (!full?.planFrozenAt) throw new BadRequestException("El plan aún no está autorizado: no hay set de ejecución que confirmar");
    const count = await this.prisma.workOrderChecklist.count({ where: { workOrderId, moment: "EXECUTION" } });
    if (count === 0) throw new BadRequestException("No hay verificaciones de ejecución para confirmar");
    const now = new Date();
    await this.prisma.workOrder.update({ where: { id: workOrderId }, data: { executionSetConfirmedAt: now, executionSetConfirmedById: userId } });
    await this.addEvent(workOrderId, "EXECUTION_SET_CONFIRMED", `Set de verificaciones de ejecución confirmado (${count})`, userId, { count });
    await this.audit.record({ ...ctx, action: "workorder.execution_set.confirmed", entityType: "WorkOrder", entityId: workOrderId, after: { count } });
    return this.loadChecklistDtos(workOrderId);
  }

  /** Invalida una confirmación previa del set de ejecución cuando el set cambia (curación). */
  private async clearExecutionConfirmation(workOrderId: string, actorId: string | null): Promise<void> {
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { executionSetConfirmedAt: true } });
    if (!wo?.executionSetConfirmedAt) return;
    await this.prisma.workOrder.update({ where: { id: workOrderId }, data: { executionSetConfirmedAt: null, executionSetConfirmedById: null } });
    await this.addEvent(workOrderId, "EXECUTION_SET_CHANGED", "El set de verificaciones de ejecución cambió: requiere volver a confirmarse", actorId);
  }

  /**
   * GATE de autorización del permiso (Gobierno 2): si la OT tiene verificaciones de
   * EJECUCIÓN materializadas, el aprobador debe haber CONFIRMADO el set antes de autorizar.
   * Sin reglas de ejecución ⇒ no exige nada (retrocompatible).
   */
  async assertExecutionSetConfirmed(workOrderId: string): Promise<void> {
    const count = await this.prisma.workOrderChecklist.count({ where: { workOrderId, moment: "EXECUTION" } });
    if (count === 0) return;
    const wo = await this.prisma.workOrder.findUnique({ where: { id: workOrderId }, select: { executionSetConfirmedAt: true } });
    if (!wo?.executionSetConfirmedAt) {
      throw new BadRequestException("Antes de autorizar el permiso, confirme el set de verificaciones de ejecución que se aplicará en terreno.");
    }
  }

  /**
   * GATE por actividad (Slice B): no se puede marcar una actividad DONE si tiene
   * verificaciones de EJECUCIÓN obligatorias sin aprobar (LOTO físico, toma-5). Lo invoca
   * `WorkActivitiesService.recordProgress` al completar. Mensaje que EXPLICA qué falta.
   */
  async assertActivityExecutionComplete(workOrderId: string, workActivityId: string): Promise<void> {
    const checklists = await this.prisma.workOrderChecklist.findMany({
      where: { workOrderId, workActivityId, moment: "EXECUTION", mandatory: true },
      include: { template: { select: { name: true } } },
    });
    const blocking = blockingExecutionChecklistsForActivity(checklists, workActivityId);
    if (blocking.length > 0) {
      const names = blocking.map((c) => c.template?.name ?? "verificación").join(", ");
      throw new BadRequestException(`No se puede completar la actividad: falta aprobar ${blocking.length} verificación(es) de ejecución obligatoria(s): ${names}.`);
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
      moment: r.moment,
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
        workActivity: { select: { title: true, sequence: true } },
      },
      orderBy: [{ mandatory: "desc" }, { createdAt: "asc" }],
    });
    const userNames = await this.resolveUserNames(rows.flatMap((r) => [r.responsibleId, r.reviewerId]));
    return rows.map((r) => ({
      id: r.id,
      workOrderId: r.workOrderId,
      templateId: r.templateId,
      templateName: r.template?.name ?? null,
      moment: r.moment,
      workActivityId: r.workActivityId,
      workActivityTitle: r.workActivity?.title ?? null,
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
