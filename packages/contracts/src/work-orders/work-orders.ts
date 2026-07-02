import { z } from "zod";
import { folioSchemeSchema } from "./folio.js";
import { workflowStateSchema, workflowTransitionSchema } from "../workflows/workflows.js";
import { logEntryTransitionSchema } from "../log-entries/log-entries.js";

/**
 * Órdenes de Trabajo / Work Orders (OT / PTW) — S1 cimientos + S2 Puerta 1.
 * Contratos compartidos back↔front. ESPEJO de `incidents/incidents.ts`.
 *
 * Una OT modela el flujo industrial Solicitud de Trabajo → Orden de Trabajo con
 * Permiso de Trabajo (PTW). Desde S2 la solicitud VIVE en el flujo configurable
 * "OT — 4 puertas PTW" (WorkflowDefinition congelada al crear, nace en `borrador`):
 * enviar → aprobar (EMITE FOLIO gapless + firma Part 11) / rechazar (motivo
 * obligatorio). Los CHECKLISTS (Form Builder) y las ACTIVIDADES llegan en S3–S5.
 * Ver docs/design/OT_DESIGN_ARCHITECTURE.md §3–§4.
 *
 * Diseño congelado por los forks W1–W8 (DECISIONS 2026-07-01):
 *  - W2: un único `workorder:transition` (dim. WORKFLOW); QUIÉN ejecuta cada puerta =
 *    DATO (`WorkflowTransitionRole`), no permisos fijos de puerta.
 *  - W4: folio gapless configurable (`folio.ts`): scope por-tipo + reinicio anual.
 *  - W6: el flujo de 4 puertas es SEED (dato clonable/simplificable), no código.
 *  - La criticidad es la escala 1..5 del ecosistema; el riesgo reusa la matriz ISO 31000.
 */

// === Vocabularios (DATO de presentación) =====================================

/** Criticidad operacional: escala 1..5 (tokens severidad del DS). */
export const workOrderCriticalitySchema = z.number().int().min(1).max(5);
export type WorkOrderCriticality = z.infer<typeof workOrderCriticalitySchema>;

/** Prioridad operacional (escala fija de industria). */
export const WORK_ORDER_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const workOrderPrioritySchema = z.enum(WORK_ORDER_PRIORITIES);
export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITIES)[number];

/** De dónde nació la OT (trazabilidad de origen). */
export const WORK_ORDER_ORIGINS = ["DIRECT", "RULE", "EXCEPTION", "PLANNED", "INCIDENT"] as const;
export const workOrderOriginSchema = z.enum(WORK_ORDER_ORIGINS);
export type WorkOrderOrigin = (typeof WORK_ORDER_ORIGINS)[number];

/** Estado de alto nivel DERIVADO (para filtros/KPIs). S1: DRAFT|OPEN; CLOSED/CANCELED = S2+. */
export const WORK_ORDER_LIFECYCLES = ["DRAFT", "OPEN", "CLOSED", "CANCELED"] as const;
export const workOrderLifecycleSchema = z.enum(WORK_ORDER_LIFECYCLES);
export type WorkOrderLifecycle = (typeof WORK_ORDER_LIFECYCLES)[number];

// === Catálogos configurables ==================================================

/** Clave estable de catálogo (minúsculas, números y guiones). */
export const workOrderCatalogKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "Usa solo minúsculas, números y guiones");

