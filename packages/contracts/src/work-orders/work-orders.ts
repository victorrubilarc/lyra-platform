import { z } from "zod";

/**
 * Órdenes de Trabajo / Work Orders (OT / PTW) — Sesión 1: CIMIENTOS.
 * Contratos compartidos back↔front. ESPEJO de `incidents/incidents.ts`.
 *
 * Una OT modela el flujo industrial Solicitud de Trabajo → Orden de Trabajo con
 * Permiso de Trabajo (PTW). En S1 solo vive la SOLICITUD: crear + listar (lifecycle
 * DRAFT/OPEN) con ABAC por nodo ∩ estructura (single-tenant). El WORKFLOW (4 puertas
 * configurables), el FOLIO gapless (emitido al aprobar), los CHECKLISTS (Form Builder)
 * y las ACTIVIDADES llegan en S2–S5. Ver docs/design/OT_DESIGN_ARCHITECTURE.md.
 *
 * Diseño congelado por los forks W1–W8 (DECISIONS 2026-07-01):
 *  - W2: un único `workorder:transition` (dim. WORKFLOW, S2); roles por transición = DATO.
 *  - W3: `Area`/`Specialty` son catálogos separados (N:N); `orgNodeId` = ubicación + ancla ABAC.
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
  currentStateKey: z.string().nullable(),
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

/** Resuelve el lifecycle derivado a partir del estado del flujo (S2+). En S1 se pasa directo. */
export function deriveWorkOrderLifecycle(opts: {
  canceledAt: Date | null;
  currentStateIsFinal: boolean;
  fallback: WorkOrderLifecycle;
}): WorkOrderLifecycle {
  if (opts.canceledAt) return "CANCELED";
  if (opts.currentStateIsFinal) return "CLOSED";
  return opts.fallback;
}
