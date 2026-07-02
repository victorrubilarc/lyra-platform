import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  DEFAULT_WORK_ORDER_CHECKLIST_GATE_STATE_KEY,
  DEFAULT_WORK_ORDER_EXECUTE_STATE_KEY,
  DEFAULT_WORK_ORDER_FOLIO_STATE_KEY,
  DEFAULT_WORK_ORDER_PLAN_FREEZE_STATE_KEY,
  planNotFrozen,
  buildFolioSeqKey,
  deriveWorkOrderLifecycle,
  renderFolio,
  resolveFolioScheme,
  workOrderCode,
  workOrderDueFromType,
  workOrderTrafficLight,
  AT_RISK_WINDOW_MINUTES,
  type AssignWorkOrderRequest,
  type CancelWorkOrderRequest,
  type CreateWorkOrderRequest,
  type FolioScheme,
  type SpecialtyDto,
  type TransitionWorkOrderRequest,
  type UpdateWorkOrderRequest,
  type WorkOrderWorkflowView,
  type UpsertSpecialtyRequest,
  type UpsertWorkOrderTypeRequest,
  type WorkOrderAvailableTransition,
  type WorkOrderDetail,
  type WorkOrderEventDto,
  type WorkOrderListItem,
  type WorkOrderListQuery,
  type WorkOrderListResponse,
  type WorkOrderStats,
  type WorkOrderTypeDto,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { ReauthService } from "../auth/reauth.service";
import { FolioService } from "../folio/folio.service";
import { WorkOrderChecklistsService } from "./work-order-checklists.service";
import { WorkActivitiesService } from "./work-activities.service";

/** Clave del flujo global por defecto de OT (seed fork W6; el tipo puede declarar otro). */
const WORK_ORDER_WORKFLOW_KEY = "ot-4-puertas";

