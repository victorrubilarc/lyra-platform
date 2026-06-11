import { z } from "zod";

/**
 * Calendario operacional (turnos + periodo contable) — Fase 2.3.0.
 *
 * Configuración de PRIMERA CLASE separada del formulario (patrón Shift Calendar de
 * MES / factory calendar + shift definitions de SAP / resource&operations calendars
 * de ISA-95 Parte 2). Turno, día operacional y periodo son **dimensiones derivadas**
 * del timestamp, NO campos que el operador escribe (ver docs/DECISIONS.md 2026-06-09).
 *
 * Concepto central: **"día de producción" ≠ "día civil"**. El día operacional arranca
 * en un turno ancla (p. ej. 07:00), por eso el "mes" puede empezar en ese mismo cambio
 * de turno. Es el patrón dimensión Fecha+Turno del Data Warehouse: el *hecho* (la
 * lectura) recibe claves operationalDate/shift/periodo derivadas al sellar el registro.
 *
 * Catálogo GOBERNADO, NO versionado-inmutable (molde Equipment/Role/ReferenceList): la
 * inmutabilidad histórica la dará el ESTAMPADO de estas dimensiones en `LogEntry` (2.4).
 *
 * `resolveShift` (función pura, abajo) es la fuente única de la lógica de resolución,
 * reutilizada por el backend (`ShiftResolver`), por el probador de la UI en vivo y por
 * los tests. No depende de la BD ni de librerías externas (solo `Intl`, para la TZ).
 */

// === Periodo contable ========================================================

/**
 * Tipo de periodo contable/de reporte:
 *  - MONTH  → mes (con día-ancla configurable; p. ej. corre del 26 al 25).
 *  - WEEK   → semana (con día de inicio configurable; lun..dom).
 *  - CUSTOM → ciclo de largo fijo en días operacionales (quincena 14, ciclo 28,
 *             rosters 7×7 / 14×14…), anclado a una fecha de referencia.
 * (4-4-5 fiscal y rotación de cuadrillas quedan fuera de alcance — ver BACKLOG.)
 */
export const PERIOD_KINDS = ["MONTH", "WEEK", "CUSTOM"] as const;
export const periodKindSchema = z.enum(PERIOD_KINDS);
export type PeriodKind = z.infer<typeof periodKindSchema>;

// === Turno (OperationalShift) ================================================

/** Formato de hora de pared local "HH:MM" (00:00–23:59). */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato "HH:MM" (00:00–23:59)');

/** Fecha-solo "YYYY-MM-DD" (sin hora ni TZ: una fecha de calendario local). */
export const localDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato "YYYY-MM-DD"')
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    if (m! < 1 || m! > 12 || d! < 1 || d! > 31) return false;
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
  }, "Fecha inválida");

export const operationalShiftSchema = z.object({
  id: z.string(),
  calendarId: z.string(),
  /** Clave estable del turno (A/B/C…), única dentro del calendario. */
  code: z.string(),
  label: z.string(),
  /** Hora de inicio (hora de pared local), "HH:MM". */
  startTime: z.string(),
  /** Duración en minutos (1..1440). Resuelve el cruce de medianoche sin ambigüedad. */
  durationMinutes: z.number().int(),
  sortOrder: z.number().int(),
});
export type OperationalShift = z.infer<typeof operationalShiftSchema>;

/** Turno editable (sin id; el guardado del calendario reemplaza el set completo). */
export const operationalShiftInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(12)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "Use letras, dígitos, guion o guion bajo (ej. A, T1, NIGHT)"),
  label: z.string().trim().min(1).max(80),
  startTime: timeOfDaySchema,
  durationMinutes: z.number().int().min(1).max(1440),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
export type OperationalShiftInput = z.infer<typeof operationalShiftInputSchema>;

// === Calendario (OperationalCalendar) ========================================

