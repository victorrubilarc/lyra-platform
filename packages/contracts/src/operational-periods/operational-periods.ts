import { z } from "zod";

/**
 * Período contable gobernado — Fase 2.7.1.
 *
 * Un `OperationalPeriod` es el estado de gobernanza (abierto/en cierre/cerrado) de
 * una llave de período (`periodKey`) DENTRO de un calendario operacional. La llave
 * la estampa el `ShiftResolver` al sellar cada `LogEntry` (ver Fase 2.3.0/2.4); el
 * período la "envuelve" para poder CERRAR la escritura sobre esa ventana de tiempo.
 *
 * Modelo LAZY ("ausencia = ABIERTO", patrón lock-date de Odoo): un período sin fila
 * en BD se considera OPEN. Cerrar/poner en cierre crea o actualiza la fila con motivo
 * + permiso + auditoría; reabrir la vuelve a OPEN. No se pre-generan filas: la lista
 * de períodos recientes se DERIVA de la config del calendario (`enumeratePeriodKeys`).
 *
 * Guardas de ESCRITURA (servidor): toda mutación cuya `effectiveAt` resuelva a una
 * llave en período CLOSING/CLOSED se bloquea (`blockedReason = PERIOD_CLOSED`) salvo
 * que el actor tenga el permiso de excepción `opsperiod:write-closed`. Las LECTURAS y
 * la verificación de firma nunca se bloquean. Referentes: SAP OB52 (intervalos abiertos
 * por grupo de autorización), NetSuite (reapertura justificada), Odoo (lock date soft con
 * excepciones auditadas), Maximo (rechazo si la fecha no cae en período activo).
 */

/**
 * Estado de gobernanza de un período:
 *  - OPEN    → abierto; escritura normal (es también el estado por defecto/ausente).
 *  - CLOSING → en cierre; solo roles con excepción pueden seguir escribiendo
 *              (cierre de libros; los flujos en vuelo de privilegiados finalizan).
 *  - CLOSED  → cerrado; escritura solo por excepción explícita y auditada.
 * CLOSING y CLOSED bloquean por igual a los no privilegiados; difieren en INTENCIÓN
 * (cierre en curso vs período sellado) y dejan la puerta a la ventana de edición (2.7.2).
 */
export const PERIOD_STATUSES = ["OPEN", "CLOSING", "CLOSED"] as const;
export const periodStatusSchema = z.enum(PERIOD_STATUSES);
export type PeriodStatus = z.infer<typeof periodStatusSchema>;

/** Los estados a los que el cierre puede llevar un período. */
export const CLOSED_PERIOD_STATUSES = ["CLOSING", "CLOSED"] as const;
export const closedPeriodStatusSchema = z.enum(CLOSED_PERIOD_STATUSES);
export type ClosedPeriodStatus = z.infer<typeof closedPeriodStatusSchema>;

/** Motivo obligatorio de cierre/reapertura (práctica GxP de cambio gobernado). */
export const PERIOD_REASON_MIN = 5;
const periodReasonSchema = z
  .string()
  .trim()
  .min(PERIOD_REASON_MIN, `El motivo debe tener al menos ${PERIOD_REASON_MIN} caracteres`)
  .max(1000);

/**
 * Estado de un período tal como lo expone el mantenedor. Los campos de cierre/reapertura
 * son null cuando el período está OPEN (derivado, sin fila) o nunca se reabrió.
 */
export const operationalPeriodDtoSchema = z.object({
  calendarId: z.string(),
  periodKey: z.string(),
  status: periodStatusSchema,
  closedById: z.string().nullable(),
  closedByName: z.string().nullable(),
  closedAt: z.string().nullable(),
  closeReason: z.string().nullable(),
  reopenedById: z.string().nullable(),
  reopenedByName: z.string().nullable(),
  reopenedAt: z.string().nullable(),
  reopenReason: z.string().nullable(),
});
export type OperationalPeriodDto = z.infer<typeof operationalPeriodDtoSchema>;

/** Respuesta del listado de períodos de un calendario (derivados ∪ filas explícitas). */
export const listOperationalPeriodsResponseSchema = z.object({
  calendarId: z.string(),
  periods: z.array(operationalPeriodDtoSchema),
});
export type ListOperationalPeriodsResponse = z.infer<typeof listOperationalPeriodsResponseSchema>;

/** Cerrar (o poner en cierre) un período: estado destino + motivo obligatorio. */
export const closePeriodRequestSchema = z.object({
  status: closedPeriodStatusSchema,
  reason: periodReasonSchema,
});
export type ClosePeriodRequest = z.infer<typeof closePeriodRequestSchema>;

/** Reabrir un período cerrado/en cierre: motivo obligatorio. */
export const reopenPeriodRequestSchema = z.object({
  reason: periodReasonSchema,
});
export type ReopenPeriodRequest = z.infer<typeof reopenPeriodRequestSchema>;
