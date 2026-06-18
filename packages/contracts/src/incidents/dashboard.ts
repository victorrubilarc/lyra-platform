import { z } from "zod";
import {
  incidentLifecycleSchema,
  incidentOriginSchema,
  incidentPrioritySchema,
} from "./incidents.js";

/**
 * Dashboard de incidencias (Fase 4.5) — analítica read-only, agregada en el
 * backend con ABAC por nodo (NUNCA expone lo que el usuario no puede ver: usa la
 * MISMA `buildWhere` de la lista). Contratos compartidos back↔front.
 *
 * Estándares (no se inventan métricas):
 *  - Conteos abiertas/cerradas/críticas/vencidas — ISO 45001 §9.1 (seguimiento).
 *  - Tendencia creación vs cierre + backlog — gestión de incidentes (ITIL/ISO).
 *  - MTTR (creación→cierre) — fiabilidad / ISO 14224 / ITIL.
 *  - Distribución + Pareto (80/20) — ISO 45001 / calidad.
 *  - CAPA abiertas/vencidas/eficacia — ISO 9001 §10.2.
 *  - Cumplimiento de SLA (% dentro de plazo) — ITIL SLA attainment.
 *  - Reincidencia (mismo tipo+equipo en ventana) — fiabilidad (fallas repetidas).
 *  - IF/IG (frecuencia/gravedad) quedan DIFERIDOS: requieren HH trabajadas, que
 *    HOY no existe en el sistema (ver BACKLOG/ROADMAP 4.3). No se inventan.
 *
 * §21 (4.4): "vencida" tiene dos sentidos disjuntos —
 *  - PLAZO de resolución (`dueAt < ahora`) → `overdue`.
 *  - PERMANENCIA de estado excedida (`maxStayMinutes`) → `slaBreached`.
 */

// === Query =================================================================

/** Granularidad del bucket temporal de la tendencia. */
export const dashboardBucketSchema = z.enum(["day", "week", "month"]);
export type DashboardBucket = z.infer<typeof dashboardBucketSchema>;

/**
 * Filtros del dashboard: subconjunto de la lista (sin paginación ni texto libre)
 * + rango de fechas + granularidad + ventana de reincidencia. Reusa `buildWhere`.
 */
export const incidentDashboardQuerySchema = z.object({
  lifecycle: incidentLifecycleSchema.optional(),
  typeId: z.string().optional(),
  categoryId: z.string().optional(),
  severity: z.coerce.number().int().min(1).max(5).optional(),
  priority: incidentPrioritySchema.optional(),
  originType: incidentOriginSchema.optional(),
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
  /** Ventana (días) para considerar reincidencia mismo tipo+equipo. Default 30. */
  recurrenceWindowDays: z.coerce.number().int().min(1).max(365).optional(),
});
export type IncidentDashboardQuery = z.infer<typeof incidentDashboardQuerySchema>;

// === Payload ===============================================================

/** KPIs escalares del periodo (cabecera del dashboard). */
export const incidentDashboardKpisSchema = z.object({
  /** Creadas en el rango. */
  created: z.number().int(),
  /** Cerradas (lifecycle CLOSED) en el rango, por fecha de cierre. */
  closed: z.number().int(),
  /** Abiertas AHORA dentro del alcance (no acotado al rango: es estado vivo). */
  open: z.number().int(),
  /** Críticas (severidad 5) abiertas ahora. */
  critical: z.number().int(),
  /** Abiertas con el PLAZO de resolución vencido (dueAt < ahora). §21. */
  overdue: z.number().int(),
  /** Abiertas con la PERMANENCIA de estado excedida (maxStayMinutes). §21. */
  slaBreached: z.number().int(),
  /** MTTR: horas promedio creación→cierre de las cerradas en el rango (null si 0). */
  mttrHours: z.number().nullable(),
  /** Cumplimiento de SLA de plazo: % de cerradas en el rango cerradas dentro de `dueAt`. */
  slaCompliancePct: z.number().nullable(),
  /** Acciones CAPA abiertas (OPEN/IN_PROGRESS) dentro del alcance. */
  capaOpen: z.number().int(),
  /** Acciones CAPA vencidas (abiertas con dueAt < ahora). */
  capaOverdue: z.number().int(),
  /** % de eficacia: VERIFIED EFFECTIVE / (EFFECTIVE + NOT_EFFECTIVE) verificadas. */
  capaEffectivenessPct: z.number().nullable(),
  /** Reportes PENDIENTES dentro del alcance. */
  reportPending: z.number().int(),
  /** Reportes PENDIENTES vencidos (dueAt < ahora). */
  reportOverdue: z.number().int(),
});
export type IncidentDashboardKpis = z.infer<typeof incidentDashboardKpisSchema>;

