import { z } from "zod";
import { addDaysToIso, daysBetween, isoWeekdayOf, isValidTimezone, localDateSchema } from "../shared/date-utils.js";

/**
 * Calendario FISCAL (período contable/de reporte) — Fase 2.7.1.1.
 *
 * Entidad TRANSVERSAL, desacoplada del calendario de turnos (ver DECISIONS
 * 2026-06-11). El estándar industrial pone el período a nivel de organización,
 * separado del *shift/factory calendar*: SAP fiscal year variant @ company code,
 * Maximo financial periods @ Organization, NetSuite accounting periods @ subsidiaria.
 *
 * La fecha efectiva de un registro resuelve DOS ejes independientes:
 *  - `(operationalDate, shiftCode)` del calendario de TURNOS (`operational-calendar`).
 *  - `periodKey` del calendario FISCAL (este módulo), derivado del `operationalDate`.
 *
 * Modelo base = backbone Maximo (períodos con rango From/To contiguo, validación por
 * fecha) + tri-estado NetSuite OPEN→CLOSED→LOCKED (estados en `operational-periods`).
 *
 * Las funciones de derivación son PURAS (solo aritmética de fechas): fuente única
 * consumida por el backend (`FiscalResolver`), el generador de períodos y los tests.
 */

// === Tipo de período =========================================================

/**
 * Tipo de período contable/de reporte:
 *  - MONTH  → mes (con día-ancla configurable; p. ej. corre del 26 al 25).
 *  - WEEK   → semana (con día de inicio configurable; lun..dom).
 *  - CUSTOM → ciclo de largo fijo en días operacionales (quincena 14, ciclo 28,
 *             rosters 7×7 / 14×14…), anclado a una fecha de referencia.
 * (4-4-5 fiscal y rotación de cuadrillas quedan fuera de alcance — ver BACKLOG.)
 */
export const PERIOD_KINDS = ["MONTH", "WEEK", "CUSTOM"] as const;
export const periodKindSchema = z.enum(PERIOD_KINDS);
export type PeriodKind = z.infer<typeof periodKindSchema>;

/** Config de período que necesita el resolver/generador (lo que el backend mapea de la BD). */
export interface FiscalConfig {
  periodKind: PeriodKind;
  /** MONTH: día civil que abre el mes (1..28). */
  periodAnchorDay?: number | null;
  /** WEEK: día de inicio de semana (1=Lun..7=Dom, ISO-8601). */
  periodStartWeekday?: number | null;
  /** CUSTOM: largo del ciclo en días operacionales. */
  periodLengthDays?: number | null;
  /** CUSTOM: fecha de referencia del ciclo "YYYY-MM-DD". */
  periodAnchorDate?: string | null;
}

// === Derivación de período (funciones puras) =================================

/** Límites contiguos de un período: clave + rango [inicio, fin) en días operacionales. */
export interface PeriodBounds {
  /** Llave estable del período (la que se estampa en `LogEntry.periodKey`). */
  periodKey: string;
  /** Primer día operacional del período (inclusive), "YYYY-MM-DD". */
  periodStart: string;
  /** Primer día operacional del SIGUIENTE período (exclusivo), "YYYY-MM-DD". */
  periodEnd: string;
}

/**
 * Calcula los límites contiguos del período al que pertenece un día operacional.
 * `periodEnd` es EXCLUSIVO (= inicio del período siguiente) para que la pertenencia
 * sea `periodStart <= fecha < periodEnd` sin ambigüedad de borde. null si la config
 * CUSTOM está incompleta.
 */
