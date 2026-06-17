import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  blockingActionsForClose,
  deriveLifecycle,
  evaluateSla,
  investigationBlocksClose,
  reportsBlockingClose,
  type AddIncidentCommentRequest,
  type AssignIncidentRequest,
  type CancelIncidentRequest,
  type CreateIncidentRequest,
  type IncidentActivityDto,
  type IncidentAvailableTransition,
  type IncidentCommentDto,
  type IncidentDetail,
  type IncidentListItem,
  type IncidentListQuery,
  type IncidentListResponse,
  type IncidentStats,
  type IncidentTypeDto,
  type IncidentCategoryDto,
  type TransitionIncidentRequest,
  type UpdateIncidentRequest,
  type UpsertIncidentCategoryRequest,
  type UpsertIncidentTypeRequest,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { ReauthService } from "../auth/reauth.service";
import { IncidentReportsService } from "./incident-reports.service";

/** Formato del folio humano a partir del correlativo. */
function incidentCode(number: number): string {
  return `INC-${String(number).padStart(4, "0")}`;
}

type VersionGraph = {
  versionId: string;
  states: Map<string, { key: string; name: string; order: number; isInitial: boolean; isFinal: boolean; color: string | null; maxStayMinutes: number | null }>;
  transitions: Array<{
    key: string;
    label: string;
    fromKey: string;
    toKey: string;
    order: number;
    requireSignature: boolean;
    requireMfa: boolean;
    signatureMeaning: string | null;
    roleIds: string[];
    roleNames: string[];
  }>;
};

/**
 * Incidencias operacionales / HSE (Fase 4.0 — núcleo). El ciclo de vida reutiliza
 * `WorkflowDefinition` (Fase 2.2): la incidencia CONGELA una versión de flujo y
 * avanza por sus transiciones con las mismas guardas (rol-dato + firma Part 11
 * opt-in, re-autenticada con `ReauthService`). ABAC por nodo en todo (single-tenant).
 * El timeline (`IncidentActivity`) es append-only; no hay borrado físico
 * (anulación = lifecycle CANCELED con motivo).
 */