export const operationalCalendarSchema = z.object({
  id: z.string(),
  /** Clave estable y única (slug). Para seed idempotente y referencias. */
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Zona horaria IANA (ej. "America/Santiago"). Todo se guarda en UTC. */
  timezone: z.string(),
  /** Exactamente un calendario es el por defecto (single-tenant). */
  isDefault: z.boolean(),
  active: z.boolean(),
  /**
   * Turno cuyo inicio marca el arranque del día operacional. null = el día
   * operacional coincide con el día civil (arranca a las 00:00).
   */
  dayStartShiftCode: z.string().nullable(),
  periodKind: periodKindSchema,
  /** MONTH: día civil que abre el mes (1..28). */
  periodAnchorDay: z.number().int().nullable(),
  /** WEEK: día de inicio de semana (1=Lun..7=Dom, ISO-8601). */
  periodStartWeekday: z.number().int().nullable(),
  /** CUSTOM: largo del ciclo en días operacionales. */
  periodLengthDays: z.number().int().nullable(),
  /** CUSTOM: fecha de referencia del ciclo "YYYY-MM-DD". */
  periodAnchorDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Conteo de turnos (para la grilla de calendarios). */
  shiftCount: z.number().int().optional(),
  /** Nodos asignados directamente a este calendario (para el detalle). */
  assignedNodeIds: z.array(z.string()).optional(),
});
export type OperationalCalendar = z.infer<typeof operationalCalendarSchema>;

/** Calendario con sus turnos embebidos (detalle del mantenedor). */
export const operationalCalendarDetailSchema = operationalCalendarSchema.extend({
  shifts: z.array(operationalShiftSchema),
});
export type OperationalCalendarDetail = z.infer<typeof operationalCalendarDetailSchema>;

/**
 * `key` de calendario: estable y URL-safe (slug). Minúsculas, dígitos y guiones.
 */
export const operationalCalendarKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use minúsculas, dígitos y guiones (ej. mina-rajo)");

/**
 * Config editable del calendario (cuerpo común de create/update). Los turnos
 * viajan completos y se reemplazan en bloque al guardar (set pequeño y cohesivo,
 * mismo criterio que estados/transiciones de un flujo). La validación cruzada
 * (solapes, ancla, periodo, TZ) la hace `superRefine` vía `validateOperationalCalendar`.
 */
const operationalCalendarBodyShape = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  timezone: z.string().trim().min(1).max(64),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  dayStartShiftCode: z.string().trim().min(1).max(12).nullable().optional(),
  periodKind: periodKindSchema,
  periodAnchorDay: z.number().int().min(1).max(28).nullable().optional(),
  periodStartWeekday: z.number().int().min(1).max(7).nullable().optional(),
  periodLengthDays: z.number().int().min(1).max(366).nullable().optional(),
  periodAnchorDate: localDateSchema.nullable().optional(),
  shifts: z.array(operationalShiftInputSchema).max(12).optional(),
};

/** Aplica la validación cruzada del calendario como issues de Zod. */
function refineCalendarBody(
  data: {
    timezone: string;
    dayStartShiftCode?: string | null;
    periodKind: PeriodKind;
    periodAnchorDate?: string | null;
    periodLengthDays?: number | null;
    shifts?: OperationalShiftInput[];
  },
  ctx: z.RefinementCtx,
): void {
  for (const msg of validateOperationalCalendar(data)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
  }
}

export const createOperationalCalendarRequestSchema = z
  .object({ key: operationalCalendarKeySchema, ...operationalCalendarBodyShape })
  .superRefine(refineCalendarBody);
export type CreateOperationalCalendarRequest = z.infer<typeof createOperationalCalendarRequestSchema>;

export const updateOperationalCalendarRequestSchema = z
  .object(operationalCalendarBodyShape)
  .superRefine(refineCalendarBody);
export type UpdateOperationalCalendarRequest = z.infer<typeof updateOperationalCalendarRequestSchema>;

/** Asignación de nodos de la estructura a un calendario (reemplaza el set). */
export const assignCalendarNodesRequestSchema = z.object({
  orgNodeIds: z.array(z.string()).max(2000),
});
export type AssignCalendarNodesRequest = z.infer<typeof assignCalendarNodesRequestSchema>;

