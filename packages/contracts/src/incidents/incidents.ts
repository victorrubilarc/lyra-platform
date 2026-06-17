import { z } from "zod";

/**
 * Incidencias operacionales / HSE (Fase 4.0 — núcleo) — contratos compartidos
 * back↔front.
 *
 * Una incidencia representa un evento/desviación/condición/falla que requiere
 * seguimiento formal: responsable, estado, SLA, evidencia, cierre y auditoría.
 * Single-tenant: el aislamiento es por NODO/PLANTILLA (ABAC), NUNCA por tenant.
 *
 * Diseño (DECISIONS 2026-06-16):
 *  - El CICLO DE VIDA reutiliza `WorkflowDefinition` (Fase 2.2): la incidencia
 *    CONGELA una versión de flujo y avanza por sus transiciones (mismas guardas
 *    de rol/firma que las entradas de bitácora). El `status` operativo se DERIVA
 *    del estado actual del flujo (`currentStateKey` → ¿isFinal?).
 *  - Los TIPOS/CATEGORÍAS son catálogos configurables (entidades dedicadas con
 *    flags de comportamiento), nada hardcodeado.
 *  - La SEVERIDAD es la escala 1..5 del ecosistema; el RIESGO reusa la matriz
 *    ISO 31000 (`RISK_MATRIX`/`riskLevelFor`).
 *  - El ORIGEN puede ser manual, una entrada de bitácora, una excepción (4.1) o
 *    el motor de reglas (4.1). La capa de EXCEPCIÓN se materializa en 4.1.
 */

// === Vocabularios (DATO de presentación, no reglas de negocio) ================

/** Severidad real / potencial de gravedad: escala 1..5 (tokens severidad del DS). */
export const incidentSeveritySchema = z.number().int().min(1).max(5);
export type IncidentSeverity = z.infer<typeof incidentSeveritySchema>;

/** Prioridad operacional. Escala fija (industria); el cálculo sugerido = fase posterior. */
export const INCIDENT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export const incidentPrioritySchema = z.enum(INCIDENT_PRIORITIES);
export type IncidentPriority = (typeof INCIDENT_PRIORITIES)[number];

/** De dónde nació la incidencia (trazabilidad de origen). */
export const INCIDENT_ORIGINS = ["MANUAL", "LOG_ENTRY", "EXCEPTION", "RULE"] as const;
export const incidentOriginSchema = z.enum(INCIDENT_ORIGINS);
export type IncidentOrigin = (typeof INCIDENT_ORIGINS)[number];

/** Estado de alto nivel DERIVADO del flujo (para filtros/KPIs sin leer el grafo). */
export const INCIDENT_LIFECYCLES = ["OPEN", "CLOSED", "CANCELED"] as const;
export const incidentLifecycleSchema = z.enum(INCIDENT_LIFECYCLES);
export type IncidentLifecycle = (typeof INCIDENT_LIFECYCLES)[number];

// === Catálogos configurables ==================================================

/** Clave estable de tipo/categoría (minúsculas, números y guiones). */
export const incidentCatalogKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "Usa solo minúsculas, números y guiones");

export const incidentTypeSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Token de color del DS para el chip (opcional). */
  color: z.string().nullable(),
  /** Flujo por defecto que se congela al crear una incidencia de este tipo (null = el global). */
  defaultWorkflowId: z.string().nullable(),
  defaultWorkflowName: z.string().nullable(),
  /** Comportamiento: ¿exige investigación / CAPA / reportabilidad por defecto? (se honra en 4.2/4.3). */
  requiresInvestigation: z.boolean(),
  requiresCapa: z.boolean(),
  reportableDefault: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type IncidentTypeDto = z.infer<typeof incidentTypeSchema>;

export const incidentCategorySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Tipo al que pertenece la categoría (null = categoría transversal). */
  typeId: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type IncidentCategoryDto = z.infer<typeof incidentCategorySchema>;

// === Incidencia (listado + detalle) ==========================================