export function periodBoundsFor(operationalDate: string, cfg: FiscalConfig): PeriodBounds | null {
  const [y, m, d] = operationalDate.split("-").map(Number);
  switch (cfg.periodKind) {
    case "MONTH": {
      const anchorDay = cfg.periodAnchorDay ?? 1;
      // El período arranca el día-ancla del mes; una fecha anterior al ancla
      // pertenece al período que arrancó el mes previo.
      let sy = y!;
      let sm = m!;
      if (d! < anchorDay) {
        sm -= 1;
        if (sm < 1) {
          sm = 12;
          sy -= 1;
        }
      }
      const periodStart = `${sy}-${String(sm).padStart(2, "0")}-${String(anchorDay).padStart(2, "0")}`;
      let ny = sy;
      let nm = sm + 1;
      if (nm > 12) {
        nm = 1;
        ny += 1;
      }
      const periodEnd = `${ny}-${String(nm).padStart(2, "0")}-${String(anchorDay).padStart(2, "0")}`;
      return { periodKey: `${sy}-${String(sm).padStart(2, "0")}`, periodStart, periodEnd };
    }
    case "WEEK": {
      const startWeekday = cfg.periodStartWeekday ?? 1;
      const wd = isoWeekdayOf(operationalDate);
      const back = (wd - startWeekday + 7) % 7;
      const periodStart = addDaysToIso(operationalDate, -back);
      return { periodKey: periodStart, periodStart, periodEnd: addDaysToIso(periodStart, 7) };
    }
    case "CUSTOM": {
      if (cfg.periodLengthDays == null || cfg.periodLengthDays < 1 || !cfg.periodAnchorDate) return null;
      const diff = daysBetween(cfg.periodAnchorDate, operationalDate);
      const cycleIndex = Math.floor(diff / cfg.periodLengthDays);
      const periodStart = addDaysToIso(cfg.periodAnchorDate, cycleIndex * cfg.periodLengthDays);
      return { periodKey: periodStart, periodStart, periodEnd: addDaysToIso(periodStart, cfg.periodLengthDays) };
    }
  }
}

/** Deriva la llave del período contable de un día operacional "YYYY-MM-DD". */
export function periodKeyForOperationalDate(operationalDate: string, cfg: FiscalConfig): string | null {
  return periodBoundsFor(operationalDate, cfg)?.periodKey ?? null;
}

/**
 * Enumera los períodos contiguos que cubren la ventana [fromDate, toDate] (días
 * operacionales, inclusive), en orden cronológico. Devuelve períodos COMPLETOS
 * (incluye los de borde que solo se solapan parcialmente con la ventana). Fuente
 * única de la contigüidad consumida por el generador de períodos (Fase 2.7.1.1):
 * los rangos se materializan tal cual en `OperationalPeriod.periodStart/periodEnd`.
 */
export function enumeratePeriods(cfg: FiscalConfig, fromDate: string, toDate: string): PeriodBounds[] {
  const out: PeriodBounds[] = [];
  const first = periodBoundsFor(fromDate, cfg);
  if (!first) return out;
  let cursor: PeriodBounds | null = first;
  // Cota de seguridad: jamás más de ~6000 períodos (≈ 16 años diarios).
  for (let i = 0; cursor && cursor.periodStart <= toDate && i < 6000; i++) {
    out.push(cursor);
    cursor = periodBoundsFor(cursor.periodEnd, cfg);
  }
  return out;
}

/**
 * Enumera las llaves DISTINTAS de período del rango (compatibilidad con consumidores
 * que solo necesitan las llaves). Derivado de `enumeratePeriods`.
 */
export function enumeratePeriodKeys(cfg: FiscalConfig, fromDate: string, toDate: string): string[] {
  return enumeratePeriods(cfg, fromDate, toDate).map((p) => p.periodKey);
}

// === Validación cruzada (fuente única: contrato + backend + builder web) ======