/** Cuerpo del probador: el instante (ISO-8601 UTC) a resolver. */
export const operationalCalendarPreviewRequestSchema = z.object({
  at: z.string().datetime({ offset: true }),
});
export type OperationalCalendarPreviewRequest = z.infer<typeof operationalCalendarPreviewRequestSchema>;

// === Validación cruzada (fuente única: contrato + backend + builder web) =====

interface ValidatableCalendar {
  timezone: string;
  dayStartShiftCode?: string | null;
  periodKind: PeriodKind;
  periodAnchorDay?: number | null;
  periodStartWeekday?: number | null;
  periodLengthDays?: number | null;
  periodAnchorDate?: string | null;
  shifts?: { code: string; startTime: string; durationMinutes: number }[];
}

/** ¿La TZ es una zona IANA válida y soportada por el runtime? */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Minutos desde medianoche de una hora "HH:MM". */
function minutesOfDay(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h! * 60 + m!;
}

/**
 * Valida un calendario operacional y devuelve la lista de mensajes de error
 * (vacía = válido). Fuente ÚNICA de las reglas, consumida por el `superRefine` de
 * los contratos, por el backend (al guardar) y por el builder web (en vivo):
 *  - TZ IANA válida.
 *  - Turnos: códigos únicos; **sin solapes** (un instante cae en ≤1 turno).
 *    Se PERMITEN huecos (operaciones de turno único): un instante fuera de turno
 *    resuelve shiftCode=null pero conserva su día operacional.
 *  - `dayStartShiftCode` (si se define) referencia un turno existente.
 *  - Config de periodo coherente con el `periodKind`.
 */
export function validateOperationalCalendar(cal: ValidatableCalendar): string[] {
  const errors: string[] = [];

  if (!isValidTimezone(cal.timezone)) {
    errors.push(`Zona horaria inválida: "${cal.timezone}".`);
  }

  const shifts = cal.shifts ?? [];

  // Códigos únicos.
  const seen = new Set<string>();
  for (const s of shifts) {
    if (seen.has(s.code)) errors.push(`Código de turno duplicado: "${s.code}".`);
    seen.add(s.code);
  }

  // Sin solapes: pintar los minutos cubiertos en un círculo de 1440; un minuto
  // pintado dos veces = solape (cubre también el caso suma de duraciones > 24 h).
  const covered = new Array<boolean>(1440).fill(false);
  let overlap = false;
  for (const s of shifts) {
    const start = minutesOfDay(s.startTime);
    for (let i = 0; i < s.durationMinutes && i < 1440; i++) {
      const minute = (start + i) % 1440;
      if (covered[minute]) {
        overlap = true;
        break;
      }
      covered[minute] = true;
    }
    if (overlap) break;
  }
  if (overlap) {
    errors.push("Los turnos se solapan: un instante quedaría en más de un turno. Ajuste inicio/duración.");
  }

  // Ancla del día operacional.
  if (cal.dayStartShiftCode != null && cal.dayStartShiftCode !== "") {
    if (!shifts.some((s) => s.code === cal.dayStartShiftCode)) {
      errors.push(`El turno ancla del día "${cal.dayStartShiftCode}" no existe entre los turnos definidos.`);
    }
  }

  // Config de periodo.
  switch (cal.periodKind) {
    case "MONTH":
      if (cal.periodAnchorDay != null && (cal.periodAnchorDay < 1 || cal.periodAnchorDay > 28)) {
        errors.push("El día de inicio del mes debe estar entre 1 y 28.");
      }
      break;
    case "WEEK":
      if (cal.periodStartWeekday != null && (cal.periodStartWeekday < 1 || cal.periodStartWeekday > 7)) {
        errors.push("El día de inicio de la semana debe estar entre 1 (lunes) y 7 (domingo).");
      }
      break;
    case "CUSTOM":
      if (cal.periodLengthDays == null || cal.periodLengthDays < 1) {
        errors.push("El ciclo personalizado requiere un largo en días (≥ 1).");
      }
      if (cal.periodAnchorDate == null || cal.periodAnchorDate === "") {
        errors.push("El ciclo personalizado requiere una fecha de inicio de referencia.");
      }
      break;
  }

  return errors;
}