/** Fila de listado/kanban (liviana, con nombres ya resueltos para mostrar). */
export const incidentListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  title: z.string(),
  typeId: z.string(),
  typeName: z.string().nullable(),
  typeColor: z.string().nullable(),
  categoryId: z.string().nullable(),
  categoryName: z.string().nullable(),
  severity: incidentSeveritySchema,
  potentialSeverity: incidentSeveritySchema.nullable(),
  priority: incidentPrioritySchema,
  originType: incidentOriginSchema,
  lifecycle: incidentLifecycleSchema,
  /** Estado del flujo (clave + nombre + color del estado actual). */
  currentStateKey: z.string().nullable(),
  currentStateName: z.string().nullable(),
  currentStateColor: z.string().nullable(),
  orgNodeId: z.string(),
  orgNodeName: z.string().nullable(),
  equipmentId: z.string().nullable(),
  equipmentTag: z.string().nullable(),
  ownerId: z.string().nullable(),
  ownerName: z.string().nullable(),
  reporterId: z.string().nullable(),
  reporterName: z.string().nullable(),
  dueAt: z.string().nullable(),
  /** Fecha/hora en que OCURRIÓ el evento (ISO 14224); null = no declarada (usar createdAt). */
  occurredAt: z.string().nullable(),
  /** SLA de permanencia: ¿el estado actual está atrasado? (derivado de maxStayMinutes). */
  slaBreached: z.boolean(),
  reportable: z.boolean(),
  /** Derivado: ¿tiene algún reporte PENDIENTE con el plazo vencido? (Fase 4.3). */
  reportOverdue: z.boolean(),
  commentCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IncidentListItem = z.infer<typeof incidentListItemSchema>;

export const incidentCommentSchema = z.object({
  id: z.string(),
  authorId: z.string().nullable(),
  authorName: z.string().nullable(),
  body: z.string(),
  createdAt: z.string(),
});
export type IncidentCommentDto = z.infer<typeof incidentCommentSchema>;

/** Evento del timeline append-only (cambios de estado/responsable/severidad/etc.). */
export const incidentActivitySchema = z.object({
  id: z.string(),
  kind: z.string(),
  summary: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string().nullable(),
  occurredAt: z.string(),
  metadata: z.record(z.unknown()).nullable(),
});
export type IncidentActivityDto = z.infer<typeof incidentActivitySchema>;

/** Transición de flujo disponible desde el estado actual (para los botones). */
export const incidentAvailableTransitionSchema = z.object({
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
});
export type IncidentAvailableTransition = z.infer<typeof incidentAvailableTransitionSchema>;

export const incidentDetailSchema = incidentListItemSchema.extend({
  description: z.string().nullable(),
  /** Flags de comportamiento del TIPO (gobiernan el cierre): exigir investigación / CAPA. */
  typeRequiresInvestigation: z.boolean(),
  typeRequiresCapa: z.boolean(),
  potentialSeverity: incidentSeveritySchema.nullable(),
  riskProbability: z.number().int().nullable(),
  riskConsequence: z.number().int().nullable(),
  shiftCode: z.string().nullable(),
  /** Origen: entrada de bitácora ligada (si nació de una). */
  originLogEntryId: z.string().nullable(),
  originLogEntryNumber: z.number().int().nullable(),
  workflowDefinitionId: z.string().nullable(),
  workflowDefinitionVersionId: z.string().nullable(),
  /** Estados del flujo congelado (para el stepper). */
  states: z.array(
    z.object({ key: z.string(), name: z.string(), order: z.number().int(), isFinal: z.boolean(), color: z.string().nullable() }),
  ),
  availableTransitions: z.array(incidentAvailableTransitionSchema),
  comments: z.array(incidentCommentSchema),
  activity: z.array(incidentActivitySchema),
  closedAt: z.string().nullable(),
  closedById: z.string().nullable(),
  closureSummary: z.string().nullable(),
  canceledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
});
export type IncidentDetail = z.infer<typeof incidentDetailSchema>;

// === Requests =================================================================

export const createIncidentRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  typeId: z.string().min(1),
  categoryId: z.string().min(1).nullable().optional(),
  severity: incidentSeveritySchema,
  potentialSeverity: incidentSeveritySchema.nullable().optional(),
  priority: incidentPrioritySchema.optional(),
  riskProbability: z.number().int().min(1).max(7).nullable().optional(),
  riskConsequence: z.number().int().min(1).max(7).nullable().optional(),
  orgNodeId: z.string().min(1),
  equipmentId: z.string().min(1).nullable().optional(),
  /** Origen desde una entrada de bitácora (link manual en 4.0). */
  originLogEntryId: z.string().min(1).nullable().optional(),
  ownerId: z.string().min(1).nullable().optional(),
  reportable: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  /** Fecha/hora en que ocurrió el evento (ISO 14224); ausente ⇒ se toma el momento de reporte. */
  occurredAt: z.string().datetime().nullable().optional(),
});
export type CreateIncidentRequest = z.infer<typeof createIncidentRequestSchema>;

