import { z } from "zod";

/**
 * Actividades / plan de trabajo de una OT (Sesión 4 — Puerta 3) — contratos
 * compartidos back↔front.
 *
 * El PLAN de trabajo se arma en la fase Planificación (fork W1: `WorkActivity` es una
 * entidad PROPIA, base conceptual de `IncidentAction` pero con planificación —
 * progressPct/baseline/dependencias). Al AUTORIZAR el plan (Puerta 3) se CONGELA la
 * baseline (planned* → baseline*) para medir desviación; a partir de ahí el plan es la
 * línea base contra la que se compara la ejecución.
 *
 * Guards PUROS (autoritativos back↔front, espejo de `blockingChecklistsForClose`):
 *  - `planReadyToFreeze(activities)` → ¿hay al menos 1 actividad no cancelada? (exigido
 *    para autorizar el plan; un plan sin tareas no es un plan — estándar SAP PM/Maximo).
 *  - `planNotFrozen(workOrder)` → no se ejecuta/cierra sin baseline congelada.
 *  - `blockingActivitiesForClose(activities)` → actividades `mandatory` abiertas (bloquean
 *    el cierre, Puerta 4). El avance real (WorkActivityUpdate append-only) llega en S5.
 */

// === Vocabularios =============================================================

/**
 * Estado de una actividad del plan. BLOCKED = detenida por dependencia/impedimento;
 * DONE/CANCELED = cerrada (no bloquea el cierre de la OT).
 */
export const WORK_ACTIVITY_STATUSES = ["PENDING", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELED"] as const;
export const workActivityStatusSchema = z.enum(WORK_ACTIVITY_STATUSES);
export type WorkActivityStatus = (typeof WORK_ACTIVITY_STATUSES)[number];

/** Estados de una actividad que se consideran CERRADOS (no bloquean el cierre). */
export const CLOSED_WORK_ACTIVITY_STATUSES: readonly WorkActivityStatus[] = ["DONE", "CANCELED"];

/**
 * Claves de estado data-driven de la Puerta 3 (paridad con
 * `DEFAULT_WORK_ORDER_FOLIO_STATE_KEY`): el TIPO puede declarar otras vía
 * `planFreezeStateKey`/`executeStateKey`; estos defaults corresponden al flujo
 * sembrado "ot-4-puertas" (reordenado en S4: planificar → autorizar → ejecutar).
 */
export const DEFAULT_WORK_ORDER_PLAN_FREEZE_STATE_KEY = "plan_aprobado";
export const DEFAULT_WORK_ORDER_EXECUTE_STATE_KEY = "en_ejecucion";

// === DTO: actividad del plan ==================================================

export const workActivitySchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  sequence: z.number().int(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  responsibleRoleId: z.string().nullable(),
  specialtyId: z.string().nullable(),
  specialtyName: z.string().nullable(),
  /** Plan VIVO (editable hasta congelar). */
  plannedStart: z.string().nullable(),
  plannedEnd: z.string().nullable(),
  /** Baseline congelada al autorizar el plan (Puerta 3) ⇒ mide desviación. */
  baselineStart: z.string().nullable(),
  baselineEnd: z.string().nullable(),
  /** Avance real (S5). */
  actualStart: z.string().nullable(),
  actualEnd: z.string().nullable(),
  progressPct: z.number().int(),
  status: workActivityStatusSchema,
  mandatory: z.boolean(),
  dependsOnId: z.string().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable(),
  delayReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkActivityDto = z.infer<typeof workActivitySchema>;

// === Requests =================================================================

const isoDate = () => z.string().datetime().nullable().optional();

/** Crear una actividad del plan. */
export const createWorkActivityRequestSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  responsibleId: z.string().min(1).nullable().optional(),
  specialtyId: z.string().min(1).nullable().optional(),
  plannedStart: isoDate(),
  plannedEnd: isoDate(),
  mandatory: z.boolean().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
  dependsOnId: z.string().min(1).nullable().optional(),
});
export type CreateWorkActivityRequest = z.infer<typeof createWorkActivityRequestSchema>;