// === Resolución (función pura) ===============================================

/** Config que necesita el resolver (lo que el servicio mapea desde la BD). */
export interface ShiftResolverCalendar {
  timezone: string;
  shifts: { code: string; label?: string; startTime: string; durationMinutes: number }[];
  dayStartShiftCode: string | null;
  periodKind: PeriodKind;
  periodAnchorDay?: number | null;
  periodStartWeekday?: number | null;
  periodLengthDays?: number | null;
  periodAnchorDate?: string | null;
}

/** Resultado de resolver un timestamp contra un calendario. */
export const shiftResolutionSchema = z.object({
  /** Día operacional ("día de producción") en formato "YYYY-MM-DD" (fecha local). */
  operationalDate: z.string(),
  /** Código del turno, o null si el instante cae en un hueco / no hay turnos. */
  shiftCode: z.string().nullable(),
  shiftLabel: z.string().nullable(),
  periodKind: periodKindSchema,
  /** Llave del periodo contable, o null si no se pudo derivar. */
  periodKey: z.string().nullable(),
});
export type ShiftResolution = z.infer<typeof shiftResolutionSchema>;

/** Partes de hora de pared local de un instante en una TZ dada. */
interface LocalParts {
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number; // 0..23
  minute: number; // 0..59
  second: number; // 0..59
}

/** Descompone un instante UTC en hora de pared local de la TZ (vía Intl, sin deps). */
function getLocalParts(at: Date, timezone: string): LocalParts {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  let hour = get("hour");
  if (hour === 24) hour = 0; // algunos ICU emiten "24" para la medianoche
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute"), second: get("second") };
}

/** Suma `days` (puede ser negativo) a una fecha local Y-M-D; devuelve "YYYY-MM-DD". */
function addDays(year: number, month: number, day: number, days: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

/** Día de la semana ISO (1=Lun..7=Dom) de una fecha "YYYY-MM-DD". */
export function isoWeekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Dom..6=Sáb
  return dow === 0 ? 7 : dow;
}

/** Días enteros entre dos fechas "YYYY-MM-DD" (b - a), con signo. */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!);
  return Math.round(ms / 86_400_000);
}

const SECONDS_PER_DAY = 86_400;

/**
 * ¿El segundo local `sec` cae dentro del turno `[inicio, inicio+duración)` (con
 * wrap de medianoche)? Intervalo SEMIABIERTO: el instante exacto del fin pertenece
 * al turno SIGUIENTE (p. ej. A 08:00–20:00 y B 20:00–08:00: las 20:00:00 son de B,
 * sin solape ni hueco). Los turnos se definen al minuto; la lectura se compara al
 * segundo para que el borde sea exacto sin redondear.
 */
function shiftCovers(sec: number, startTime: string, durationMinutes: number): boolean {
  const start = minutesOfDay(startTime) * 60;
  const end = start + durationMinutes * 60; // puede superar 1 día (cruza medianoche)
  if (end <= SECONDS_PER_DAY) return sec >= start && sec < end;
  return sec >= start || sec < end - SECONDS_PER_DAY;
}

/**
 * Resuelve un timestamp (UTC) a sus dimensiones operacionales contra un calendario.
 * Función PURA y determinista (única dependencia: `Intl` para la TZ). Es la fuente
 * de verdad que consumen el backend (`ShiftResolver`), el probador de la UI y los tests.
 *
 * Lógica:
 *  1. Convierte el instante a hora de pared local de la TZ del sitio.
 *  2. Turno: el (único) turno cuyo intervalo SEMIABIERTO [inicio, inicio+duración)
 *     contiene al instante local (preciso al segundo); null si cae en un hueco o no
 *     hay turnos. El borde exacto (p. ej. 20:00:00) pertenece al turno siguiente.
 *  3. Día operacional: si el instante local ≥ inicio del turno ancla → la fecha civil
 *     local; si es menor → la fecha civil local MENOS un día (la madrugada pertenece
 *     al día de producción anterior). Sin turno ancla, el día arranca a las 00:00.
 *  4. Periodo: se deriva del día operacional según el `periodKind`.
 */