export const workOrderTypeSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  /** Flujo por defecto que se congela al crear una OT de este tipo (null = global). S2. */
  defaultWorkflowId: z.string().nullable(),
  defaultWorkflowName: z.string().nullable(),
  /** ¿Exige permiso de trabajo (PTW) por defecto? */
  requiresPtwDefault: z.boolean(),
  /** Criticidad 1..5 sugerida al crear (null = sin sugerencia). */
  criticalityDefault: z.number().int().nullable(),
  /** Esquema de folio configurable (fork W4; null = default OT por-tipo + anual). */
  folioScheme: folioSchemeSchema.nullable(),
  /** Estado del flujo al que, al ENTRAR, se emite el folio (null = "aprobada"). */
  folioOnStateKey: z.string().nullable(),
  /** Estado al que, al ENTRAR, se SUGIEREN los checklists aplicables (null = "en_preparacion"). S3. */
  checklistSuggestStateKey: z.string().nullable(),
  /** Estado (Puerta 2) al que sólo se puede ENTRAR con todos los checklists obligatorios APROBADOS (null = "checklists_ok"). S3. */
  checklistGateStateKey: z.string().nullable(),
  /** Estado (Puerta 3) al que, al ENTRAR, se CONGELA la baseline del plan (null = "plan_aprobado"). S4. */
  planFreezeStateKey: z.string().nullable(),
  /** Estado de ejecución al que sólo se ENTRA con la baseline del plan congelada (null = "en_ejecucion"). S4. */
  executeStateKey: z.string().nullable(),
  /** Estado al que, al ENTRAR, se SUGIEREN los checklists de CIERRE (null = "en_revision_cierre"). S5b. */
  closureChecklistSuggestStateKey: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type WorkOrderTypeDto = z.infer<typeof workOrderTypeSchema>;

/** Catálogo de Especialidad/disciplina (Work Center/Craft en los EAM líderes). */
export const workOrderTagSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  color: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type SpecialtyDto = z.infer<typeof workOrderTagSchema>;

/** Referencia liviana a una especialidad asociada (para chips en lista/detalle). */
export const workOrderTagRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().nullable(),
});
export type WorkOrderTagRef = z.infer<typeof workOrderTagRefSchema>;

// === OT (listado + detalle) ==================================================

