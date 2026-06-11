import { z } from "zod";

/**
 * Período contable gobernado — Fase 2.7.1 → endurecido en 2.7.1.1.
 *
 * Un `OperationalPeriod` es una fila MATERIALIZADA (no lazy) de un período de un
 * calendario FISCAL (`fiscalCalendarId × periodKey`), con su rango contiguo
 * `[periodStart, periodEnd)` en días operacionales y su estado de gobernanza. La
 * llave `periodKey` la estampa el `FiscalResolver` al sellar cada `LogEntry`.
 *
 * Modelo base = backbone Maximo (períodos contiguos con rango From/To, validación por
 * fecha, generación explícita "Set Up Full Year") + tri-estado NetSuite
 * OPEN → CLOSED → LOCKED. Reemplaza el modelo LAZY de 2.7.1 (la lista sintética
 * −400/+45d confundía); ver DECISIONS 2026-06-11.
 *
 * Guardas de ESCRITURA (servidor): toda mutación cuya `effectiveAt` resuelva a un
 * período CLOSED se bloquea (`blockedReason = PERIOD_CLOSED`) salvo `opsperiod:write-closed`;
 * un período LOCKED bloquea a TODOS, incluido el bypass (reabrir exige `opsperiod:unlock`).
 * Si el calendario fiscal tiene `requirePeriod`, una fecha SIN fila generada también
 * bloquea. Las LECTURAS y la verificación de firma nunca se bloquean.
 */

/**
 * Estado de gobernanza de un período:
 *  - OPEN    → abierto; escritura normal (estado por defecto al generar).
 *  - CLOSED  → cerrado; escritura solo con `opsperiod:write-closed` (reversible vía reopen).
 *  - LOCKED  → bloqueado en duro; nadie escribe (ni el bypass); reabrir exige `opsperiod:unlock`.
 *  - CLOSING → DEPRECADO (modelo 2.7.1); se conserva solo para parsear filas antiguas.
 */
export const PERIOD_STATUSES = ["OPEN", "CLOSING", "CLOSED", "LOCKED"] as const;
export const periodStatusSchema = z.enum(PERIOD_STATUSES);
export type PeriodStatus = z.infer<typeof periodStatusSchema>;

/** Motivo obligatorio de cierre/lock/unlock/reapertura (práctica GxP de cambio gobernado). */
export const PERIOD_REASON_MIN = 5;
const periodReasonSchema = z
  .string()
  .trim()
  .min(PERIOD_REASON_MIN, `El motivo debe tener al menos ${PERIOD_REASON_MIN} caracteres`)
  .max(1000);

/**
 * Estado de un período materializado tal como lo expone el mantenedor. Los campos de
 * cierre/lock/reapertura son null hasta que ocurre la acción correspondiente.
 */
export const operationalPeriodDtoSchema = z.object({
  fiscalCalendarId: z.string(),
  periodKey: z.string(),
  /** Rango contiguo en días operacionales: [periodStart, periodEnd). */
  periodStart: z.string(),
  periodEnd: z.string(),
  status: periodStatusSchema,
  /** ¿El día de hoy (en la TZ del calendario fiscal) cae dentro de este período? */
  isCurrent: z.boolean(),
  closedById: z.string().nullable(),
  closedByName: z.string().nullable(),
  closedAt: z.string().nullable(),
  closeReason: z.string().nullable(),
  lockedById: z.string().nullable(),
  lockedByName: z.string().nullable(),
  lockedAt: z.string().nullable(),
  lockReason: z.string().nullable(),
  reopenedById: z.string().nullable(),
  reopenedByName: z.string().nullable(),
  reopenedAt: z.string().nullable(),
  reopenReason: z.string().nullable(),
});
export type OperationalPeriodDto = z.infer<typeof operationalPeriodDtoSchema>;

/** Respuesta del listado de períodos materializados de un calendario fiscal (orden desc). */
export const listOperationalPeriodsResponseSchema = z.object({
  fiscalCalendarId: z.string(),
  periods: z.array(operationalPeriodDtoSchema),
});
export type ListOperationalPeriodsResponse = z.infer<typeof listOperationalPeriodsResponseSchema>;

/**
 * Generar (materializar) los períodos de un año calendario, idempotente: crea las
 * filas faltantes y JAMÁS degrada un CLOSED/LOCKED existente. Espejo de "Set Up Full
 * Year" (NetSuite) / generate de períodos financieros (Maximo).
 */
export const generatePeriodsRequestSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});
export type GeneratePeriodsRequest = z.infer<typeof generatePeriodsRequestSchema>;

/** Cerrar un período (OPEN → CLOSED): motivo obligatorio. */
export const closePeriodRequestSchema = z.object({
  reason: periodReasonSchema,
});
export type ClosePeriodRequest = z.infer<typeof closePeriodRequestSchema>;

/** Bloquear en duro un período (CLOSED → LOCKED): motivo obligatorio. */
export const lockPeriodRequestSchema = z.object({
  reason: periodReasonSchema,
});
export type LockPeriodRequest = z.infer<typeof lockPeriodRequestSchema>;

/** Desbloquear un período (LOCKED → CLOSED, two-key): motivo obligatorio. */
export const unlockPeriodRequestSchema = z.object({
  reason: periodReasonSchema,
});
export type UnlockPeriodRequest = z.infer<typeof unlockPeriodRequestSchema>;

/**
 * Reabrir un período cerrado (CLOSED → OPEN): motivo obligatorio. El backend BLOQUEA
 * si existe un período posterior LOCKED (no se reabre detrás de un lock duro) y ADVIERTE
 * (en la UI) si los posteriores están solo CLOSED. `acknowledgeLaterClosed` confirma que
 * el actor vio la advertencia de secuencialidad inversa con posteriores CLOSED.
 */
export const reopenPeriodRequestSchema = z.object({
  reason: periodReasonSchema,
  acknowledgeLaterClosed: z.boolean().optional(),
});
export type ReopenPeriodRequest = z.infer<typeof reopenPeriodRequestSchema>;

/** Año "YYYY-01-01"/"YYYY-12-31" para alimentar la generación (helper de UI/backend). */
export function yearRange(year: number): { fromDate: string; toDate: string } {
  return { fromDate: `${year}-01-01`, toDate: `${year}-12-31` };
}