/** Grafo de la versión de flujo CONGELADA (mismo shape que en IncidentsService). */
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
 * Órdenes de Trabajo / Work Orders (OT / PTW) — S1 cimientos + S2 PUERTA 1.
 * ESPEJO de `IncidentsService`. Desde S2 la solicitud CONGELA una versión del flujo
 * configurable al crearse (nace en el estado inicial `borrador`, lifecycle DRAFT) y
 * avanza por transiciones con las mismas guardas que Incidencias (rol-dato + firma
 * Part 11 re-autenticada). Al ENTRAR al estado emisor (`WorkOrderType.folioOnStateKey`,
 * default "aprobada") se emite el FOLIO oficial gapless (FolioCounter, fork W4) dentro
 * de la MISMA transacción. Los guards de las Puertas 2–4 llegan en S3–S5. ABAC por
 * nodo ∩ estructura en todo; sin borrado físico (anulación = CANCELED con motivo).
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly reauth: ReauthService,
    private readonly folio: FolioService,
    private readonly checklists: WorkOrderChecklistsService,
    private readonly activities: WorkActivitiesService,
  ) {}

  // === Listado / KPIs ========================================================

  async list(userId: string, q: WorkOrderListQuery, structureId?: string): Promise<WorkOrderListResponse> {
    const where = await this.buildWhere(userId, q, structureId);
    if (where === null) return { items: [], total: 0, page: q.page ?? 1, pageSize: q.pageSize ?? 25 };

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        include: this.listInclude,
        orderBy: this.orderByFor(q.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    const items = await this.toListItems(rows);
    return { items, total, page, pageSize };
  }

  async stats(userId: string, structureId?: string): Promise<WorkOrderStats> {
    const base = await this.buildWhere(userId, {}, structureId);
    if (base === null) return { draft: 0, open: 0, critical: 0, unassigned: 0, ptw: 0, overdue: 0, atRisk: 0, stalled: 0 };
    const openBase: Prisma.WorkOrderWhereInput = { ...base, lifecycle: "OPEN" };
    // Vigía (S6): plazo/permanencia sobre OT ABIERTAS. `stalled` reusa la detección de
    // permanencia (raw), intersectada con el conjunto accesible.
    const now = new Date();
    const overdueActivity: Prisma.WorkOrderWhereInput = {
      activities: {
        some: {
          status: { notIn: ["DONE", "CANCELED"] },
          OR: [{ baselineEnd: { lt: now } }, { AND: [{ baselineEnd: null }, { plannedEnd: { lt: now } }] }],
        },
      },
    };
    const window = new Date(now.getTime() + AT_RISK_WINDOW_MINUTES * 60_000);
    const stalledIds = await this.findStalledIds();
    const [draft, open, critical, unassigned, ptw, overdue, atRisk, stalled] = await Promise.all([
      this.prisma.workOrder.count({ where: { ...base, lifecycle: "DRAFT" } }),
      this.prisma.workOrder.count({ where: openBase }),
      this.prisma.workOrder.count({ where: { ...openBase, criticality: 5 } }),
      this.prisma.workOrder.count({ where: { ...openBase, ownerId: null } }),
      this.prisma.workOrder.count({ where: { ...base, requiresPtw: true, lifecycle: { in: ["DRAFT", "OPEN"] } } }),
      this.prisma.workOrder.count({ where: { ...openBase, OR: [{ dueAt: { lt: now } }, overdueActivity] } }),
      this.prisma.workOrder.count({ where: { ...openBase, dueAt: { gte: now, lte: window }, NOT: overdueActivity } }),
      this.prisma.workOrder.count({ where: { ...openBase, id: { in: stalledIds } } }),
    ]);
    return { draft, open, critical, unassigned, ptw, overdue, atRisk, stalled };
  }

  // === Detalle ================================================================

  async getDetail(userId: string, id: string): Promise<WorkOrderDetail> {
    const row = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    const graph = row.workflowDefinitionVersionId ? await this.loadVersionGraph(row.workflowDefinitionVersionId) : null;
    const item = (await this.toListItems([row]))[0]!;
    const type = await this.prisma.workOrderType.findUnique({ where: { id: row.typeId }, select: { criticalityDefault: true } });

    const events = await this.prisma.workOrderEvent.findMany({ where: { workOrderId: id }, orderBy: { occurredAt: "asc" } });
    const userNames = await this.resolveUserNames([...events.map((e) => e.actorId), row.executionSetConfirmedById]);

    const states = graph ? [...graph.states.values()].sort((a, b) => a.order - b.order) : [];
    const availableTransitions: WorkOrderAvailableTransition[] =
      graph && row.currentStateKey && !row.canceledAt
        ? graph.transitions
            .filter((t) => t.fromKey === row.currentStateKey)
            .sort((a, b) => a.order - b.order)
            .map((t) => {
              const toState = graph.states.get(t.toKey);
              return {
                key: t.key,
                label: t.label,
                toStateKey: t.toKey,
                toStateName: toState?.name ?? t.toKey,
                toStateIsFinal: toState?.isFinal ?? false,
                requireSignature: t.requireSignature,
                requireMfa: t.requireMfa,
                signatureMeaning: t.signatureMeaning,
                roleNames: t.roleNames,
                // Estado FINAL sin aprobación previa = RECHAZO ⇒ motivo obligatorio (P1).
                requiresReason: (toState?.isFinal ?? false) && !row.approvedAt,
              };
            })
        : [];

    return {
      ...item,
      description: row.description,
      criticalityDefault: type?.criticalityDefault ?? null,
      riskProbability: row.riskProbability,
      riskConsequence: row.riskConsequence,
      locationDetail: row.locationDetail,
      shiftCode: row.shiftCode,
      detectedAt: row.detectedAt?.toISOString() ?? null,
      plannedStart: row.plannedStart?.toISOString() ?? null,
      plannedEnd: row.plannedEnd?.toISOString() ?? null,
      originIncidentId: row.originIncidentId,
      originLogEntryId: row.originLogEntryId,
      originExceptionId: row.originExceptionId,
      workflowDefinitionId: row.workflowDefinitionId,
      workflowDefinitionVersionId: row.workflowDefinitionVersionId,
      states: states.map((s) => ({ key: s.key, name: s.name, order: s.order, isFinal: s.isFinal, color: s.color })),
      availableTransitions,
      workflow: row.workflowDefinitionVersionId ? await this.buildWorkflowView(row.workflowDefinitionVersionId, id) : null,
      events: events.map((e): WorkOrderEventDto => ({
        id: e.id,
        kind: e.kind,
        summary: e.summary,
        actorId: e.actorId,
        actorName: e.actorName ?? (e.actorId ? userNames.get(e.actorId) ?? null : null),
        occurredAt: e.occurredAt.toISOString(),
        metadata: (e.metadata as Record<string, unknown> | null) ?? null,
      })),
      approvedAt: row.approvedAt?.toISOString() ?? null,
      folioIssuedAt: row.folioIssuedAt?.toISOString() ?? null,
      planFrozenAt: row.planFrozenAt?.toISOString() ?? null,
      executionSetConfirmedAt: row.executionSetConfirmedAt?.toISOString() ?? null,
      executionSetConfirmedById: row.executionSetConfirmedById,
      executionSetConfirmedByName: row.executionSetConfirmedById ? userNames.get(row.executionSetConfirmedById) ?? null : null,
      rejectedAt: row.rejectedAt?.toISOString() ?? null,
      rejectReason: row.rejectReason,
      closedAt: row.closedAt?.toISOString() ?? null,
      closureSummary: row.closureSummary,
      canceledAt: row.canceledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
    };
  }

  // === Creación ===============================================================

  async create(userId: string, dto: CreateWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const node = await this.prisma.orgNode.findFirst({ where: { id: dto.orgNodeId, deletedAt: null }, select: { id: true } });
    if (!node) throw new BadRequestException("El nodo indicado no existe");
    await this.assertNodeAccess(userId, dto.orgNodeId);

    const type = await this.prisma.workOrderType.findFirst({ where: { id: dto.typeId, deletedAt: null } });
    if (!type || !type.active) throw new BadRequestException("El tipo de OT no existe o está inactivo");

    if (dto.equipmentId) await this.assertEquipmentInNode(dto.equipmentId, dto.orgNodeId);
    if (dto.ownerId) await this.assertUserExists(dto.ownerId);
    const specialtyIds = await this.assertSpecialtiesActive(dto.specialtyIds);

    // Origen: la incidencia manda sobre la excepción; si no, DIRECT (bitácora se liga
    // por ref. blanda pero no cambia el origen — no hay LOG_ENTRY en el enum de OT).
    const originType = dto.originIncidentId ? "INCIDENT" : dto.originExceptionId ? "EXCEPTION" : "DIRECT";

    // Congela el flujo (S2): el del TIPO (si declara uno) o el global "ot-4-puertas".
    // La solicitud nace en el estado inicial (`borrador`) ⇒ lifecycle DRAFT (reemplaza
    // el provisional "nace OPEN" de S1).
    const wf = await this.resolveWorkflow(type.defaultWorkflowId);
    const graph = await this.loadVersionGraph(wf.versionId);
    const initial = [...graph.states.values()].find((s) => s.isInitial);
    if (!initial) throw new BadRequestException("El flujo de OT no tiene estado inicial");

    const now = new Date();
    const row = await this.prisma.workOrder.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        typeId: dto.typeId,
        lifecycle: "DRAFT",
        workflowDefinitionId: wf.definitionId,
        workflowDefinitionVersionId: wf.versionId,
        currentStateKey: initial.key,
        currentStateSince: now,
        originType,
        criticality: dto.criticality,
        priority: dto.priority ?? "MEDIUM",
        requiresPtw: dto.requiresPtw ?? type.requiresPtwDefault,
        riskProbability: dto.riskProbability ?? null,
        riskConsequence: dto.riskConsequence ?? null,
        orgNodeId: dto.orgNodeId,
        equipmentId: dto.equipmentId ?? null,
        locationDetail: dto.locationDetail ?? null,
        requesterId: userId,
        ownerId: dto.ownerId ?? null,
        detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : null,
        plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
        plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        originIncidentId: dto.originIncidentId ?? null,
        originLogEntryId: dto.originLogEntryId ?? null,
        originExceptionId: dto.originExceptionId ?? null,
        createdById: userId,
        updatedById: userId,
        specialties: { create: specialtyIds.map((specialtyId) => ({ specialtyId })) },
      },
    });
    await this.addEvent(row.id, "CREATED", `Solicitud ${workOrderCode(row.folio, row.number)} creada`, ctx, {
      originType: row.originType,
      originIncidentId: row.originIncidentId,
      originExceptionId: row.originExceptionId,
    });
    if (dto.ownerId) {
      const name = (await this.resolveUserNames([dto.ownerId])).get(dto.ownerId) ?? dto.ownerId;
      await this.addEvent(row.id, "ASSIGNED", `Responsable asignado: ${name}`, ctx);
    }
    await this.audit.record({ ...ctx, action: "workorder.created", entityType: "WorkOrder", entityId: row.id, after: this.snapshot(row) });
    return this.getDetail(userId, row.id);
  }

  // === Transición de flujo (S2 — Puerta 1) ===================================

  /**
   * Ejecuta una transición del flujo CONGELADO (espejo de IncidentsService.transition):
   * (a) la transición debe partir del estado actual; (b) rol-dato autorizado (lista
   * vacía = abierta al permiso base `workorder:transition`); (c) firma Part 11 opt-in
   * re-autenticada ANTES de mutar (§11.200). Semántica de PUERTA 1 (data-driven, sin
   * claves de estado en duro):
   *  - APROBACIÓN = ENTRAR al estado emisor (`type.folioOnStateKey` ?? "aprobada"):
   *    fija approvedAt/approvedById y EMITE EL FOLIO gapless (FolioCounter) dentro de
   *    la MISMA transacción, antes de escribir el nuevo estado.
   *  - RECHAZO = llegar a un estado FINAL sin haber sido aprobada nunca: exige motivo,
   *    fija rejectedAt/rejectReason y el lifecycle queda CANCELED (la solicitud murió).
   *  - Estado FINAL tras aprobación = CIERRE (closedAt/closureSummary, CLOSED). Los
   *    guards de cierre de la Puerta 4 (checklists/actividades) llegan en S3–S5.
   */
  async transition(userId: string, id: string, dto: TransitionWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const row = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    if (row.lifecycle === "CLOSED" || row.lifecycle === "CANCELED") {
      throw new BadRequestException("La orden de trabajo ya está cerrada o anulada");
    }
    if (!row.workflowDefinitionVersionId || !row.currentStateKey) {
      throw new BadRequestException("La orden de trabajo no tiene un flujo configurado");
    }
    const graph = await this.loadVersionGraph(row.workflowDefinitionVersionId);
    const transition = graph.transitions.find((t) => t.key === dto.transitionKey);
    if (!transition) throw new NotFoundException("Transición no encontrada en el flujo");
    if (transition.fromKey !== row.currentStateKey) {
      throw new BadRequestException("La transición no parte del estado actual");
    }
    const roleIds = await this.userRoleIds(userId);
    if (transition.roleIds.length > 0 && !transition.roleIds.some((r) => roleIds.has(r))) {
      throw new ForbiddenException("No tiene un rol autorizado para ejecutar esta transición");
    }
    // Firma (opt-in Part 11): re-autenticación ANTES de mutar (§11.200). El registro
    // criptográfico de firma (payloadHash) queda como deuda COMPARTIDA con Incidencias
    // (misma decisión, DECISIONS 2026-07-01 S2): aquí se EXIGE y verifica la re-auth.
    let signerName: string | null = null;
    if (transition.requireSignature) {
      const reauth = await this.reauth.verifyForSignature(
        userId,
        { password: dto.password, mfaCode: dto.mfaCode },
        { requireMfa: transition.requireMfa },
      );
      signerName = reauth.signerName;
    }

    const fromState = graph.states.get(transition.fromKey)!;
    const toState = graph.states.get(transition.toKey)!;
    const now = new Date();
    const becomesFinal = toState.isFinal;

    // Puerta 1 — semántica data-driven de aprobación/rechazo/folio.
    // Puerta 2 — claves data-driven de sugerencia/puerta de checklists (S3).
    const type = await this.prisma.workOrderType.findUnique({
      where: { id: row.typeId },
      select: { folioScheme: true, folioOnStateKey: true, checklistGateStateKey: true, planFreezeStateKey: true, executeStateKey: true, resolutionDueMinutes: true },
    });
    const folioStateKey = type?.folioOnStateKey ?? DEFAULT_WORK_ORDER_FOLIO_STATE_KEY;
    const checklistGateStateKey = type?.checklistGateStateKey ?? DEFAULT_WORK_ORDER_CHECKLIST_GATE_STATE_KEY;
    const planFreezeStateKey = type?.planFreezeStateKey ?? DEFAULT_WORK_ORDER_PLAN_FREEZE_STATE_KEY;
    const executeStateKey = type?.executeStateKey ?? DEFAULT_WORK_ORDER_EXECUTE_STATE_KEY;

    // GUARD Puerta 2 (momento AUTHORIZATION): sólo se ENTRA al estado-puerta con los
    // checklists obligatorios de AUTORIZACIÓN aprobados (espejo de assertNoBlockingActions)
    // + Gobierno 2: el aprobador debe haber CONFIRMADO el set de verificaciones de EJECUCIÓN
    // (§11.5) — así "lo aplicado en terreno = lo autorizado".
    if (toState.key === checklistGateStateKey) {
      await this.checklists.assertChecklistsCompleteForMoment(id, "AUTHORIZATION");
      await this.checklists.assertExecutionSetConfirmed(id);
    }
    // GUARD Puerta 3: sólo se autoriza el plan (se CONGELA la baseline) con ≥1 actividad.
    const isPlanFreeze = toState.key === planFreezeStateKey && !row.planFrozenAt;
    if (isPlanFreeze) {
      await this.activities.assertPlanReadyToFreeze(id);
    }
    // GUARD "no se ejecuta sin plan aprobado": sólo se ENTRA a ejecución con la baseline
    // congelada (planNotFrozen puro). El grafo del flujo ya fuerza el orden; esto es la
    // red de seguridad ante un flujo mal configurado (atajo que salte la Puerta 3).
    if (toState.key === executeStateKey && planNotFrozen(row)) {
      throw new BadRequestException("No se puede ejecutar: el plan de trabajo aún no ha sido autorizado (baseline sin congelar).");
    }
    // GUARD Puerta 4: no se cierra con actividades obligatorias del plan abiertas, ni con
    // verificaciones de EJECUCIÓN obligatorias sin aprobar (backstop del gate por actividad),
    // ni con checklists de CIERRE obligatorios sin aprobar (retiro de controles, reenergizar).
    if (becomesFinal && row.approvedAt) {
      await this.activities.assertActivitiesComplete(id);
      await this.checklists.assertChecklistsCompleteForMoment(id, "EXECUTION");
      await this.checklists.assertChecklistsCompleteForMoment(id, "CLOSURE");
    }
    const isApproval = toState.key === folioStateKey && !row.approvedAt;
    const isRejection = becomesFinal && !row.approvedAt && !isApproval;
    if (isRejection && !dto.reason?.trim()) {
      throw new BadRequestException("El rechazo exige un motivo");
    }
    const approvedAtAfter = row.approvedAt ?? (isApproval ? now : null);
    // SLA (S6): al APROBAR se auto-fija el PLAZO de resolución desde el SLA del tipo,
    // anclado al instante de aprobación (la OT recién pasa a ser trabajo real). El
    // override manual (dueAt ya fijado en la solicitud) GANA: sólo se calcula si está null.
    const autoDueAt = isApproval && row.dueAt == null ? workOrderDueFromType(now.getTime(), type?.resolutionDueMinutes ?? null) : null;
    const lifecycleAfter = deriveWorkOrderLifecycle({
      canceledAt: row.canceledAt,
      currentStateIsFinal: becomesFinal,
      approvedAt: approvedAtAfter,
      fallback: toState.isInitial ? "DRAFT" : "OPEN",
    });

    let issuedFolio: string | null = null;
    let frozenCount = 0;
    await this.prisma.$transaction(async (tx) => {
      // Puerta 3 (S4): CONGELA la baseline del plan (planned* → baseline*) dentro de la
      // misma transacción de la transición, antes de escribir el nuevo estado.
      if (isPlanFreeze) frozenCount = await this.activities.freezeBaselineWithinTx(tx, id);
      // FOLIO gapless (fork W4): se emite al ENTRAR al estado emisor, DENTRO de la
      // transacción y ANTES de escribir el nuevo estado (si algo falla, no se quema).
      let folioFields: Prisma.WorkOrderUpdateInput = {};
      if (row.folio == null && toState.key === folioStateKey) {
        const scheme = resolveFolioScheme(type?.folioScheme ?? null);
        const seqKey = buildFolioSeqKey(scheme, {
          entity: "workorder",
          typeId: row.typeId,
          orgNodeId: row.orgNodeId,
          structureId: row.orgNode?.structureId ?? null,
          year: this.folio.plantYear(now),
        });
        const seq = await this.folio.next(tx, seqKey, scheme.start);
        issuedFolio = renderFolio(scheme, seq, { year: this.folio.plantYear(now) });
        folioFields = { folio: issuedFolio, folioSeqKey: seqKey, folioIssuedAt: now };
      }
      await tx.workOrderTransition.create({
        data: {
          workOrderId: id,
          workflowDefinitionVersionId: row.workflowDefinitionVersionId!,
          transitionKey: transition.key,
          fromStateKey: transition.fromKey,
          toStateKey: transition.toKey,
          actorId: userId,
          actorEmail: ctx.actorEmail ?? null,
          reason: dto.reason ?? null,
          occurredAt: now,
        },
      });
      await tx.workOrder.update({
        where: { id },
        data: {
          ...folioFields,
          currentStateKey: toState.key,
          currentStateSince: now,
          lifecycle: lifecycleAfter,
          updatedById: userId,
          ...(isApproval ? { approvedAt: now, approvedById: userId } : {}),
          ...(autoDueAt ? { dueAt: autoDueAt } : {}),
          ...(isPlanFreeze ? { planFrozenAt: now, planFrozenById: userId } : {}),
          ...(isRejection ? { rejectedAt: now, rejectedById: userId, rejectReason: dto.reason!.trim() } : {}),
          ...(becomesFinal && !isRejection
            ? { closedAt: now, closedById: userId, closureSummary: dto.closureSummary ?? null }
            : {}),
        },
      });
      const kind = isRejection
        ? "REJECTED"
        : isApproval
          ? "APPROVED"
          : becomesFinal
            ? "CLOSED"
            : fromState.isInitial
              ? "SENT"
              : "TRANSITION";
      await tx.workOrderEvent.create({
        data: {
          workOrderId: id,
          kind,
          summary: `${transition.label} → ${toState.name}${signerName ? ` (firmado por ${signerName})` : ""}${isRejection ? ` · Motivo: ${dto.reason!.trim()}` : ""}`,
          actorId: userId,
          actorName: signerName,
          metadata: { transitionKey: transition.key, fromStateKey: transition.fromKey, toStateKey: transition.toKey },
        },
      });
      if (issuedFolio) {
        await tx.workOrderEvent.create({
          data: {
            workOrderId: id,
            kind: "FOLIO_ISSUED",
            summary: `Folio oficial emitido: ${issuedFolio}`,
            actorId: userId,
            actorName: signerName,
            metadata: { folio: issuedFolio },
          },
        });
      }
      if (autoDueAt) {
        await tx.workOrderEvent.create({
          data: {
            workOrderId: id,
            kind: "DUE_CHANGED",
            summary: `Plazo de resolución fijado automáticamente: ${autoDueAt.toLocaleString("es-CL")}`,
            actorId: userId,
            actorName: signerName,
            metadata: { dueAt: autoDueAt.toISOString(), source: "auto" },
          },
        });
      }
      if (isPlanFreeze) {
        await tx.workOrderEvent.create({
          data: {
            workOrderId: id,
            kind: "PLAN_FROZEN",
            summary: `Plan autorizado: baseline congelada (${frozenCount} actividad${frozenCount === 1 ? "" : "es"})`,
            actorId: userId,
            actorName: signerName,
            metadata: { frozenActivities: frozenCount },
          },
        });
      }
    });
    // SUGERENCIA por ESTADO (idempotente, fuera de la tx: si fallara no revierte una
    // transición ya válida). El orquestador materializa lo que corresponde al estado que
    // se ENTRA: AUTORIZACIÓN + SET de EJECUCIÓN por actividad al preparar (S3+S5b), CIERRE
    // al entrar a la revisión de cierre (S5b) — así cada checklist aparece a tiempo.
    await this.checklists.materializeForState(id, toState.key, userId);
    await this.audit.record({
      ...ctx,
      action: "workorder.transition.executed",
      entityType: "WorkOrder",
      entityId: id,
      after: {
        transitionKey: transition.key,
        toStateKey: toState.key,
        signed: transition.requireSignature,
        ...(issuedFolio ? { folio: issuedFolio } : {}),
      },
    });
    return this.getDetail(userId, id);
  }

  // === Edición de atributos ==================================================

  async update(userId: string, id: string, dto: UpdateWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const before = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, before.orgNodeId);
    if (before.lifecycle === "CLOSED" || before.lifecycle === "CANCELED") {
      throw new BadRequestException("La orden de trabajo ya está cerrada o anulada");
    }
    if (dto.typeId) {
      const type = await this.prisma.workOrderType.findFirst({ where: { id: dto.typeId, deletedAt: null } });
      if (!type || !type.active) throw new BadRequestException("El tipo de OT no existe o está inactivo");
    }
    if (dto.equipmentId) await this.assertEquipmentInNode(dto.equipmentId, before.orgNodeId);
    const specialtyIds = dto.specialtyIds !== undefined ? await this.assertSpecialtiesActive(dto.specialtyIds) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id },
        data: {
          title: dto.title === undefined ? undefined : dto.title,
          description: dto.description === undefined ? undefined : dto.description,
          typeId: dto.typeId === undefined ? undefined : dto.typeId,
          criticality: dto.criticality === undefined ? undefined : dto.criticality,
          priority: dto.priority === undefined ? undefined : dto.priority,
          requiresPtw: dto.requiresPtw === undefined ? undefined : dto.requiresPtw,
          riskProbability: dto.riskProbability === undefined ? undefined : dto.riskProbability,
          riskConsequence: dto.riskConsequence === undefined ? undefined : dto.riskConsequence,
          equipmentId: dto.equipmentId === undefined ? undefined : dto.equipmentId,
          locationDetail: dto.locationDetail === undefined ? undefined : dto.locationDetail,
          detectedAt: dto.detectedAt === undefined ? undefined : dto.detectedAt ? new Date(dto.detectedAt) : null,
          plannedStart: dto.plannedStart === undefined ? undefined : dto.plannedStart ? new Date(dto.plannedStart) : null,
          plannedEnd: dto.plannedEnd === undefined ? undefined : dto.plannedEnd ? new Date(dto.plannedEnd) : null,
          dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
          updatedById: userId,
        },
      });
      // N:N de especialidades: reemplazo total cuando se envía la lista (patrón set).
      if (specialtyIds !== undefined) {
        await tx.workOrderSpecialty.deleteMany({ where: { workOrderId: id } });
        if (specialtyIds.length) await tx.workOrderSpecialty.createMany({ data: specialtyIds.map((specialtyId) => ({ workOrderId: id, specialtyId })) });
      }
    });
    const after = await this.loadWorkOrder(id);
    // Cambio MANUAL del plazo de resolución (S6) ⇒ evento en el timeline (trazabilidad).
    if (dto.dueAt !== undefined && (before.dueAt?.getTime() ?? null) !== (after.dueAt?.getTime() ?? null)) {
      await this.addEvent(
        id,
        "DUE_CHANGED",
        after.dueAt ? `Plazo de resolución actualizado: ${after.dueAt.toLocaleString("es-CL")}` : "Plazo de resolución quitado",
        ctx,
        { dueAt: after.dueAt?.toISOString() ?? null, source: "manual" },
      );
    }
    await this.audit.record({ ...ctx, action: "workorder.updated", entityType: "WorkOrder", entityId: id, before: this.snapshot(before), after: this.snapshot(after) });
    return this.getDetail(userId, id);
  }

  async assign(userId: string, id: string, dto: AssignWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const before = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, before.orgNodeId);
    if (before.lifecycle === "CLOSED" || before.lifecycle === "CANCELED") {
      throw new BadRequestException("La orden de trabajo ya está cerrada o anulada");
    }
    if (dto.ownerId) await this.assertUserExists(dto.ownerId);
    await this.prisma.workOrder.update({ where: { id }, data: { ownerId: dto.ownerId, updatedById: userId } });
    const name = dto.ownerId ? (await this.resolveUserNames([dto.ownerId])).get(dto.ownerId) ?? dto.ownerId : null;
    await this.addEvent(id, "ASSIGNED", name ? `Responsable asignado: ${name}` : "Responsable removido", ctx, { ownerId: dto.ownerId });
    await this.audit.record({ ...ctx, action: "workorder.assigned", entityType: "WorkOrder", entityId: id, after: { ownerId: dto.ownerId } });
    return this.getDetail(userId, id);
  }

  async cancel(userId: string, id: string, dto: CancelWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const row = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    if (row.lifecycle === "CANCELED") throw new BadRequestException("La orden de trabajo ya está anulada");
    const now = new Date();
    await this.prisma.workOrder.update({
      where: { id },
      data: { lifecycle: "CANCELED", canceledAt: now, cancelReason: dto.reason, canceledById: userId, updatedById: userId },
    });
    await this.addEvent(id, "CANCELED", `Orden de trabajo anulada: ${dto.reason}`, ctx);
    await this.audit.record({ ...ctx, action: "workorder.canceled", entityType: "WorkOrder", entityId: id, after: { reason: dto.reason } });
    return this.getDetail(userId, id);
  }

  // === Catálogos (tipos / áreas / especialidades) ============================

  async listTypes(includeInactive = false): Promise<WorkOrderTypeDto[]> {
    const rows = await this.prisma.workOrderType.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const wfIds = rows.map((r) => r.defaultWorkflowId).filter((x): x is string => !!x);
    const wfNames = wfIds.length
      ? new Map((await this.prisma.workflowDefinition.findMany({ where: { id: { in: wfIds } }, select: { id: true, name: true } })).map((w) => [w.id, w.name]))
      : new Map<string, string>();
    const roleIds = rows.map((r) => r.escalationRoleId).filter((x): x is string => !!x);
    const roleNames = roleIds.length
      ? new Map((await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]))
      : new Map<string, string>();
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      color: r.color,
      defaultWorkflowId: r.defaultWorkflowId,
      defaultWorkflowName: r.defaultWorkflowId ? wfNames.get(r.defaultWorkflowId) ?? null : null,
      requiresPtwDefault: r.requiresPtwDefault,
      criticalityDefault: r.criticalityDefault,
      folioScheme: (r.folioScheme as FolioScheme | null) ?? null,
      folioOnStateKey: r.folioOnStateKey,
      checklistSuggestStateKey: r.checklistSuggestStateKey,
      checklistGateStateKey: r.checklistGateStateKey,
      planFreezeStateKey: r.planFreezeStateKey,
      executeStateKey: r.executeStateKey,
      closureChecklistSuggestStateKey: r.closureChecklistSuggestStateKey,
      resolutionDueMinutes: r.resolutionDueMinutes,
      escalationAfterMinutes: r.escalationAfterMinutes,
      escalationRoleId: r.escalationRoleId,
      escalationRoleName: r.escalationRoleId ? roleNames.get(r.escalationRoleId) ?? null : null,
      active: r.active,
      sortOrder: r.sortOrder,
    }));
  }

  async upsertType(dto: UpsertWorkOrderTypeRequest, ctx: AuditContext, failIfExists = false): Promise<WorkOrderTypeDto> {
    if (failIfExists) {
      const existing = await this.prisma.workOrderType.findUnique({ where: { key: dto.key } });
      if (existing) throw new ConflictException(`Ya existe un tipo de OT con la clave "${dto.key}".`);
    }
    if (dto.defaultWorkflowId) {
      const wf = await this.prisma.workflowDefinition.findFirst({ where: { id: dto.defaultWorkflowId, deletedAt: null } });
      if (!wf) throw new BadRequestException("El flujo por defecto indicado no existe");
      if (wf.status !== "PUBLISHED" || !wf.currentVersionId) throw new BadRequestException("El flujo por defecto debe estar publicado");
    }
    if (dto.escalationRoleId) {
      const role = await this.prisma.role.findFirst({ where: { id: dto.escalationRoleId } });
      if (!role) throw new BadRequestException("El rol de escalamiento indicado no existe");
    }
    const data = {
      name: dto.name,
      description: dto.description ?? null,
      color: dto.color ?? null,
      defaultWorkflowId: dto.defaultWorkflowId ?? null,
      requiresPtwDefault: dto.requiresPtwDefault ?? false,
      criticalityDefault: dto.criticalityDefault ?? null,
      // Folio configurable (fork W4): el Zod del pipe ya validó el esquema.
      folioScheme: (dto.folioScheme ?? null) as Prisma.InputJsonValue,
      folioOnStateKey: dto.folioOnStateKey ?? null,
      checklistSuggestStateKey: dto.checklistSuggestStateKey ?? null,
      checklistGateStateKey: dto.checklistGateStateKey ?? null,
      planFreezeStateKey: dto.planFreezeStateKey ?? null,
      executeStateKey: dto.executeStateKey ?? null,
      closureChecklistSuggestStateKey: dto.closureChecklistSuggestStateKey ?? null,
      resolutionDueMinutes: dto.resolutionDueMinutes ?? null,
      escalationAfterMinutes: dto.escalationAfterMinutes ?? null,
      escalationRoleId: dto.escalationRoleId ?? null,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const row = await this.prisma.workOrderType.upsert({ where: { key: dto.key }, create: { key: dto.key, ...data }, update: data });
    await this.audit.record({ ...ctx, action: "workordertype.upserted", entityType: "WorkOrderType", entityId: row.id, after: { key: row.key, name: row.name } });
    return (await this.listTypes(true)).find((t) => t.id === row.id)!;
  }

  async listSpecialties(includeInactive = false): Promise<SpecialtyDto[]> {
    const rows = await this.prisma.specialty.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, color: r.color, active: r.active, sortOrder: r.sortOrder }));
  }

  async upsertSpecialty(dto: UpsertSpecialtyRequest, ctx: AuditContext, failIfExists = false): Promise<SpecialtyDto> {
    if (failIfExists) {
      const existing = await this.prisma.specialty.findUnique({ where: { key: dto.key } });
      if (existing) throw new ConflictException(`Ya existe una especialidad con la clave "${dto.key}".`);
    }
    const data = { name: dto.name, description: dto.description ?? null, color: dto.color ?? null, active: dto.active ?? true, sortOrder: dto.sortOrder ?? 0 };
    const row = await this.prisma.specialty.upsert({ where: { key: dto.key }, create: { key: dto.key, ...data }, update: data });
    await this.audit.record({ ...ctx, action: "workorderspecialty.upserted", entityType: "Specialty", entityId: row.id, after: { key: row.key, name: row.name } });
    return { id: row.id, key: row.key, name: row.name, description: row.description, color: row.color, active: row.active, sortOrder: row.sortOrder };
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

  /** Equipos/activos del nodo (ABAC por nodo). Self-contained (gate `workorder:create/view`). */
  async equipmentOptions(userId: string, nodeId: string): Promise<Array<{ id: string; name: string; tag: string | null }>> {
    await this.assertNodeAccess(userId, nodeId);
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
    // structureId: lo usa el scope "structure" del folio (buildFolioSeqKey).
    orgNode: { select: { name: true, structureId: true } },
    equipment: { select: { tag: true } },
    specialties: { include: { specialty: { select: { id: true, name: true, color: true } } } },
  } satisfies Prisma.WorkOrderInclude;

  private orderByFor(sort: WorkOrderListQuery["sort"]): Prisma.WorkOrderOrderByWithRelationInput[] {
    switch (sort) {
      case "criticality":
        return [{ criticality: "desc" }, { createdAt: "desc" }];
      case "priority":
        return [{ priority: "desc" }, { createdAt: "desc" }];
      case "due":
        return [{ dueAt: "asc" }, { createdAt: "desc" }];
      default:
        return [{ createdAt: "desc" }, { id: "desc" }];
    }
  }

  /**
   * WHERE con ABAC por nodo ∩ estructura + filtros. `null` = el usuario no alcanza
   * ningún nodo. Si se pasa `structureId` (estructura activa), se intersecta en AND
   * vía `orgNode.structureId` (aislamiento L1b): un usuario acotado a otra estructura
   * obtiene intersección vacía ⇒ lista vacía.
   */
  private async buildWhere(userId: string, q: WorkOrderListQuery, structureId?: string): Promise<Prisma.WorkOrderWhereInput | null> {
    const nodeIds = await this.scope.getAccessibleNodeIds(userId);
    if (nodeIds && nodeIds.size === 0) return null;
    let nodeFilter: string[] | undefined = nodeIds ? [...nodeIds] : undefined;
    if (q.orgNodeIds && q.orgNodeIds.length > 0) {
      nodeFilter = nodeFilter ? nodeFilter.filter((n) => q.orgNodeIds!.includes(n)) : q.orgNodeIds;
      if (nodeFilter.length === 0) return null;
    }
    const where: Prisma.WorkOrderWhereInput = {
      deletedAt: null,
      ...(nodeFilter ? { orgNodeId: { in: nodeFilter } } : {}),
      ...(structureId ? { orgNode: { structureId } } : {}),
      ...(q.lifecycle ? { lifecycle: q.lifecycle } : {}),
      ...(q.typeId ? { typeId: q.typeId } : {}),
      ...(q.criticality ? { criticality: q.criticality } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.originType ? { originType: q.originType } : {}),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
      ...(q.specialtyId ? { specialties: { some: { specialtyId: q.specialtyId } } } : {}),
      ...(q.requiresPtw ? { requiresPtw: true } : {}),
      ...(q.unassignedOnly ? { ownerId: null } : {}),
      ...(q.mine ? { OR: [{ ownerId: userId }, { requesterId: userId }] } : {}),
      ...(q.createdFrom || q.createdTo
        ? { createdAt: { ...(q.createdFrom ? { gte: q.createdFrom } : {}), ...(q.createdTo ? { lte: q.createdTo } : {}) } }
        : {}),
    };
    const and: Prisma.WorkOrderWhereInput[] = [];
    if (q.search && q.search.trim()) {
      const term = q.search.trim();
      const numMatch = term.match(/(\d+)/);
      and.push({
        OR: [
          { title: { contains: term, mode: "insensitive" } },
          { description: { contains: term, mode: "insensitive" } },
          { folio: { contains: term, mode: "insensitive" } },
          ...(numMatch ? [{ number: Number(numMatch[1]) }] : []),
        ],
      });
    }
    // Faceta del "vigía" (S6): salud del plazo/permanencia sobre OT ABIERTAS.
    if (q.slaStatus) {
      const now = new Date();
      const overdueActivity: Prisma.WorkOrderWhereInput = {
        activities: {
          some: {
            status: { notIn: ["DONE", "CANCELED"] },
            OR: [{ baselineEnd: { lt: now } }, { AND: [{ baselineEnd: null }, { plannedEnd: { lt: now } }] }],
          },
        },
      };
      if (q.slaStatus === "overdue") {
        and.push({ lifecycle: "OPEN", OR: [{ dueAt: { lt: now } }, overdueActivity] });
      } else if (q.slaStatus === "atRisk") {
        const window = new Date(now.getTime() + AT_RISK_WINDOW_MINUTES * 60_000);
        and.push({ lifecycle: "OPEN", dueAt: { gte: now, lte: window }, NOT: overdueActivity });
      } else if (q.slaStatus === "stalled") {
        const ids = await this.findStalledIds();
        and.push({ id: { in: ids } });
      }
    }
    if (and.length > 0) where.AND = and;
    return where;
  }

  /**
   * IDs de OT ABIERTAS con la PERMANENCIA de estado excedida (now − currentStateSince >
   * maxStayMinutes del estado actual de la versión CONGELADA). Mismo cálculo que el
   * detector del "vigía" (`WorkOrderSlaService`), aquí para el filtro de la grilla.
   */
  private async findStalledIds(): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT wo."id"
      FROM "WorkOrder" wo
      JOIN "WorkflowState" ws
        ON ws."workflowDefinitionVersionId" = wo."workflowDefinitionVersionId"
       AND ws."key" = wo."currentStateKey"
      WHERE wo."lifecycle" = 'OPEN'
        AND wo."deletedAt" IS NULL
        AND wo."currentStateKey" IS NOT NULL
        AND ws."maxStayMinutes" IS NOT NULL
        AND wo."currentStateSince" + (ws."maxStayMinutes" * interval '1 minute') < now()
      LIMIT 1000`;
    return rows.map((r) => r.id);
  }

  private async toListItems(rows: WorkOrderRow[]): Promise<WorkOrderListItem[]> {
    if (rows.length === 0) return [];
    // Grafos congelados (batched por versión, patrón Incidencias) para resolver el
    // nombre/color del estado actual sin denormalizarlos en la fila.
    const versionIds = [...new Set(rows.map((r) => r.workflowDefinitionVersionId).filter((x): x is string => !!x))];
    const graphs = new Map<string, VersionGraph>();
    for (const vid of versionIds) graphs.set(vid, await this.loadVersionGraph(vid));
    const userNames = await this.resolveUserNames(rows.flatMap((r) => [r.ownerId, r.requesterId]));
    // SEMÁFORO (S6): ¿qué OT de la página tienen ≥1 actividad vencida? (fin baseline, o
    // planificado si sin baseline, en el pasado y no cerrada). Una sola consulta batch.
    const now = new Date();
    const openIds = rows.filter((r) => r.lifecycle === "OPEN").map((r) => r.id);
    const overdueActivityWoIds = new Set<string>();
    if (openIds.length > 0) {
      const acts = await this.prisma.workActivity.findMany({
        where: {
          workOrderId: { in: openIds },
          status: { notIn: ["DONE", "CANCELED"] },
          OR: [{ baselineEnd: { lt: now } }, { AND: [{ baselineEnd: null }, { plannedEnd: { lt: now } }] }],
        },
        select: { workOrderId: true },
      });
      for (const a of acts) overdueActivityWoIds.add(a.workOrderId);
    }
    return rows.map((r) => {
      const graph = r.workflowDefinitionVersionId ? graphs.get(r.workflowDefinitionVersionId) : undefined;
      const state = graph && r.currentStateKey ? graph.states.get(r.currentStateKey) : undefined;
      // PERMANENCIA de estado excedida (indicador separado del semáforo de plazo, §21).
      const stalled =
        r.lifecycle === "OPEN" &&
        state?.maxStayMinutes != null &&
        now.getTime() - r.currentStateSince.getTime() > state.maxStayMinutes * 60_000;
      const slaStatus = workOrderTrafficLight(
        { dueAt: r.dueAt, lifecycle: r.lifecycle, hasOverdueActivity: overdueActivityWoIds.has(r.id) },
        now.getTime(),
      );
      return {
      id: r.id,
      code: workOrderCode(r.folio, r.number),
      folio: r.folio,
      title: r.title,
      typeId: r.typeId,
      typeName: r.type?.name ?? null,
      typeColor: r.type?.color ?? null,
      criticality: r.criticality,
      priority: r.priority,
      requiresPtw: r.requiresPtw,
      originType: r.originType,
      lifecycle: r.lifecycle,
      currentStateKey: r.currentStateKey,
      currentStateName: state?.name ?? null,
      currentStateColor: state?.color ?? null,
      orgNodeId: r.orgNodeId,
      orgNodeName: r.orgNode?.name ?? null,
      equipmentId: r.equipmentId,
      equipmentTag: r.equipment?.tag ?? null,
      ownerId: r.ownerId,
      ownerName: r.ownerId ? userNames.get(r.ownerId) ?? null : null,
      requesterId: r.requesterId,
      requesterName: r.requesterId ? userNames.get(r.requesterId) ?? null : null,
      specialties: r.specialties.map((s) => ({ id: s.specialty.id, name: s.specialty.name, color: s.specialty.color })),
      dueAt: r.dueAt?.toISOString() ?? null,
      slaStatus,
      stalled,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  /** Resuelve el flujo a CONGELAR: el del TIPO (si declara uno) → el global de OT. */
  private async resolveWorkflow(typeDefaultWorkflowId: string | null): Promise<{ definitionId: string; versionId: string }> {
    let def = typeDefaultWorkflowId
      ? await this.prisma.workflowDefinition.findFirst({ where: { id: typeDefaultWorkflowId, deletedAt: null } })
      : null;
    if (!def?.currentVersionId) {
      def = await this.prisma.workflowDefinition.findFirst({ where: { key: WORK_ORDER_WORKFLOW_KEY, deletedAt: null } });
    }
    if (!def?.currentVersionId) {
      throw new BadRequestException(`No hay un flujo de OT publicado. Publique uno (clave '${WORK_ORDER_WORKFLOW_KEY}').`);
    }
    return { definitionId: def.id, versionId: def.currentVersionId };
  }

  /** Grafo de la versión congelada (espejo de IncidentsService.loadVersionGraph). */
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

  /**
   * Vista COMPLETA del flujo para el diagrama gráfico (reusa el `WorkflowDiagram` de
   * Bitácoras): grafo (estados + transiciones, con nombres de rol resueltos) + recorrido
   * REAL ejecutado (WorkOrderTransition → shape de `LogEntryTransitionDto`). La firma va
   * null (deuda payloadHash compartida). Fiel al histórico: usa la versión CONGELADA.
   */
  private async buildWorkflowView(versionId: string, workOrderId: string): Promise<WorkOrderWorkflowView> {
    const version = await this.prisma.workflowDefinitionVersion.findUnique({
      where: { id: versionId },
      include: {
        states: true,
        transitions: { include: { fromState: { select: { key: true } }, toState: { select: { key: true } }, roles: { select: { roleId: true } } } },
      },
    });
    if (!version) return { states: [], transitions: [], executed: [] };
    const roleIds = [...new Set(version.transitions.flatMap((t) => t.roles.map((r) => r.roleId)))];
    const roleNames = roleIds.length
      ? new Map((await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })).map((r) => [r.id, r.name]))
      : new Map<string, string>();
    const labelByKey = new Map(version.transitions.map((t) => [t.key, t.label]));

    const executedRows = await this.prisma.workOrderTransition.findMany({ where: { workOrderId }, orderBy: { occurredAt: "asc" } });
    const actorNames = await this.resolveUserNames(executedRows.map((e) => e.actorId));

    return {
      states: version.states
        .sort((a, b) => a.order - b.order)
        .map((s) => ({
          id: s.id,
          key: s.key,
          name: s.name,
          description: s.description,
          order: s.order,
          isInitial: s.isInitial,
          isFinal: s.isFinal,
          color: s.color,
          maxStayMinutes: s.maxStayMinutes,
        })),
      transitions: version.transitions
        .sort((a, b) => a.order - b.order)
        .map((t) => ({
          id: t.id,
          key: t.key,
          label: t.label,
          fromStateKey: t.fromState.key,
          toStateKey: t.toState.key,
          order: t.order,
          requireSignature: t.requireSignature,
          signatureMeaning: t.signatureMeaning,
          requireMfa: t.requireMfa,
          notify: null,
          roleIds: t.roles.map((r) => r.roleId),
          roleNames: t.roles.map((r) => roleNames.get(r.roleId) ?? r.roleId),
        })),
      executed: executedRows.map((e) => ({
        id: e.id,
        transitionKey: e.transitionKey,
        label: labelByKey.get(e.transitionKey) ?? null,
        fromStateKey: e.fromStateKey,
        toStateKey: e.toStateKey,
        actorId: e.actorId,
        actorName: e.actorId ? actorNames.get(e.actorId) ?? null : null,
        reason: e.reason,
        signature: null,
        occurredAt: e.occurredAt.toISOString(),
      })),
    };
  }

  private async userRoleIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return new Set(rows.map((r) => r.roleId));
  }

  /** Timeline append-only (WorkOrderEvent), espejo de addActivity de Incidencias. */
  private async addEvent(workOrderId: string, kind: string, summary: string, ctx: AuditContext, metadata?: Record<string, unknown>): Promise<void> {
    await this.prisma.workOrderEvent.create({
      data: { workOrderId, kind, summary, actorId: ctx.actorId ?? null, actorName: null, metadata: (metadata ?? null) as Prisma.InputJsonValue },
    });
  }

  private async loadWorkOrder(id: string): Promise<WorkOrderRow> {
    const row = await this.prisma.workOrder.findFirst({ where: { id, deletedAt: null }, include: this.listInclude });
    if (!row) throw new NotFoundException("Orden de trabajo no encontrada");
    return row;
  }

  private async resolveUserNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
  }

  private async assertEquipmentInNode(equipmentId: string, orgNodeId: string): Promise<void> {
    const eq = await this.prisma.equipment.findFirst({ where: { id: equipmentId, deletedAt: null }, select: { orgNodeId: true, active: true } });
    if (!eq || !eq.active) throw new BadRequestException("El equipo indicado no existe o está inactivo");
    if (eq.orgNodeId !== orgNodeId) throw new BadRequestException("El equipo no pertenece al nodo de la orden de trabajo");
  }

  private async assertUserExists(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException("El usuario indicado no existe");
  }

  /** Valida que los ids de Especialidad existan y estén activos; devuelve la lista deduplicada. */
  private async assertSpecialtiesActive(ids: string[] | undefined): Promise<string[]> {
    if (!ids || ids.length === 0) return [];
    const unique = [...new Set(ids)];
    const found = await this.prisma.specialty.findMany({ where: { id: { in: unique }, deletedAt: null, active: true }, select: { id: true } });
    if (found.length !== unique.length) {
      throw new BadRequestException("Alguna especialidad no existe o está inactiva");
    }
    return unique;
  }

  private snapshot(row: { title: string; typeId: string; criticality: number; priority: string; lifecycle: string; ownerId: string | null }): Prisma.InputJsonValue {
    return { title: row.title, typeId: row.typeId, criticality: row.criticality, priority: row.priority, lifecycle: row.lifecycle, ownerId: row.ownerId };
  }
}

/** Fila de OT con los includes del listado. */
type WorkOrderRow = Prisma.WorkOrderGetPayload<{
  include: {
    type: { select: { name: true; color: true } };
    orgNode: { select: { name: true; structureId: true } };
    equipment: { select: { tag: true } };
    specialties: { include: { specialty: { select: { id: true; name: true; color: true } } } };
  };
}>;