/** Edición de atributos (no de estado: el estado avanza por transición). */
export const updateIncidentRequestSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  categoryId: z.string().min(1).nullable().optional(),
  severity: incidentSeveritySchema.optional(),
  potentialSeverity: incidentSeveritySchema.nullable().optional(),
  priority: incidentPrioritySchema.optional(),
  riskProbability: z.number().int().min(1).max(7).nullable().optional(),
  riskConsequence: z.number().int().min(1).max(7).nullable().optional(),
  equipmentId: z.string().min(1).nullable().optional(),
  reportable: z.boolean().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
});
export type UpdateIncidentRequest = z.infer<typeof updateIncidentRequestSchema>;

export const assignIncidentRequestSchema = z.object({
  ownerId: z.string().min(1).nullable(),
});
export type AssignIncidentRequest = z.infer<typeof assignIncidentRequestSchema>;

export const addIncidentCommentRequestSchema = z.object({
  body: z.string().trim().min(1).max(5000),
});
export type AddIncidentCommentRequest = z.infer<typeof addIncidentCommentRequestSchema>;

/** Ejecutar una transición de flujo (mismo patrón que las entradas de bitácora). */
export const transitionIncidentRequestSchema = z.object({
  transitionKey: z.string().min(1),
  reason: z.string().trim().max(1000).optional(),
  /** Resumen de cierre (si la transición lleva a un estado final). */
  closureSummary: z.string().trim().max(5000).optional(),
  /** Re-auth para transiciones que exigen firma (Part 11). */
  password: z.string().optional(),
  mfaCode: z.string().optional(),
});
export type TransitionIncidentRequest = z.infer<typeof transitionIncidentRequestSchema>;

/** Anulación/cancelación (sin borrado físico). Distinta del cierre normal. */
export const cancelIncidentRequestSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type CancelIncidentRequest = z.infer<typeof cancelIncidentRequestSchema>;

// --- Listado / filtros / paginación ------------------------------------------

const csv = () =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v),
    z.array(z.string()).max(50),
  );

export const incidentListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  lifecycle: incidentLifecycleSchema.optional(),
  typeId: z.string().optional(),
  categoryId: z.string().optional(),
  severity: z.coerce.number().int().min(1).max(5).optional(),
  priority: incidentPrioritySchema.optional(),
  originType: incidentOriginSchema.optional(),
  orgNodeIds: csv().optional(),
  equipmentId: z.string().optional(),
  ownerId: z.string().optional(),
  currentStateKey: z.string().optional(),
  /** Solo las MÍAS (reporter o responsable). */
  mine: z.coerce.boolean().optional(),
  /** Solo sin responsable. */
  unassignedOnly: z.coerce.boolean().optional(),
  /** Solo atrasadas (SLA de permanencia incumplido). */
  overdueOnly: z.coerce.boolean().optional(),
  /** Solo reportables. */
  reportableOnly: z.coerce.boolean().optional(),
  /** Solo con algún reporte PENDIENTE y vencido (Fase 4.3). */
  reportOverdueOnly: z.coerce.boolean().optional(),
  /** Solo creadas desde una bitácora/excepción/regla. */
  fromLogbookOnly: z.coerce.boolean().optional(),
  sort: z.enum(["recent", "severity", "priority", "due"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
export type IncidentListQuery = z.infer<typeof incidentListQuerySchema>;

export const incidentListResponseSchema = z.object({
  items: z.array(incidentListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type IncidentListResponse = z.infer<typeof incidentListResponseSchema>;

export const incidentStatsSchema = z.object({
  open: z.number().int(),
  critical: z.number().int(),
  overdue: z.number().int(),
  unassigned: z.number().int(),
  fromLogbook: z.number().int(),
  reportable: z.number().int(),
  /** Incidencias abiertas con al menos un reporte PENDIENTE vencido (Fase 4.3). */
  reportOverdue: z.number().int(),
});
export type IncidentStats = z.infer<typeof incidentStatsSchema>;

// --- Catálogo: requests de administración -------------------------------------

export const upsertIncidentTypeRequestSchema = z.object({
  key: incidentCatalogKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  defaultWorkflowId: z.string().min(1).nullable().optional(),
  requiresInvestigation: z.boolean().optional(),
  requiresCapa: z.boolean().optional(),
  reportableDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertIncidentTypeRequest = z.infer<typeof upsertIncidentTypeRequestSchema>;

export const upsertIncidentCategoryRequestSchema = z.object({
  key: incidentCatalogKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  typeId: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertIncidentCategoryRequest = z.infer<typeof upsertIncidentCategoryRequestSchema>;

/** Resuelve el lifecycle derivado a partir del estado actual del flujo. */
export function deriveLifecycle(opts: { canceledAt: Date | null; currentStateIsFinal: boolean }): IncidentLifecycle {
  if (opts.canceledAt) return "CANCELED";
  return opts.currentStateIsFinal ? "CLOSED" : "OPEN";
}