/** Punto de la tendencia creación vs cierre (por bucket). */
export const dashboardTrendPointSchema = z.object({
  /** Inicio del bucket, ISO (fecha local de planta). */
  bucket: z.string(),
  created: z.number().int(),
  closed: z.number().int(),
});
export type DashboardTrendPoint = z.infer<typeof dashboardTrendPointSchema>;

/** Distribución por dimensión categórica con id+nombre (para drill-down). */
export const dashboardDimensionSliceSchema = z.object({
  key: z.string(),
  label: z.string(),
  count: z.number().int(),
  /** Color del DS si la dimensión lo aporta (tipo/severidad); null = el front decide. */
  color: z.string().nullable().optional(),
});
export type DashboardDimensionSlice = z.infer<typeof dashboardDimensionSliceSchema>;

/** Par tipo+equipo reincidente (≥2 en la ventana). */
export const dashboardRecurrenceRowSchema = z.object({
  typeId: z.string(),
  typeName: z.string(),
  equipmentId: z.string().nullable(),
  equipmentName: z.string().nullable(),
  count: z.number().int(),
});
export type DashboardRecurrenceRow = z.infer<typeof dashboardRecurrenceRowSchema>;

export const incidentDashboardSchema = z.object({
  /** Rango efectivo resuelto por el backend (ISO), para que la UI lo refleje. */
  range: z.object({
    from: z.string(),
    to: z.string(),
    bucket: dashboardBucketSchema,
    /** Zona horaria usada para el bucketing (planta). */
    timeZone: z.string(),
    recurrenceWindowDays: z.number().int(),
  }),
  kpis: incidentDashboardKpisSchema,
  trend: z.array(dashboardTrendPointSchema),
  byType: z.array(dashboardDimensionSliceSchema),
  bySeverity: z.array(dashboardDimensionSliceSchema),
  byNode: z.array(dashboardDimensionSliceSchema),
  byEquipment: z.array(dashboardDimensionSliceSchema),
  byShift: z.array(dashboardDimensionSliceSchema),
  byOrigin: z.array(dashboardDimensionSliceSchema),
  recurrence: z.array(dashboardRecurrenceRowSchema),
});
export type IncidentDashboard = z.infer<typeof incidentDashboardSchema>;

// === Helpers PUROS (autoritativos back↔front) ==============================

/** Default del rango: últimos 90 días terminando hoy (UTC del instante dado). */
export function defaultDashboardRange(now: Date): { from: Date; to: Date } {
  const to = now;
  const from = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  return { from, to };
}

/**
 * Granularidad por defecto según el largo del rango (días):
 *  - ≤ 31 días  → day
 *  - ≤ 182 días → week
 *  - resto      → month
 */
export function defaultBucketForRange(from: Date, to: Date): DashboardBucket {
  const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)));
  if (days <= 31) return "day";
  if (days <= 182) return "week";
  return "month";
}

/** Pareto: ordena desc por count y agrega el % acumulado (80/20). */
export function paretoOrder(
  slices: DashboardDimensionSlice[],
): Array<DashboardDimensionSlice & { cumulativePct: number }> {
  const sorted = [...slices].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((s, x) => s + x.count, 0);
  let acc = 0;
  return sorted.map((s) => {
    acc += s.count;
    return { ...s, cumulativePct: total === 0 ? 0 : Math.round((acc / total) * 1000) / 10 };
  });
}