/** Editar atributos de planificación de una actividad. */
export const updateWorkActivityRequestSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  responsibleId: z.string().min(1).nullable().optional(),
  specialtyId: z.string().min(1).nullable().optional(),
  plannedStart: isoDate(),
  plannedEnd: isoDate(),
  mandatory: z.boolean().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).nullable().optional(),
  dependsOnId: z.string().min(1).nullable().optional(),
  status: workActivityStatusSchema.optional(),
});
export type UpdateWorkActivityRequest = z.infer<typeof updateWorkActivityRequestSchema>;

/** Reordenar el plan: lista de ids en el nuevo orden. */
export const reorderWorkActivitiesRequestSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1).max(500),
});
export type ReorderWorkActivitiesRequest = z.infer<typeof reorderWorkActivitiesRequestSchema>;

/**
 * Crear varias actividades de una vez (lo usa el ASISTENTE guiado: genera el plan
 * completo en un solo envío). Cada fila reusa el shape de creación.
 */
export const createWorkActivitiesBatchRequestSchema = z.object({
  activities: z.array(createWorkActivityRequestSchema).min(1).max(100),
});
export type CreateWorkActivitiesBatchRequest = z.infer<typeof createWorkActivitiesBatchRequestSchema>;

// === Helpers PUROS (autoritativos back↔front) ================================

/**
 * Actividades que BLOQUEAN el cierre (Puerta 4): `mandatory` que aún no están
 * cerradas (DONE/CANCELED). Espejo de `blockingActionsForClose`/`blockingChecklistsForClose`.
 */
export function blockingActivitiesForClose<T extends { mandatory: boolean; status: WorkActivityStatus }>(
  activities: ReadonlyArray<T>,
): T[] {
  return activities.filter((a) => a.mandatory && !CLOSED_WORK_ACTIVITY_STATUSES.includes(a.status));
}

/**
 * ¿El plan aún NO está congelado? Se usa como guard "no se ejecuta sin plan aprobado":
 * sólo se ENTRA a ejecución con la baseline congelada (Puerta 3).
 */
export function planNotFrozen(workOrder: { planFrozenAt: string | Date | null }): boolean {
  return workOrder.planFrozenAt == null;
}

/**
 * ¿El plan está listo para congelarse (Puerta 3)? Debe tener al menos una actividad
 * no cancelada (decisión del dueño 2026-07-02: un plan sin tareas no es un plan;
 * estándar SAP PM/Maximo exige ≥1 operación).
 */
export function planReadyToFreeze<T extends { status: WorkActivityStatus }>(activities: ReadonlyArray<T>): boolean {
  return activities.some((a) => a.status !== "CANCELED");
}

/** Resumen del plan para KPI/chip (total, cerradas, bloqueantes, % avance ponderado). */
export function summarizeActivities<T extends { mandatory: boolean; status: WorkActivityStatus; progressPct: number }>(
  activities: ReadonlyArray<T>,
): { total: number; done: number; blocking: number; progressPct: number } {
  const active = activities.filter((a) => a.status !== "CANCELED");
  const done = active.filter((a) => a.status === "DONE").length;
  const progressPct = active.length === 0 ? 0 : Math.round(active.reduce((s, a) => s + a.progressPct, 0) / active.length);
  return {
    total: active.length,
    done,
    blocking: blockingActivitiesForClose(activities).length,
    progressPct,
  };
}

/**
 * Desviación (en días) del fin planificado/real respecto a la baseline congelada.
 * Positivo = atraso; negativo = adelanto; null = sin baseline o sin fecha a comparar.
 * Puro (no depende de zona horaria: compara instantes UTC redondeando a días).
 */
export function activityEndDeviationDays(activity: {
  baselineEnd: string | Date | null;
  plannedEnd: string | Date | null;
  actualEnd: string | Date | null;
}): number | null {
  if (!activity.baselineEnd) return null;
  const target = activity.actualEnd ?? activity.plannedEnd;
  if (!target) return null;
  const base = new Date(activity.baselineEnd).getTime();
  const cur = new Date(target).getTime();
  return Math.round((cur - base) / 86_400_000);
}
