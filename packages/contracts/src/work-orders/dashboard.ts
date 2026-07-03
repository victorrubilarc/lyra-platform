import { z } from "zod";
import {
  workOrderLifecycleSchema,
  workOrderOriginSchema,
  workOrderPrioritySchema,
} from "./work-orders.js";
import {
  dashboardBucketSchema,
  dashboardDimensionSliceSchema,
  dashboardTrendPointSchema,
} from "../incidents/dashboard.js";

/**
 * Dashboard de ÓRDENES DE TRABAJO (OT · Slice 7a) — analítica read-only, agregada en
 * el backend con ABAC por nodo ∩ estructura activa (NUNCA expone lo que el usuario no
 * puede ver: replica la MISMA `buildWhere` de la lista de OT). ESPEJO del dashboard de
 * incidencias (Fase 4.5): reusa sus tipos genéricos (`DashboardDimensionSlice`,
 * `DashboardTrendPoint`, `DashboardBucket`) y sus helpers PUROS (`paretoOrder`,
 * `defaultBucketForRange`, `defaultDashboardRange`) sin duplicarlos.
 *
 * Estándares (no se inventan métricas):
 *  - Conteos abiertas/vencidas/en riesgo/estancadas — el "vigía" (OT S6), semáforo de
 *    plazo (`workOrderTrafficLight`) + permanencia de estado (`maxStayMinutes`).
 *  - Tendencia creación vs cierre — gestión de trabajo (ISO 55000 / EAM / ITIL).
 *  - MTTR (creación→cierre = lead time de la OT) — fiabilidad / ISO 14224.
 *  - Distribución + Pareto (80/20) — calidad / priorización.
 *  - Cumplimiento de SLA (% cerradas dentro de `dueAt`) — SLA attainment (ITIL).
 *
 * §21 (heredado de Incidencias 4.4): "vencida" tiene dos sentidos disjuntos —
 *  - PLAZO de resolución (`dueAt < ahora`, o una actividad del plan vencida) → `overdue`.
 *  - PERMANENCIA de estado excedida (`maxStayMinutes`) → `stalled`.
 * Se muestran como KPIs separados (el semáforo de plazo y el de permanencia no se mezclan).
 *
 * Los "estados" operacionales (por autorizar / en ejecución / …) NO son KPIs
 * hardcodeados: salen de la distribución `byState`, derivada del workflow CONFIGURABLE
 * congelado en cada OT (nada de estados en duro; permisos/flujo = dato).
 */

// === Query =================================================================

/**
 * Filtros del dashboard: subconjunto de la lista de OT (sin paginación ni texto libre)
 * + rango de fechas + granularidad. Reusa `buildWhere` en el backend.
 */
export const workOrderDashboardQuerySchema = z.object({
  lifecycle: workOrderLifecycleSchema.optional(),
  typeId: z.string().optional(),
  criticality: z.coerce.number().int().min(1).max(5).optional(),
  priority: workOrderPrioritySchema.optional(),
  originType: workOrderOriginSchema.optional(),
  specialtyId: z.string().optional(),
  orgNodeIds: z
    .preprocess(
      (v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v),
      z.array(z.string()).max(50),
    )
    .optional(),
  equipmentId: z.string().optional(),
  /** Rango por fecha de creación (ISO). Si falta, el backend usa los últimos 90 días. */
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  /** Granularidad de la tendencia; si falta, el backend la deriva del rango. */
  bucket: dashboardBucketSchema.optional(),
});
export type WorkOrderDashboardQuery = z.infer<typeof workOrderDashboardQuerySchema>;

// === Payload ===============================================================

/** KPIs escalares del dashboard de OT (cabecera). */
export const workOrderDashboardKpisSchema = z.object({
  // --- Estado vivo (AHORA, no acotado al rango: es estado, no historia) --------
  /** Solicitudes en borrador (DRAFT) dentro del alcance. */
  draft: z.number().int(),
  /** Órdenes abiertas (OPEN) dentro del alcance. */
  open: z.number().int(),
  /** Abiertas con criticidad máxima (5). */
  critical: z.number().int(),
  /** Abiertas sin responsable. */
  unassigned: z.number().int(),
  /** Abiertas/borrador que exigen permiso de trabajo (PTW). */
  ptw: z.number().int(),
  /** Abiertas con el PLAZO vencido (dueAt < ahora, o actividad del plan vencida). §21. */
  overdue: z.number().int(),
  /** Abiertas por vencer dentro de la ventana de riesgo (🟡, aún no vencidas). */
  atRisk: z.number().int(),
  /** Abiertas con la PERMANENCIA de estado excedida (maxStayMinutes). §21. */
  stalled: z.number().int(),
  // --- Del periodo (rango por fecha) -------------------------------------------
  /** Creadas en el rango. */
  created: z.number().int(),
  /** Cerradas (lifecycle CLOSED) en el rango, por fecha de cierre. */
  closed: z.number().int(),
  /** MTTR: horas promedio creación→cierre de las cerradas en el rango (null si 0). */
  mttrHours: z.number().nullable(),
  /** Cumplimiento de SLA de plazo: % de cerradas en el rango cerradas dentro de `dueAt`. */
  slaCompliancePct: z.number().nullable(),
});
export type WorkOrderDashboardKpis = z.infer<typeof workOrderDashboardKpisSchema>;

export const workOrderDashboardSchema = z.object({
  /** Rango efectivo resuelto por el backend (ISO), para que la UI lo refleje. */
  range: z.object({
    from: z.string(),
    to: z.string(),
    bucket: dashboardBucketSchema,
    /** Zona horaria usada para el bucketing (planta). */
    timeZone: z.string(),
  }),
  kpis: workOrderDashboardKpisSchema,
  trend: z.array(dashboardTrendPointSchema),
  byType: z.array(dashboardDimensionSliceSchema),
  byCriticality: z.array(dashboardDimensionSliceSchema),
  byNode: z.array(dashboardDimensionSliceSchema),
  bySpecialty: z.array(dashboardDimensionSliceSchema),
  byPriority: z.array(dashboardDimensionSliceSchema),
  byOrigin: z.array(dashboardDimensionSliceSchema),
  /** Distribución por ESTADO del workflow (configurable, no hardcodeado). No drill-able. */
  byState: z.array(dashboardDimensionSliceSchema),
});
export type WorkOrderDashboard = z.infer<typeof workOrderDashboardSchema>;

// === Helpers PUROS ==========================================================
// Los helpers genéricos (`paretoOrder`, `defaultBucketForRange`, `defaultDashboardRange`)
// viven en `incidents/dashboard.ts` y se reexportan por el barrel de `@lyra/contracts`;
// no se duplican aquí (DRY). Este dominio solo aporta la etiqueta de criticidad.

/** Etiqueta corta de criticidad para el eje de distribución (S1..S5). */
export function criticalityDimensionLabel(criticality: number): string {
  return `C${criticality}`;
}