/** Fila de listado (liviana, con nombres resueltos para mostrar). */
export const workOrderListItemSchema = z.object({
  id: z.string(),
  /** Código humano: folio oficial si existe (S2), si no el correlativo provisional "SOL-######". */
  code: z.string(),
  /** Folio oficial (OT-2026-0001); null hasta la aprobación (S2). */
  folio: z.string().nullable(),
  title: z.string(),
  typeId: z.string(),
  typeName: z.string().nullable(),
  typeColor: z.string().nullable(),
  criticality: workOrderCriticalitySchema,
  priority: workOrderPrioritySchema,
  requiresPtw: z.boolean(),
  originType: workOrderOriginSchema,
  lifecycle: workOrderLifecycleSchema,
  /** Estado del flujo congelado (clave + nombre + color, para el chip). */
  currentStateKey: z.string().nullable(),
  currentStateName: z.string().nullable(),
  currentStateColor: z.string().nullable(),
  orgNodeId: z.string(),
  orgNodeName: z.string().nullable(),
  equipmentId: z.string().nullable(),
  equipmentTag: z.string().nullable(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  requesterId: z.string().nullable(),
  requesterName: z.string().nullable(),
  specialties: z.array(workOrderTagRefSchema),
  dueAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkOrderListItem = z.infer<typeof workOrderListItemSchema>;

/** Estado del flujo congelado (para el stepper del detalle). */
export const workOrderStateSchema = z.object({
  key: z.string(),
  name: z.string(),
  order: z.number().int(),
  isFinal: z.boolean(),
  color: z.string().nullable(),
});
export type WorkOrderStateDto = z.infer<typeof workOrderStateSchema>;

/** Transición disponible desde el estado actual (para los botones del detalle). */
export const workOrderAvailableTransitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  toStateKey: z.string(),
  toStateName: z.string(),
  toStateIsFinal: z.boolean(),
  requireSignature: z.boolean(),
  requireMfa: z.boolean(),
  signatureMeaning: z.string().nullable(),
  /** Roles autorizados (nombres) — informativo para la UI. */
  roleNames: z.array(z.string()),
  /**
   * ¿Exige MOTIVO obligatorio? Derivado en el server: una transición a estado FINAL
   * de una OT que NUNCA fue aprobada es un RECHAZO (motivo obligatorio, Puerta 1).
   */
  requiresReason: z.boolean(),
});
export type WorkOrderAvailableTransition = z.infer<typeof workOrderAvailableTransitionSchema>;

/** Evento del timeline append-only (espejo de incidentActivitySchema). */
export const workOrderEventSchema = z.object({
  id: z.string(),
  kind: z.string(),
  summary: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  occurredAt: z.string(),
  metadata: z.record(z.unknown()).nullable(),
});
export type WorkOrderEventDto = z.infer<typeof workOrderEventSchema>;

/**
 * Vista COMPLETA del flujo congelado de la OT para el diagrama gráfico (reusa el
 * `WorkflowDiagram` de Bitácoras): grafo (estados + transiciones) + recorrido REAL
 * ejecutado. Espejo de `LogEntry.workflowVersion` + `transitions` — mismos shapes de
 * contrato ⇒ el mismo componente lo pinta sin adaptadores. null si la OT no tiene flujo.
 */
export const workOrderWorkflowViewSchema = z.object({
  states: z.array(workflowStateSchema),
  transitions: z.array(workflowTransitionSchema),
  /** Transiciones YA ejecutadas (recorrido real), en el shape de `LogEntryTransitionDto`. */
  executed: z.array(logEntryTransitionSchema),
});
export type WorkOrderWorkflowView = z.infer<typeof workOrderWorkflowViewSchema>;

export const workOrderDetailSchema = workOrderListItemSchema.extend({
  description: z.string().nullable(),
  criticalityDefault: z.number().int().nullable(),
  riskProbability: z.number().int().nullable(),
  riskConsequence: z.number().int().nullable(),
  locationDetail: z.string().nullable(),
  shiftCode: z.string().nullable(),
  detectedAt: z.string().nullable(),
  plannedStart: z.string().nullable(),
  plannedEnd: z.string().nullable(),
  /** Origen ligado (refs blandas). */
  originIncidentId: z.string().nullable(),
  originLogEntryId: z.string().nullable(),
  originExceptionId: z.string().nullable(),
  /** Flujo congelado (S2): grafo para el stepper + transiciones ejecutables. */
  workflowDefinitionId: z.string().nullable(),
  workflowDefinitionVersionId: z.string().nullable(),
  states: z.array(workOrderStateSchema),
  availableTransitions: z.array(workOrderAvailableTransitionSchema),
  /** Vista completa del flujo (grafo + recorrido) para el diagrama gráfico. null = sin flujo. */
  workflow: workOrderWorkflowViewSchema.nullable(),
  /** Timeline append-only (WorkOrderEvent). */
  events: z.array(workOrderEventSchema),
  /** Puerta 1: aprobación (emite folio) / rechazo (motivo obligatorio). */
  approvedAt: z.string().nullable(),
  folioIssuedAt: z.string().nullable(),
  /** Puerta 3 (S4): instante en que se autorizó/congeló la baseline del plan (null = plan no congelado). */
  planFrozenAt: z.string().nullable(),
  /** Gobierno 2 (S5b): confirmación del set de verificaciones de EJECUCIÓN (null = sin confirmar). */
  executionSetConfirmedAt: z.string().nullable(),
  executionSetConfirmedById: z.string().nullable(),
  executionSetConfirmedByName: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  rejectReason: z.string().nullable(),
  closedAt: z.string().nullable(),
  closureSummary: z.string().nullable(),
  canceledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
});
export type WorkOrderDetail = z.infer<typeof workOrderDetailSchema>;

// === Requests =================================================================

export const createWorkOrderRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  typeId: z.string().min(1),
  criticality: workOrderCriticalitySchema,
  priority: workOrderPrioritySchema.optional(),
  requiresPtw: z.boolean().optional(),
  riskProbability: z.number().int().min(1).max(7).nullable().optional(),
  riskConsequence: z.number().int().min(1).max(7).nullable().optional(),
  orgNodeId: z.string().min(1),
  equipmentId: z.string().min(1).nullable().optional(),
  locationDetail: z.string().trim().max(200).nullable().optional(),
  specialtyIds: z.array(z.string().min(1)).max(50).optional(),
  ownerId: z.string().min(1).nullable().optional(),
  detectedAt: z.string().datetime().nullable().optional(),
  plannedStart: z.string().datetime().nullable().optional(),
  plannedEnd: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  /** Origen desde una incidencia/excepción/bitácora (link manual; enlace pleno en S7). */
  originIncidentId: z.string().min(1).nullable().optional(),
  originLogEntryId: z.string().min(1).nullable().optional(),
  originExceptionId: z.string().min(1).nullable().optional(),
});
export type CreateWorkOrderRequest = z.infer<typeof createWorkOrderRequestSchema>;