export function resolveShift(at: Date, cal: ShiftResolverCalendar): ShiftResolution {
  const local = getLocalParts(at, cal.timezone);
  const localSec = local.hour * 3600 + local.minute * 60 + local.second;

  // 2. Turno (sin solapes ⇒ a lo sumo uno).
  let shiftCode: string | null = null;
  let shiftLabel: string | null = null;
  for (const s of cal.shifts) {
    if (shiftCovers(localSec, s.startTime, s.durationMinutes)) {
      shiftCode = s.code;
      shiftLabel = s.label ?? s.code;
      break;
    }
  }

  // 3. Día operacional.
  const anchorShift =
    cal.dayStartShiftCode != null ? cal.shifts.find((s) => s.code === cal.dayStartShiftCode) : undefined;
  const dayStartSec = anchorShift ? minutesOfDay(anchorShift.startTime) * 60 : 0;
  const operationalDate =
    localSec >= dayStartSec
      ? addDays(local.year, local.month, local.day, 0)
      : addDays(local.year, local.month, local.day, -1);

  // 4. Periodo.
  const periodKey = derivePeriodKey(operationalDate, cal);

  return { operationalDate, shiftCode, shiftLabel, periodKind: cal.periodKind, periodKey };
}

/** Deriva la llave del periodo contable a partir del día operacional. */
function derivePeriodKey(operationalDate: string, cal: ShiftResolverCalendar): string | null {
  const [y, m, d] = operationalDate.split("-").map(Number);
  switch (cal.periodKind) {
    case "MONTH": {
      const anchorDay = cal.periodAnchorDay ?? 1;
      // El periodo se nombra por el mes en que ARRANCA (en/después del día ancla).
      let py = y!;
      let pm = m!;
      if (d! < anchorDay) {
        pm -= 1;
        if (pm < 1) {
          pm = 12;
          py -= 1;
        }
      }
      return `${py}-${String(pm).padStart(2, "0")}`;
    }
    case "WEEK": {
      const startWeekday = cal.periodStartWeekday ?? 1;
      const wd = isoWeekdayOf(operationalDate);
      // Retroceder hasta el día de inicio de semana → la llave es esa fecha.
      const back = (wd - startWeekday + 7) % 7;
      return addDays(y!, m!, d!, -back);
    }
    case "CUSTOM": {
      if (cal.periodLengthDays == null || cal.periodLengthDays < 1 || !cal.periodAnchorDate) return null;
      const diff = daysBetween(cal.periodAnchorDate, operationalDate);
      const cycleIndex = Math.floor(diff / cal.periodLengthDays);
      const [ay, am, ad] = cal.periodAnchorDate.split("-").map(Number);
      return addDays(ay!, am!, ad!, cycleIndex * cal.periodLengthDays);
    }
  }
}

/** Deriva la llave del periodo contable de un día operacional "YYYY-MM-DD" (público). */
export function periodKeyForOperationalDate(operationalDate: string, cal: ShiftResolverCalendar): string | null {
  return derivePeriodKey(operationalDate, cal);
}

/**
 * Enumera las llaves de periodo contable DISTINTAS que caen entre dos días
 * operacionales (inclusive), en orden cronológico. Función PURA reutilizable por
 * el mantenedor de períodos (Fase 2.7.1): permite listar los períodos recientes de
 * un calendario para gobernarlos SIN pre-generar filas (modelo lazy "ausencia =
 * abierto"). El rango se acota en el llamador para no recorrer rangos enormes.
 */
export function enumeratePeriodKeys(cal: ShiftResolverCalendar, fromDate: string, toDate: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const [fy, fm, fd] = fromDate.split("-").map(Number);
  const total = daysBetween(fromDate, toDate);
  for (let i = 0; i <= total; i++) {
    const day = addDays(fy!, fm!, fd!, i);
    const key = derivePeriodKey(day, cal);
    if (key != null && !seen.has(key)) {
      seen.add(key);
      keys.push(key);
    }
  }
  return keys;
}