@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly reauth: ReauthService,
    private readonly reports: IncidentReportsService,
  ) {}

  // === Listado / KPIs ========================================================

  async list(userId: string, q: IncidentListQuery): Promise<IncidentListResponse> {
    const where = await this.buildWhere(userId, q);
    if (where === null) return { items: [], total: 0, page: q.page ?? 1, pageSize: q.pageSize ?? 25 };

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const orderBy = this.orderByFor(q.sort);
    const [rows, total] = await Promise.all([
      this.prisma.incident.findMany({
        where,
        include: this.listInclude,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.incident.count({ where }),
    ]);
    const items = await this.toListItems(rows);
    return { items, total, page, pageSize };
  }

  async stats(userId: string): Promise<IncidentStats> {
    const base = await this.buildWhere(userId, {});
    if (base === null) return { open: 0, critical: 0, overdue: 0, unassigned: 0, fromLogbook: 0, reportable: 0, reportOverdue: 0 };
    const openBase: Prisma.IncidentWhereInput = { ...base, lifecycle: "OPEN" };
    const [open, critical, unassigned, fromLogbook, reportable, reportOverdue, overdueCandidates] = await Promise.all([
      this.prisma.incident.count({ where: openBase }),
      this.prisma.incident.count({ where: { ...openBase, severity: 5 } }),
      this.prisma.incident.count({ where: { ...openBase, ownerId: null } }),
      this.prisma.incident.count({ where: { ...base, originType: { in: ["LOG_ENTRY", "EXCEPTION", "RULE"] } } }),
      this.prisma.incident.count({ where: { ...openBase, reportable: true } }),
      // Reporte vencido se DERIVA (reporte PENDIENTE con plazo pasado), sin estado persistido.
      this.prisma.incident.count({ where: { ...openBase, reports: { some: { status: "PENDING", dueAt: { lt: new Date() } } } } }),
      // SLA de permanencia se DERIVA (estado actual + maxStayMinutes); se cuenta abajo.
      this.prisma.incident.findMany({ where: openBase, include: this.listInclude }),
    ]);
    const overdue = (await this.toListItems(overdueCandidates)).filter((i) => i.slaBreached).length;
    return { open, critical, overdue, unassigned, fromLogbook, reportable, reportOverdue };
  }

  // === Detalle ================================================================

  async getDetail(userId: string, id: string): Promise<IncidentDetail> {
    const row = await this.loadIncident(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    const graph = row.workflowDefinitionVersionId ? await this.loadVersionGraph(row.workflowDefinitionVersionId) : null;
    const item = (await this.toListItems([row]))[0]!;

    const comments = await this.prisma.incidentComment.findMany({ where: { incidentId: id }, orderBy: { createdAt: "asc" } });
    const activities = await this.prisma.incidentActivity.findMany({ where: { incidentId: id }, orderBy: { occurredAt: "asc" } });
    const userNames = await this.resolveUserNames([
      ...comments.map((c) => c.authorId),
      ...activities.map((a) => a.actorId),
    ]);

    const typeFlags = await this.prisma.incidentType.findUnique({
      where: { id: row.typeId },
      select: { requiresInvestigation: true, requiresCapa: true },
    });

    const states = graph ? [...graph.states.values()].sort((a, b) => a.order - b.order) : [];
    const availableTransitions: IncidentAvailableTransition[] =
      graph && row.currentStateKey && !row.canceledAt
        ? graph.transitions
            .filter((t) => t.fromKey === row.currentStateKey)
            .sort((a, b) => a.order - b.order)
            .map((t) => ({
              key: t.key,
              label: t.label,
              toStateKey: t.toKey,
              toStateName: graph.states.get(t.toKey)?.name ?? t.toKey,
              toStateIsFinal: graph.states.get(t.toKey)?.isFinal ?? false,
              requireSignature: t.requireSignature,
              requireMfa: t.requireMfa,
              signatureMeaning: t.signatureMeaning,
              roleNames: t.roleNames,
            }))
        : [];

    return {
      ...item,
      description: row.description,
      typeRequiresInvestigation: typeFlags?.requiresInvestigation ?? false,
      typeRequiresCapa: typeFlags?.requiresCapa ?? false,
      riskProbability: row.riskProbability,
      riskConsequence: row.riskConsequence,
      shiftCode: row.shiftCode,
      originLogEntryId: row.originLogEntryId,
      originLogEntryNumber: await this.logEntryNumber(row.originLogEntryId),
      workflowDefinitionId: row.workflowDefinitionId,
      workflowDefinitionVersionId: row.workflowDefinitionVersionId,
      states: states.map((s) => ({ key: s.key, name: s.name, order: s.order, isFinal: s.isFinal, color: s.color })),
      availableTransitions,
      comments: comments.map((c): IncidentCommentDto => ({
        id: c.id,
        authorId: c.authorId,
        authorName: c.authorName ?? (c.authorId ? userNames.get(c.authorId) ?? null : null),
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
      activity: activities.map((a): IncidentActivityDto => ({
        id: a.id,
        kind: a.kind,
        summary: a.summary,
        actorId: a.actorId,
        actorName: a.actorName ?? (a.actorId ? userNames.get(a.actorId) ?? null : null),
        occurredAt: a.occurredAt.toISOString(),
        metadata: (a.metadata as Record<string, unknown> | null) ?? null,
      })),
      closedAt: row.closedAt?.toISOString() ?? null,
      closedById: row.closedById,
      closureSummary: row.closureSummary,
      canceledAt: row.canceledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
    };
  }

  // === Creación ===============================================================

  async create(userId: string, dto: CreateIncidentRequest, ctx: AuditContext): Promise<IncidentDetail> {
    // El nodo debe existir (un admin de alcance nulo pasa el ABAC de cualquier id;
    // la guarda real de existencia es esta, para devolver 400 y no romper la FK).
    const node = await this.prisma.orgNode.findFirst({ where: { id: dto.orgNodeId, deletedAt: null }, select: { id: true } });
    if (!node) throw new BadRequestException("El nodo indicado no existe");
    await this.assertNodeAccess(userId, dto.orgNodeId);
    const type = await this.prisma.incidentType.findFirst({ where: { id: dto.typeId, deletedAt: null } });
    if (!type || !type.active) throw new BadRequestException("El tipo de incidencia no existe o está inactivo");
    if (dto.categoryId) {
      const cat = await this.prisma.incidentCategory.findFirst({ where: { id: dto.categoryId, deletedAt: null } });
      if (!cat || !cat.active) throw new BadRequestException("La categoría no existe o está inactiva");
      if (cat.typeId && cat.typeId !== dto.typeId) throw new BadRequestException("La categoría no pertenece al tipo indicado");
    }
    let originLogEntryId: string | null = null;
    let shiftCode: string | null = null;
    let entryEquipmentId: string | null = null;
    if (dto.originLogEntryId) {
      const entry = await this.prisma.logEntry.findFirst({
        where: { id: dto.originLogEntryId },
        select: { id: true, orgNodeId: true, shiftCode: true, equipmentId: true },
      });
      if (!entry) throw new BadRequestException("La entrada de bitácora de origen no existe");
      await this.assertNodeAccess(userId, entry.orgNodeId);
      originLogEntryId = entry.id;
      shiftCode = entry.shiftCode;
      // Hereda el activo de la bitácora de origen si el reporte es del MISMO nodo y no
      // se eligió uno explícito (ISO 14224: la incidencia conserva el activo del evento).
      if (entry.orgNodeId === dto.orgNodeId) entryEquipmentId = entry.equipmentId;
    }
    const equipmentId = dto.equipmentId ?? entryEquipmentId ?? null;
    if (equipmentId) await this.assertEquipmentInNode(equipmentId, dto.orgNodeId);
    if (dto.ownerId) await this.assertUserExists(dto.ownerId);

    // Congela el flujo: el del TIPO (si declara uno) o el flujo global por defecto.
    const wf = await this.resolveWorkflow(type.defaultWorkflowId);
    const graph = await this.loadVersionGraph(wf.versionId);
    const initial = [...graph.states.values()].find((s) => s.isInitial);
    if (!initial) throw new BadRequestException("El flujo de incidencias no tiene estado inicial");

    const now = new Date();
    const row = await this.prisma.incident.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        typeId: dto.typeId,
        categoryId: dto.categoryId ?? null,
        severity: dto.severity,
        potentialSeverity: dto.potentialSeverity ?? null,
        priority: dto.priority ?? "MEDIUM",
        riskProbability: dto.riskProbability ?? null,
        riskConsequence: dto.riskConsequence ?? null,
        originType: originLogEntryId ? "LOG_ENTRY" : "MANUAL",
        lifecycle: "OPEN",
        workflowDefinitionId: wf.definitionId,
        workflowDefinitionVersionId: wf.versionId,
        currentStateKey: initial.key,
        currentStateSince: now,
        orgNodeId: dto.orgNodeId,
        equipmentId,
        shiftCode,
        originLogEntryId,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : null,
        reporterId: userId,
        ownerId: dto.ownerId ?? null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        reportable: dto.reportable ?? type.reportableDefault,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.addActivity(row.id, "CREATED", `Incidencia ${incidentCode(row.number)} creada`, ctx, {
      originType: row.originType,
      originLogEntryId,
    });
    if (dto.ownerId) {
      await this.addActivity(row.id, "ASSIGNED", `Responsable asignado: ${(await this.resolveUserNames([dto.ownerId])).get(dto.ownerId) ?? dto.ownerId}`, ctx);
    }
    await this.audit.record({ ...ctx, action: "incident.created", entityType: "Incident", entityId: row.id, after: this.snapshot(row) });
    // Reportabilidad (Fase 4.3): si la incidencia es reportable (por el flag del tipo
    // `reportableDefault` o por elección explícita), materializa los reportes de las
    // obligaciones APLICABLES (por tipo/severidad). Honra `reportableDefault`/`reportable`.
    if (row.reportable) {
      await this.reports.materializeForIncident(userId, row.id, ctx);
    }
    return this.getDetail(userId, row.id);
  }

  // === Edición de atributos ==================================================

  async update(userId: string, id: string, dto: UpdateIncidentRequest, ctx: AuditContext): Promise<IncidentDetail> {
    const before = await this.loadIncident(id);
    await this.assertNodeAccess(userId, before.orgNodeId);
    if (before.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (dto.categoryId) {
      const cat = await this.prisma.incidentCategory.findFirst({ where: { id: dto.categoryId, deletedAt: null } });
      if (!cat || !cat.active) throw new BadRequestException("La categoría no existe o está inactiva");
    }
    if (dto.equipmentId) await this.assertEquipmentInNode(dto.equipmentId, before.orgNodeId);

    const row = await this.prisma.incident.update({
      where: { id },
      data: {
        title: dto.title === undefined ? undefined : dto.title,
        description: dto.description === undefined ? undefined : dto.description,
        categoryId: dto.categoryId === undefined ? undefined : dto.categoryId,
        severity: dto.severity === undefined ? undefined : dto.severity,
        potentialSeverity: dto.potentialSeverity === undefined ? undefined : dto.potentialSeverity,
        priority: dto.priority === undefined ? undefined : dto.priority,
        riskProbability: dto.riskProbability === undefined ? undefined : dto.riskProbability,
        riskConsequence: dto.riskConsequence === undefined ? undefined : dto.riskConsequence,
        equipmentId: dto.equipmentId === undefined ? undefined : dto.equipmentId,
        reportable: dto.reportable === undefined ? undefined : dto.reportable,
        dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
        occurredAt: dto.occurredAt === undefined ? undefined : dto.occurredAt ? new Date(dto.occurredAt) : null,
        updatedById: userId,
      },
    });
    // Huella de cambios relevantes en el timeline (severidad/prioridad).
    const changes: string[] = [];
    if (dto.severity !== undefined && dto.severity !== before.severity) changes.push(`Severidad ${before.severity} → ${dto.severity}`);
    if (dto.priority !== undefined && dto.priority !== before.priority) changes.push(`Prioridad ${before.priority} → ${dto.priority}`);
    for (const summary of changes) await this.addActivity(id, "FIELD_CHANGED", summary, ctx);
    await this.audit.record({ ...ctx, action: "incident.updated", entityType: "Incident", entityId: id, before: this.snapshot(before), after: this.snapshot(row) });
    return this.getDetail(userId, id);
  }

  async assign(userId: string, id: string, dto: AssignIncidentRequest, ctx: AuditContext): Promise<IncidentDetail> {
    const before = await this.loadIncident(id);
    await this.assertNodeAccess(userId, before.orgNodeId);
    if (before.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (dto.ownerId) await this.assertUserExists(dto.ownerId);
    await this.prisma.incident.update({ where: { id }, data: { ownerId: dto.ownerId, updatedById: userId } });
    const name = dto.ownerId ? (await this.resolveUserNames([dto.ownerId])).get(dto.ownerId) ?? dto.ownerId : null;
    await this.addActivity(id, "ASSIGNED", name ? `Responsable asignado: ${name}` : "Responsable removido", ctx, { ownerId: dto.ownerId });
    await this.audit.record({ ...ctx, action: "incident.assigned", entityType: "Incident", entityId: id, after: { ownerId: dto.ownerId } });
    return this.getDetail(userId, id);
  }

  async addComment(userId: string, id: string, dto: AddIncidentCommentRequest, ctx: AuditContext): Promise<IncidentCommentDto> {
    const row = await this.loadIncident(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    const name = (await this.resolveUserNames([userId])).get(userId) ?? null;
    const c = await this.prisma.incidentComment.create({
      data: { incidentId: id, authorId: userId, authorName: name, body: dto.body },
    });
    await this.addActivity(id, "COMMENT", "Comentario agregado", ctx);
    await this.audit.record({ ...ctx, action: "incident.commented", entityType: "Incident", entityId: id });
    return { id: c.id, authorId: c.authorId, authorName: c.authorName, body: c.body, createdAt: c.createdAt.toISOString() };
  }

  // === Transición de flujo ====================================================

  async transition(userId: string, id: string, dto: TransitionIncidentRequest, ctx: AuditContext): Promise<IncidentDetail> {
    const incident = await this.loadIncident(id);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (!incident.workflowDefinitionVersionId || !incident.currentStateKey) {
      throw new BadRequestException("La incidencia no tiene un flujo configurado");
    }
    const graph = await this.loadVersionGraph(incident.workflowDefinitionVersionId);
    const transition = graph.transitions.find((t) => t.key === dto.transitionKey);
    if (!transition) throw new NotFoundException("Transición no encontrada en el flujo");
    if (transition.fromKey !== incident.currentStateKey) {
      throw new BadRequestException("La transición no parte del estado actual");
    }
    // (b) rol-dato autorizado (vacío = abierta al permiso base).
    const roleIds = await this.userRoleIds(userId);
    if (transition.roleIds.length > 0 && !transition.roleIds.some((r) => roleIds.has(r))) {
      throw new ForbiddenException("No tiene un rol autorizado para ejecutar esta transición");
    }
    // Firma (opt-in Part 11): re-autenticación ANTES de mutar (§11.200). El registro
    // de firma criptográfico (payloadHash) para incidencias = deuda de Fase 4.2; aquí
    // se EXIGE y verifica la re-autenticación (gate de control de acceso).
    let signerName: string | null = null;
    if (transition.requireSignature) {
      const reauth = await this.reauth.verifyForSignature(
        userId,
        { password: dto.password, mfaCode: dto.mfaCode },
        { requireMfa: transition.requireMfa },
      );
      signerName = reauth.signerName;
    }

    const toState = graph.states.get(transition.toKey)!;
    const now = new Date();
    const becomesFinal = toState.isFinal;

    // Guarda CAPA: si la transición CIERRA la incidencia, no puede haber acciones
    // OBLIGATORIAS aún abiertas. La verificación de eficacia se EXIGE cuando el tipo
    // declara `requiresCapa` (fork 3): entonces una acción DONE-sin-verificar también
    // bloquea; si no, basta con DONE.
    if (becomesFinal) {
      await this.assertNoBlockingActions(id, incident.typeId);
      // Guarda de investigación (Fase 4.2b): si el tipo declara `requiresInvestigation`,
      // no se puede cerrar sin una investigación COMPLETED con ≥1 causa raíz.
      await this.assertInvestigationComplete(id, incident.typeId);
      // Guarda de reportabilidad (Fase 4.3): un reporte de obligación OBLIGATORIA aún
      // PENDIENTE bloquea el cierre (se resuelve enviándolo o marcándolo "no aplica").
      await this.assertNoBlockingReports(id);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.incidentTransition.create({
        data: {
          incidentId: id,
          workflowDefinitionVersionId: incident.workflowDefinitionVersionId!,
          transitionKey: transition.key,
          fromStateKey: transition.fromKey,
          toStateKey: transition.toKey,
          actorId: userId,
          actorEmail: ctx.actorEmail ?? null,
          reason: dto.reason ?? null,
          occurredAt: now,
        },
      });
      await tx.incident.update({
        where: { id },
        data: {
          currentStateKey: toState.key,
          currentStateSince: now,
          lifecycle: becomesFinal ? "CLOSED" : "OPEN",
          updatedById: userId,
          ...(becomesFinal
            ? { closedAt: now, closedById: userId, closureSummary: dto.closureSummary ?? null }
            : {}),
        },
      });
      await tx.incidentActivity.create({
        data: {
          incidentId: id,
          kind: becomesFinal ? "CLOSED" : "TRANSITION",
          summary: `${transition.label} → ${toState.name}${signerName ? ` (firmado por ${signerName})` : ""}`,
          actorId: userId,
          actorName: signerName,
          metadata: { transitionKey: transition.key, fromStateKey: transition.fromKey, toStateKey: transition.toKey },
        },
      });
    });
    await this.audit.record({
      ...ctx,
      action: "incident.transition.executed",
      entityType: "Incident",
      entityId: id,
      after: { transitionKey: transition.key, toStateKey: toState.key, signed: transition.requireSignature },
    });
    return this.getDetail(userId, id);
  }

  async cancel(userId: string, id: string, dto: CancelIncidentRequest, ctx: AuditContext): Promise<IncidentDetail> {
    const row = await this.loadIncident(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    if (row.lifecycle === "CANCELED") throw new BadRequestException("La incidencia ya está anulada");
    const now = new Date();
    await this.prisma.incident.update({
      where: { id },
      data: { lifecycle: "CANCELED", canceledAt: now, cancelReason: dto.reason, canceledById: userId, updatedById: userId },
    });
    await this.addActivity(id, "CANCELED", `Incidencia anulada: ${dto.reason}`, ctx);
    await this.audit.record({ ...ctx, action: "incident.canceled", entityType: "Incident", entityId: id, after: { reason: dto.reason } });
    return this.getDetail(userId, id);
  }

  // === Catálogos (tipos / categorías) ========================================

  async listTypes(includeInactive = false): Promise<IncidentTypeDto[]> {
    const rows = await this.prisma.incidentType.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const wfIds = rows.map((r) => r.defaultWorkflowId).filter((x): x is string => !!x);
    const wfNames = wfIds.length
      ? new Map((await this.prisma.workflowDefinition.findMany({ where: { id: { in: wfIds } }, select: { id: true, name: true } })).map((w) => [w.id, w.name]))
      : new Map<string, string>();
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      color: r.color,
      defaultWorkflowId: r.defaultWorkflowId,
      defaultWorkflowName: r.defaultWorkflowId ? wfNames.get(r.defaultWorkflowId) ?? null : null,
      requiresInvestigation: r.requiresInvestigation,
      requiresCapa: r.requiresCapa,
      reportableDefault: r.reportableDefault,
      active: r.active,
      sortOrder: r.sortOrder,
    }));
  }

  async listCategories(includeInactive = false): Promise<IncidentCategoryDto[]> {
    const rows = await this.prisma.incidentCategory.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      typeId: r.typeId,
      active: r.active,
      sortOrder: r.sortOrder,
    }));
  }

  async upsertType(dto: UpsertIncidentTypeRequest, ctx: AuditContext, failIfExists = false): Promise<IncidentTypeDto> {
    // Guarda de "crear" (fork colisión de key): el endpoint es upsert por key, así
    // que el server no distingue crear de actualizar. Cuando la UI declara `create`,
    // una key ya existente es un conflicto (no se debe sobrescribir en silencio).
    if (failIfExists) {
      const existing = await this.prisma.incidentType.findUnique({ where: { key: dto.key } });
      if (existing) throw new ConflictException(`Ya existe un tipo de incidencia con la clave "${dto.key}".`);
    }
    if (dto.defaultWorkflowId) {
      const wf = await this.prisma.workflowDefinition.findFirst({ where: { id: dto.defaultWorkflowId, deletedAt: null } });
      if (!wf) throw new BadRequestException("El flujo por defecto indicado no existe");
      // El flujo se CONGELA al crear una incidencia del tipo: debe estar publicado.
      if (wf.status !== "PUBLISHED" || !wf.currentVersionId) throw new BadRequestException("El flujo por defecto debe estar publicado");
    }
    const data = {
      name: dto.name,
      description: dto.description ?? null,
      color: dto.color ?? null,
      defaultWorkflowId: dto.defaultWorkflowId ?? null,
      requiresInvestigation: dto.requiresInvestigation ?? false,
      requiresCapa: dto.requiresCapa ?? false,
      reportableDefault: dto.reportableDefault ?? false,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const row = await this.prisma.incidentType.upsert({ where: { key: dto.key }, create: { key: dto.key, ...data }, update: data });
    await this.audit.record({ ...ctx, action: "incidenttype.upserted", entityType: "IncidentType", entityId: row.id, after: { key: row.key, name: row.name } });
    return (await this.listTypes(true)).find((t) => t.id === row.id)!;
  }

  async upsertCategory(dto: UpsertIncidentCategoryRequest, ctx: AuditContext, failIfExists = false): Promise<IncidentCategoryDto> {
    if (failIfExists) {
      const existing = await this.prisma.incidentCategory.findUnique({ where: { key: dto.key } });
      if (existing) throw new ConflictException(`Ya existe una categoría de incidencia con la clave "${dto.key}".`);
    }
    if (dto.typeId) {
      const t = await this.prisma.incidentType.findFirst({ where: { id: dto.typeId, deletedAt: null } });
      if (!t) throw new BadRequestException("El tipo indicado no existe");
    }
    const data = { name: dto.name, description: dto.description ?? null, typeId: dto.typeId ?? null, active: dto.active ?? true, sortOrder: dto.sortOrder ?? 0 };
    const row = await this.prisma.incidentCategory.upsert({ where: { key: dto.key }, create: { key: dto.key, ...data }, update: data });
    await this.audit.record({ ...ctx, action: "incidentcategory.upserted", entityType: "IncidentCategory", entityId: row.id, after: { key: row.key, name: row.name } });
    return { id: row.id, key: row.key, name: row.name, description: row.description, typeId: row.typeId, active: row.active, sortOrder: row.sortOrder };
  }

  /** Usuarios ACTIVOS (id+nombre) para el selector de responsable. */
  async assignableUsers(): Promise<Array<{ id: string; name: string }>> {
    const users = await this.prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    });
    return users.map((u) => ({ id: u.id, name: u.displayName ?? u.email }));
  }

  /**
   * Equipos/activos del nodo (ISO 14224: la incidencia se ata a un activo, no solo a
   * la ubicación) para el selector del alta. ABAC por nodo primero; equipos activos
   * de ESE nodo. Self-contained en el módulo de incidencias (gate `incident:create`):
   * no exige `equipment:view` al que reporta.
   */
  async equipmentOptions(userId: string, nodeId: string): Promise<Array<{ id: string; name: string; tag: string | null }>> {
    await this.assertNodeAccess(userId, nodeId); // ABAC
    const rows = await this.prisma.equipment.findMany({
      where: { orgNodeId: nodeId, deletedAt: null, active: true },
      select: { id: true, name: true, tag: true },
      orderBy: [{ reportOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, name: r.name, tag: r.tag }));
  }

  // === Helpers ================================================================

  private readonly listInclude = {
    type: { select: { name: true, color: true } },
    category: { select: { name: true } },
    orgNode: { select: { name: true } },
    equipment: { select: { tag: true } },
    _count: { select: { comments: true } },
  } satisfies Prisma.IncidentInclude;

  private orderByFor(sort: IncidentListQuery["sort"]): Prisma.IncidentOrderByWithRelationInput[] {
    switch (sort) {
      case "severity":
        return [{ severity: "desc" }, { createdAt: "desc" }];
      case "priority":
        return [{ priority: "desc" }, { createdAt: "desc" }];
      case "due":
        return [{ dueAt: "asc" }, { createdAt: "desc" }];
      default:
        return [{ createdAt: "desc" }, { id: "desc" }];
    }
  }

  /** Construye el WHERE con ABAC por nodo + filtros. `null` = el usuario no alcanza ningún nodo. */
  private async buildWhere(userId: string, q: IncidentListQuery): Promise<Prisma.IncidentWhereInput | null> {
    const nodeIds = await this.scope.getAccessibleNodeIds(userId);
    if (nodeIds && nodeIds.size === 0) return null;
    let nodeFilter: string[] | undefined = nodeIds ? [...nodeIds] : undefined;
    if (q.orgNodeIds && q.orgNodeIds.length > 0) {
      nodeFilter = nodeFilter ? nodeFilter.filter((n) => q.orgNodeIds!.includes(n)) : q.orgNodeIds;
      if (nodeFilter.length === 0) return null;
    }
    const where: Prisma.IncidentWhereInput = {
      ...(nodeFilter ? { orgNodeId: { in: nodeFilter } } : {}),
      ...(q.lifecycle ? { lifecycle: q.lifecycle } : {}),
      ...(q.typeId ? { typeId: q.typeId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.originType ? { originType: q.originType } : {}),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
      ...(q.currentStateKey ? { currentStateKey: q.currentStateKey } : {}),
      ...(q.unassignedOnly ? { ownerId: null } : {}),
      ...(q.reportableOnly ? { reportable: true } : {}),
      ...(q.reportOverdueOnly ? { reports: { some: { status: "PENDING", dueAt: { lt: new Date() } } } } : {}),
      ...(q.fromLogbookOnly ? { originType: { in: ["LOG_ENTRY", "EXCEPTION", "RULE"] } } : {}),
      ...(q.mine ? { OR: [{ ownerId: userId }, { reporterId: userId }] } : {}),
    };
    if (q.search && q.search.trim()) {
      const term = q.search.trim();
      const numMatch = term.match(/(\d+)/);
      where.AND = [
        {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { description: { contains: term, mode: "insensitive" } },
            ...(numMatch ? [{ number: Number(numMatch[1]) }] : []),
          ],
        },
      ];
    }
    return where;
  }

  private async toListItems(rows: IncidentRow[]): Promise<IncidentListItem[]> {
    if (rows.length === 0) return [];
    const versionIds = [...new Set(rows.map((r) => r.workflowDefinitionVersionId).filter((x): x is string => !!x))];
    const graphs = new Map<string, VersionGraph>();
    for (const vid of versionIds) graphs.set(vid, await this.loadVersionGraph(vid));
    const userNames = await this.resolveUserNames(rows.flatMap((r) => [r.ownerId, r.reporterId]));
    const now = Date.now();
    // Reporte vencido por fila (Fase 4.3): batched, igual que el resto de lookups.
    const reportOverdueIds = new Set(
      (
        await this.prisma.incidentReport.findMany({
          where: { incidentId: { in: rows.map((r) => r.id) }, status: "PENDING", dueAt: { lt: new Date(now) } },
          select: { incidentId: true },
        })
      ).map((r) => r.incidentId),
    );
    return rows.map((r) => {
      const graph = r.workflowDefinitionVersionId ? graphs.get(r.workflowDefinitionVersionId) : undefined;
      const state = graph && r.currentStateKey ? graph.states.get(r.currentStateKey) : undefined;
      const slaBreached =
        r.lifecycle === "OPEN" && !!state && evaluateSla(r.currentStateSince.getTime(), state.maxStayMinutes, now).status === "breached";
      return {
        id: r.id,
        code: incidentCode(r.number),
        title: r.title,
        typeId: r.typeId,
        typeName: r.type?.name ?? null,
        typeColor: r.type?.color ?? null,
        categoryId: r.categoryId,
        categoryName: r.category?.name ?? null,
        severity: r.severity,
        potentialSeverity: r.potentialSeverity,
        priority: r.priority,
        originType: r.originType,
        lifecycle: deriveLifecycle({ canceledAt: r.canceledAt, currentStateIsFinal: state?.isFinal ?? false }),
        currentStateKey: r.currentStateKey,
        currentStateName: state?.name ?? null,
        currentStateColor: state?.color ?? null,
        orgNodeId: r.orgNodeId,
        orgNodeName: r.orgNode?.name ?? null,
        equipmentId: r.equipmentId,
        equipmentTag: r.equipment?.tag ?? null,
        ownerId: r.ownerId,
        ownerName: r.ownerId ? userNames.get(r.ownerId) ?? null : null,
        reporterId: r.reporterId,
        reporterName: r.reporterId ? userNames.get(r.reporterId) ?? null : null,
        dueAt: r.dueAt?.toISOString() ?? null,
        occurredAt: r.occurredAt?.toISOString() ?? null,
        slaBreached,
        reportable: r.reportable,
        reportOverdue: reportOverdueIds.has(r.id),
        commentCount: r._count?.comments ?? 0,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  private async resolveWorkflow(typeDefaultWorkflowId: string | null): Promise<{ definitionId: string; versionId: string }> {
    // Prioridad: flujo del TIPO → flujo global por clave "incidencia-operacional".
    let def = typeDefaultWorkflowId
      ? await this.prisma.workflowDefinition.findFirst({ where: { id: typeDefaultWorkflowId, deletedAt: null } })
      : null;
    if (!def?.currentVersionId) {
      def = await this.prisma.workflowDefinition.findFirst({ where: { key: "incidencia-operacional", deletedAt: null } });
    }
    if (!def?.currentVersionId) {
      throw new BadRequestException("No hay un flujo de incidencias publicado. Publique uno (clave 'incidencia-operacional').");
    }
    return { definitionId: def.id, versionId: def.currentVersionId };
  }

  private async loadVersionGraph(versionId: string): Promise<VersionGraph> {
    const version = await this.prisma.workflowDefinitionVersion.findUnique({
      where: { id: versionId },
      include: {
        states: true,
        transitions: { include: { fromState: { select: { key: true } }, toState: { select: { key: true } }, roles: { select: { roleId: true } } } },
      },
    });
    if (!version) throw new NotFoundException("Versión de flujo no encontrada");
    const roleIds = [...new Set(version.transitions.flatMap((t) => t.roles.map((r) => r.roleId)))];
    const roleNames = roleIds.length
      ? new Map((await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]))
      : new Map<string, string>();
    return {
      versionId,
      states: new Map(
        version.states.map((s) => [s.key, { key: s.key, name: s.name, order: s.order, isInitial: s.isInitial, isFinal: s.isFinal, color: s.color, maxStayMinutes: s.maxStayMinutes }]),
      ),
      transitions: version.transitions.map((t) => ({
        key: t.key,
        label: t.label,
        fromKey: t.fromState.key,
        toKey: t.toState.key,
        order: t.order,
        requireSignature: t.requireSignature,
        requireMfa: t.requireMfa,
        signatureMeaning: t.signatureMeaning,
        roleIds: t.roles.map((r) => r.roleId),
        roleNames: t.roles.map((r) => roleNames.get(r.roleId) ?? r.roleId),
      })),
    };
  }

  private async loadIncident(id: string): Promise<IncidentRow> {
    const row = await this.prisma.incident.findUnique({ where: { id }, include: this.listInclude });
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

  private async logEntryNumber(logEntryId: string | null): Promise<number | null> {
    if (!logEntryId) return null;
    const e = await this.prisma.logEntry.findUnique({ where: { id: logEntryId }, select: { entryNumber: true } });
    return e?.entryNumber ?? null;
  }

  private async userRoleIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return new Set(rows.map((r) => r.roleId));
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
  }

  private async assertEquipmentInNode(equipmentId: string, orgNodeId: string): Promise<void> {
    const eq = await this.prisma.equipment.findFirst({ where: { id: equipmentId, deletedAt: null }, select: { orgNodeId: true, active: true } });
    if (!eq || !eq.active) throw new BadRequestException("El equipo indicado no existe o está inactivo");
    if (eq.orgNodeId !== orgNodeId) throw new BadRequestException("El equipo no pertenece al nodo de la incidencia");
  }

  private async assertUserExists(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException("El usuario indicado no existe");
  }

  /** Impide cerrar si hay acciones CAPA obligatorias sin resolver (Fase 4.2a). */
  private async assertNoBlockingActions(incidentId: string, typeId: string): Promise<void> {
    const type = await this.prisma.incidentType.findUnique({ where: { id: typeId }, select: { requiresCapa: true } });
    const requireVerification = type?.requiresCapa ?? false;
    const actions = await this.prisma.incidentAction.findMany({
      where: { incidentId, mandatory: true, status: { in: ["OPEN", "IN_PROGRESS", "DONE"] } },
      select: { mandatory: true, status: true },
    });
    const blocking = blockingActionsForClose(actions, requireVerification);
    if (blocking.length > 0) {
      throw new BadRequestException(
        requireVerification
          ? `No se puede cerrar: ${blocking.length} acción(es) obligatoria(s) sin completar y verificar.`
          : `No se puede cerrar: ${blocking.length} acción(es) obligatoria(s) sin completar.`,
      );
    }
  }

  /** Impide cerrar si el tipo exige investigación y no está completa (Fase 4.2b). */
  private async assertInvestigationComplete(incidentId: string, typeId: string): Promise<void> {
    const type = await this.prisma.incidentType.findUnique({ where: { id: typeId }, select: { requiresInvestigation: true } });
    const requires = type?.requiresInvestigation ?? false;
    if (!requires) return;
    const inv = await this.prisma.incidentInvestigation.findUnique({
      where: { incidentId },
      select: { status: true, steps: { select: { isRootCause: true } } },
    });
    if (investigationBlocksClose(requires, inv)) {
      throw new BadRequestException(
        "No se puede cerrar: el tipo de incidencia exige una investigación de causa raíz completada (con al menos una causa raíz).",
      );
    }
  }

  /** Impide cerrar si hay reportes OBLIGATORIOS aún pendientes de envío (Fase 4.3). */
  private async assertNoBlockingReports(incidentId: string): Promise<void> {
    const reports = await this.prisma.incidentReport.findMany({
      where: { incidentId, mandatory: true, status: "PENDING" },
      select: { mandatory: true, status: true },
    });
    const blocking = reportsBlockingClose(reports);
    if (blocking.length > 0) {
      throw new BadRequestException(
        `No se puede cerrar: ${blocking.length} reporte(s) obligatorio(s) sin enviar (envíelos o márquelos como "no aplica").`,
      );
    }
  }

  private snapshot(row: { title: string; typeId: string; severity: number; priority: string; lifecycle: string; ownerId: string | null }): Prisma.InputJsonValue {
    return { title: row.title, typeId: row.typeId, severity: row.severity, priority: row.priority, lifecycle: row.lifecycle, ownerId: row.ownerId };
  }
}

/** Fila de incidencia con los includes del listado. */
type IncidentRow = Prisma.IncidentGetPayload<{
  include: {
    type: { select: { name: true; color: true } };
    category: { select: { name: true } };
    orgNode: { select: { name: true } };
    equipment: { select: { tag: true } };
    _count: { select: { comments: true } };
  };
}>;