/** Edición de atributos (no de estado: el estado avanzará por transición en S2). */
export const updateWorkOrderRequestSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  typeId: z.string().min(1).optional(),
  criticality: workOrderCriticalitySchema.optional(),
  priority: workOrderPrioritySchema.optional(),
  requiresPtw: z.boolean().optional(),
  riskProbability: z.number().int().min(1).max(7).nullable().optional(),
  riskConsequence: z.number().int().min(1).max(7).nullable().optional(),
  equipmentId: z.string().min(1).nullable().optional(),
  locationDetail: z.string().trim().max(200).nullable().optional(),
  specialtyIds: z.array(z.string().min(1)).max(50).optional(),
  detectedAt: z.string().datetime().nullable().optional(),
  plannedStart: z.string().datetime().nullable().optional(),
  plannedEnd: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
});
export type UpdateWorkOrderRequest = z.infer<typeof updateWorkOrderRequestSchema>;

export const assignWorkOrderRequestSchema = z.object({
  ownerId: z.string().min(1).nullable(),
});
export type AssignWorkOrderRequest = z.infer<typeof assignWorkOrderRequestSchema>;

/** Anulación/cancelación (sin borrado físico). */
export const cancelWorkOrderRequestSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type CancelWorkOrderRequest = z.infer<typeof cancelWorkOrderRequestSchema>;

/** Ejecutar una transición de flujo (mismo patrón que Incidencias). */
export const transitionWorkOrderRequestSchema = z.object({
  transitionKey: z.string().min(1),
  /** Comentario/motivo. OBLIGATORIO si la transición es un rechazo (`requiresReason`). */
  reason: z.string().trim().max(1000).optional(),
  /** Resumen de cierre (si la transición lleva a un estado final tras la aprobación). */
  closureSummary: z.string().trim().max(5000).optional(),
  /** Re-auth para transiciones que exigen firma (Part 11). */
  password: z.string().optional(),
  mfaCode: z.string().optional(),
});
export type TransitionWorkOrderRequest = z.infer<typeof transitionWorkOrderRequestSchema>;

// --- Listado / filtros / paginación ------------------------------------------

const csv = () =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v),
    z.array(z.string()).max(50),
  );

