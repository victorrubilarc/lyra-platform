import { z } from "zod";
import { addDays, isValidTimezone } from "../shared/date-utils.js";

/**
 * Calendario operacional (TURNOS + día operacional) — Fase 2.3.0; desacoplado del
 * período fiscal en 2.7.1.1 (ver DECISIONS 2026-06-11).
 *
 * Configuración de PRIMERA CLASE separada del formulario (patrón Shift Calendar de
 * MES / factory calendar + shift definitions de SAP / resource&operations calendars
 * de ISA-95 Parte 2). Turno y día operacional son **dimensiones derivadas** del
 * timestamp, NO campos que el operador escribe (ver docs/DECISIONS.md 2026-06-09).
 * El PERÍODO contable es otro eje y vive en `fiscal-calendar` (transversal).
 *
 * Concepto central: **"día de producción" ≠ "día civil"**. El día operacional arranca
 * en un turno ancla (p. ej. 07:00). Es el patrón dimensión Fecha+Turno del Data
 * Warehouse: el *hecho* (la lectura) recibe claves operationalDate/shift derivadas al
 * sellar el registro; el `periodKey` lo aporta el calendario fiscal por separado.
 *
 * Catálogo GOBERNADO, NO versionado-inmutable (molde Equipment/Role/ReferenceList): la
 * inmutabilidad histórica la dará el ESTAMPADO de estas dimensiones en `LogEntry` (2.4).
 *
 * `resolveShift` (función pura, abajo) es la fuente única de la lógica de resolución,
 * reutilizada por el backend (`ShiftResolver`), por el probador de la UI en vivo y por
 * los tests. No depende de la BD ni de librerías externas (solo `Intl`, para la TZ).
 */

// === Turno (OperationalShift) ================================================

/** Formato de hora de pared local "HH:MM" (00:00–23:59). */
export const timeOfDaySchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use el formato "HH:MM" (00:00–23:59)');

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
  /** Estructura dueña; el default y la asignación de nodos son POR ESTRUCTURA. */
  structureId: z.string(),
  /** Clave estable y única (slug). Para seed idempotente y referencias. */
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Zona horaria IANA (ej. "America/Santiago"). Todo se guarda en UTC. */
  timezone: z.string(),
  /** Exactamente un calendario es el por defecto POR ESTRUCTURA. */
  isDefault: z.boolean(),
  active: z.boolean(),
  /**
   * Turno cuyo inicio marca el arranque del día operacional. null = el día
   * operacional coincide con el día civil (arranca a las 00:00).
   */
  dayStartShiftCode: z.string().nullable(),
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
 * (solapes, ancla, TZ) la hace `superRefine` vía `validateOperationalCalendar`.
 */
const operationalCalendarBodyShape = {
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  timezone: z.string().trim().min(1).max(64),
  isDefault: z.boolean().optional(),
  active: z.boolean().optional(),
  dayStartShiftCode: z.string().trim().min(1).max(12).nullable().optional(),
  shifts: z.array(operationalShiftInputSchema).max(12).optional(),
};

/** Aplica la validación cruzada del calendario como issues de Zod. */
function refineCalendarBody(
  data: {
    timezone: string;
    dayStartShiftCode?: string | null;
    shifts?: OperationalShiftInput[];
  },
  ctx: z.RefinementCtx,
): void {
  for (const msg of validateOperationalCalendar(data)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
  }
}

export const createOperationalCalendarRequestSchema = z
  .object({
    key: operationalCalendarKeySchema,
    /** Estructura dueña; si se omite, la estructura por defecto. */
    structureId: z.string().optional(),
    ...operationalCalendarBodyShape,
  })
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
  shifts?: { code: string; startTime: string; durationMinutes: number }[];
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
 * (La config de PERÍODO se valida aparte en `fiscal-calendar`, ahora desacoplado.)
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

  return errors;
}

// === Resolución (función pura) ===============================================

/** Config que necesita el resolver de turnos (lo que el servicio mapea desde la BD). */
export interface ShiftResolverCalendar {
  timezone: string;
  shifts: { code: string; label?: string; startTime: string; durationMinutes: number }[];
  dayStartShiftCode: string | null;
}

/** Resultado de resolver un timestamp contra un calendario de turnos. */
export const shiftResolutionSchema = z.object({
  /** Día operacional ("día de producción") en formato "YYYY-MM-DD" (fecha local). */
  operationalDate: z.string(),
  /** Código del turno, o null si el instante cae en un hueco / no hay turnos. */
  shiftCode: z.string().nullable(),
  shiftLabel: z.string().nullable(),
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
 * El `periodKey` NO se calcula aquí: lo aporta el calendario fiscal por separado.
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

  return { operationalDate, shiftCode, shiftLabel };
}