/** Valida la config de período de un calendario fiscal; devuelve mensajes (vacío = válido). */
export function validateFiscalCalendar(cfg: FiscalConfig): string[] {
  const errors: string[] = [];
  switch (cfg.periodKind) {
    case "MONTH":
      if (cfg.periodAnchorDay != null && (cfg.periodAnchorDay < 1 || cfg.periodAnchorDay > 28)) {
        errors.push("El día de inicio del mes debe estar entre 1 y 28.");
      }
      break;
    case "WEEK":
      if (cfg.periodStartWeekday != null && (cfg.periodStartWeekday < 1 || cfg.periodStartWeekday > 7)) {
        errors.push("El día de inicio de la semana debe estar entre 1 (lunes) y 7 (domingo).");
      }
      break;
    case "CUSTOM":
      if (cfg.periodLengthDays == null || cfg.periodLengthDays < 1) {
        errors.push("El ciclo personalizado requiere un largo en días (≥ 1).");
      }
      if (cfg.periodAnchorDate == null || cfg.periodAnchorDate === "") {
        errors.push("El ciclo personalizado requiere una fecha de inicio de referencia.");
      }
      break;
  }
  return errors;
}

// === DTOs y requests =========================================================

export const fiscalCalendarSchema = z.object({
  id: z.string(),
  /** Estructura dueña; el default y la asignación de nodos son POR ESTRUCTURA. */
  structureId: z.string(),
  /** Clave estable y única (slug). Para seed idempotente y referencias. */
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Zona horaria IANA para ubicar "hoy" al generar/marcar el período Actual. */
  timezone: z.string(),
  /** Exactamente un calendario fiscal es el por defecto POR ESTRUCTURA. */
  isDefault: z.boolean(),
  active: z.boolean(),
  periodKind: periodKindSchema,
  periodAnchorDay: z.number().int().nullable(),
  periodStartWeekday: z.number().int().nullable(),
  periodLengthDays: z.number().int().nullable(),
  periodAnchorDate: z.string().nullable(),
  /**
   * Rigor estricto (Maximo): si está activo, una fecha SIN período generado se
   * bloquea para escritura. Por defecto false (permisivo: ausencia = abierto).
   */
  requirePeriod: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Nodos asignados directamente a este calendario fiscal (para el detalle). */
  assignedNodeIds: z.array(z.string()).optional(),
});
export type FiscalCalendarDto = z.infer<typeof fiscalCalendarSchema>;

/** `key` de calendario fiscal: estable y URL-safe (slug). */
export const fiscalCalendarKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use minúsculas, dígitos y guiones (ej. fiscal-mensual)");

const fiscalCalendarBodyShape = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  timezone: z.string().trim().min(1).max(64),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  periodKind: periodKindSchema,
  periodAnchorDay: z.number().int().min(1).max(28).nullable().optional(),
  periodStartWeekday: z.number().int().min(1).max(7).nullable().optional(),
  periodLengthDays: z.number().int().min(1).max(366).nullable().optional(),
  periodAnchorDate: localDateSchema.nullable().optional(),
  requirePeriod: z.boolean().optional(),
};

function refineFiscalBody(
  data: {
    timezone: string;
    periodKind: PeriodKind;
    periodAnchorDay?: number | null;
    periodStartWeekday?: number | null;
    periodLengthDays?: number | null;
    periodAnchorDate?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (!isValidTimezone(data.timezone)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Zona horaria inválida: "${data.timezone}".` });
  }
  for (const msg of validateFiscalCalendar(data)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
  }
}

export const createFiscalCalendarRequestSchema = z
  .object({
    key: fiscalCalendarKeySchema,
    /** Estructura dueña; si se omite, la estructura por defecto. */
    structureId: z.string().optional(),
    ...fiscalCalendarBodyShape,
  })
  .superRefine(refineFiscalBody);
export type CreateFiscalCalendarRequest = z.infer<typeof createFiscalCalendarRequestSchema>;

export const updateFiscalCalendarRequestSchema = z.object(fiscalCalendarBodyShape).superRefine(refineFiscalBody);
export type UpdateFiscalCalendarRequest = z.infer<typeof updateFiscalCalendarRequestSchema>;

/** Asignación de nodos de la estructura a un calendario fiscal (reemplaza el set). */
export const assignFiscalNodesRequestSchema = z.object({
  orgNodeIds: z.array(z.string()).max(2000),
});
export type AssignFiscalNodesRequest = z.infer<typeof assignFiscalNodesRequestSchema>;