export const workOrderListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  lifecycle: workOrderLifecycleSchema.optional(),
  typeId: z.string().optional(),
  criticality: z.coerce.number().int().min(1).max(5).optional(),
  priority: workOrderPrioritySchema.optional(),
  originType: workOrderOriginSchema.optional(),
  orgNodeIds: csv().optional(),
  equipmentId: z.string().optional(),
  ownerId: z.string().optional(),
  specialtyId: z.string().optional(),
  requiresPtw: z.coerce.boolean().optional(),
  /** Solo las MÍAS (solicitante o responsable). */
  mine: z.coerce.boolean().optional(),
  /** Solo sin responsable. */
  unassignedOnly: z.coerce.boolean().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  sort: z.enum(["recent", "criticality", "priority", "due"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
export type WorkOrderListQuery = z.infer<typeof workOrderListQuerySchema>;

export const workOrderListResponseSchema = z.object({
  items: z.array(workOrderListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type WorkOrderListResponse = z.infer<typeof workOrderListResponseSchema>;

export const workOrderStatsSchema = z.object({
  /** Solicitudes en borrador (DRAFT). */
  draft: z.number().int(),
  /** Órdenes abiertas (OPEN). */
  open: z.number().int(),
  /** Abiertas con criticidad máxima (5). */
  critical: z.number().int(),
  /** Abiertas sin responsable. */
  unassigned: z.number().int(),
  /** Que exigen permiso de trabajo (PTW), abiertas o en borrador. */
  ptw: z.number().int(),
});
export type WorkOrderStats = z.infer<typeof workOrderStatsSchema>;

// --- Catálogo: requests de administración -------------------------------------

export const upsertWorkOrderTypeRequestSchema = z.object({
  key: workOrderCatalogKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  defaultWorkflowId: z.string().min(1).nullable().optional(),
  requiresPtwDefault: z.boolean().optional(),
  criticalityDefault: z.number().int().min(1).max(5).nullable().optional(),
  /** Esquema de folio (fork W4). null/omitido = default OT (por tipo + anual). */
  folioScheme: folioSchemeSchema.nullable().optional(),
  /** Estado emisor del folio. null/omitido = "aprobada". */
  folioOnStateKey: z.string().trim().min(1).max(64).nullable().optional(),
  /** Estado que dispara la sugerencia de checklists. null/omitido = "en_preparacion". S3. */
  checklistSuggestStateKey: z.string().trim().min(1).max(64).nullable().optional(),
  /** Estado-puerta de checklists (Puerta 2). null/omitido = "checklists_ok". S3. */
  checklistGateStateKey: z.string().trim().min(1).max(64).nullable().optional(),
  /** Estado que congela la baseline del plan (Puerta 3). null/omitido = "plan_aprobado". S4. */
  planFreezeStateKey: z.string().trim().min(1).max(64).nullable().optional(),
  /** Estado de ejecución (guard "no ejecuta sin plan"). null/omitido = "en_ejecucion". S4. */
  executeStateKey: z.string().trim().min(1).max(64).nullable().optional(),
  /** Estado que dispara la sugerencia de checklists de CIERRE. null/omitido = "en_revision_cierre". S5b. */
  closureChecklistSuggestStateKey: z.string().trim().min(1).max(64).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertWorkOrderTypeRequest = z.infer<typeof upsertWorkOrderTypeRequestSchema>;

/** Upsert de una Especialidad/disciplina. */
export const upsertWorkOrderTagRequestSchema = z.object({
  key: workOrderCatalogKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertSpecialtyRequest = z.infer<typeof upsertWorkOrderTagRequestSchema>;

// === Helpers PUROS (autoritativos back↔front) ================================

/** Código humano provisional a partir del correlativo interno ("SOL-######"). */
export function workOrderProvisionalCode(number: number): string {
  return `SOL-${String(number).padStart(6, "0")}`;
}

/** Código humano visible: folio oficial si existe (S2), si no el provisional. */
export function workOrderCode(folio: string | null, number: number): string {
  return folio ?? workOrderProvisionalCode(number);
}

/**
 * Resuelve el lifecycle derivado del estado del flujo (S2, Puerta 1):
 *  - anulada (endpoint cancel) ⇒ CANCELED;
 *  - estado FINAL alcanzado TRAS la aprobación ⇒ CLOSED (trabajo terminado);
 *  - estado FINAL alcanzado SIN aprobación (nunca hubo folio) ⇒ CANCELED (la
 *    solicitud murió rechazada — regla data-driven, sin claves de estado en duro);
 *  - si no, el fallback (DRAFT mientras está en el estado inicial, OPEN después).
 */
export function deriveWorkOrderLifecycle(opts: {
  canceledAt: Date | null;
  currentStateIsFinal: boolean;
  approvedAt: Date | null;
  fallback: WorkOrderLifecycle;
}): WorkOrderLifecycle {
  if (opts.canceledAt) return "CANCELED";
  if (opts.currentStateIsFinal) return opts.approvedAt ? "CLOSED" : "CANCELED";
  return opts.fallback;
}
