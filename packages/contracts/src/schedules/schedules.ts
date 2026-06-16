import { z } from "zod";
import { RECURRENCE_KINDS, recurrenceKindSchema, type RecurrenceKind } from "../templates/field-types.js";
import { timeOfDaySchema } from "../operational-calendar/operational-calendar.js";
import { localDateInTz, zonedTimeToUtc, addDaysToIso, isoWeekdayOf } from "../shared/date-utils.js";

/**
 * Programación de rondas (Fase 2.3) — `LogSchedule` (horario, gobernanza VIVA) +
 * `RoundOccurrence` (ocurrencia materializada). Patrón estándar de la industria:
 * SAP PM Maintenance Plan → maintenance calls; IBM Maximo PM → work orders; Hexagon
 * j5 → schedules de IndustraForm; ISA-95 shift handover. Un horario produce
 * ocurrencias hacia un horizonte; la ENTRADA real (`LogEntry`) se crea al INICIAR la
 * ronda, enlazada por `scheduleOccurrenceId` (sin borradores huérfanos, regla 2.8.2).
 *
 * El horario vive SEPARADO de la versión GxP inmutable de la plantilla (reprogramar /
 * pausar no debe republicar una versión controlada — igual que SAP/Maximo separan el
 * plan del task list). El placeholder `recurrenceKind`/`recurrenceConfig` de
 * `TemplateVersion` queda dormido.
 *
 * `enumerateOccurrences` (función PURA, abajo) es la fuente única de la generación,
 * reutilizada por el backend (`SchedulesService`) y los tests. No toca BD.
 */

// === Config de recurrencia por tipo ==========================================

/** SHIFT: una ocurrencia por turno del calendario del nodo (o filtrado a `shiftCodes`). */
export const shiftRecurrenceConfigSchema = z
  .object({
    shiftCodes: z.array(z.string().trim().min(1).max(12)).max(24).optional(),
  })
  .strict();
export type ShiftRecurrenceConfig = z.infer<typeof shiftRecurrenceConfigSchema>;

/** INTERVAL: cada `everyMinutes` desde un ancla de hora de pared (default 00:00). */
export const intervalRecurrenceConfigSchema = z
  .object({
    everyMinutes: z.number().int().min(5).max(44_640), // 5 min .. 31 días
    anchorTime: timeOfDaySchema.optional(),
  })
  .strict();
export type IntervalRecurrenceConfig = z.infer<typeof intervalRecurrenceConfigSchema>;

/** CALENDAR: horas fijas de reloj en días de la semana / del mes dados. */
export const calendarRecurrenceConfigSchema = z
  .object({
    times: z.array(timeOfDaySchema).min(1).max(24),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(), // 1=Lun..7=Dom (ISO)
    daysOfMonth: z.array(z.number().int().min(1).max(31)).max(31).optional(),
  })
  .strict();
export type CalendarRecurrenceConfig = z.infer<typeof calendarRecurrenceConfigSchema>;

/** Config vacía para NONE (un horario inactivo conceptual; no genera nada). */
export const noneRecurrenceConfigSchema = z.object({}).strict();

export type RecurrenceConfigByKind = {
  NONE: Record<string, never>;
  SHIFT: ShiftRecurrenceConfig;
  INTERVAL: IntervalRecurrenceConfig;
  CALENDAR: CalendarRecurrenceConfig;
};

/** Esquema de config según el tipo de recurrencia (fuente única back↔front). */
export function recurrenceConfigSchemaFor(kind: RecurrenceKind): z.ZodTypeAny {
  switch (kind) {
    case "SHIFT":
      return shiftRecurrenceConfigSchema;
    case "INTERVAL":
      return intervalRecurrenceConfigSchema;
    case "CALENDAR":
      return calendarRecurrenceConfigSchema;
    case "NONE":
    default:
      return noneRecurrenceConfigSchema;
  }
}

// === DTOs de horario (LogSchedule) ===========================================

export const logScheduleSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  templateId: z.string(),
  templateName: z.string().optional(),
  orgNodeId: z.string(),
  orgNodeName: z.string().optional(),
  equipmentId: z.string().nullable(),
  equipmentTag: z.string().nullable().optional(),
  /**
   * Rol responsable de ejecutar la ronda (gobierna el worklist "Mis rondas", 2.3.1):
   * el horario es del PUESTO, no de una persona (patrón work center/responsible role
   * de SAP PM / Maximo). `null` = sin rol responsable ⇒ fallback nodo+turno (visible a
   * todos los que alcanzan el nodo).
   */
  responsibleRoleId: z.string().nullable(),
  responsibleRoleName: z.string().nullable().optional(),
  recurrenceKind: recurrenceKindSchema,
  recurrenceConfig: z.record(z.unknown()),
  /** Minutos tras `scheduledFor` dentro de los que la ronda debe completarse (dueAt). */
  dueWindowMinutes: z.number().int(),
  /** Cuántos días hacia adelante materializa el generador. */
  horizonDays: z.number().int(),
  active: z.boolean(),
  lastGeneratedThrough: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Conteos para la grilla (opcionales; los rellena el listado). */
  pendingCount: z.number().int().optional(),
  overdueCount: z.number().int().optional(),
});
export type LogScheduleDto = z.infer<typeof logScheduleSchema>;

/** Cuerpo común de create/update con validación cruzada kind↔config. */
const logScheduleBodyShape = {
  name: z.string().trim().min(1).max(120).nullable().optional(),
  equipmentId: z.string().trim().min(1).nullable().optional(),
  /** Rol responsable del worklist (2.3.1). `null` = sin responsable (fallback nodo+turno). */
  responsibleRoleId: z.string().trim().min(1).nullable().optional(),
  recurrenceKind: recurrenceKindSchema,
  recurrenceConfig: z.record(z.unknown()),
  dueWindowMinutes: z.number().int().min(5).max(525_600), // 5 min .. 1 año
  horizonDays: z.number().int().min(1).max(31).optional(),
  active: z.boolean().optional(),
};

/** Aplica la validación de config según el kind como issue de Zod. */
function refineScheduleBody(
  data: { recurrenceKind: RecurrenceKind; recurrenceConfig: Record<string, unknown> },
  ctx: z.RefinementCtx,
): void {
  const result = recurrenceConfigSchemaFor(data.recurrenceKind).safeParse(data.recurrenceConfig);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["recurrenceConfig", ...issue.path],
        message: issue.message,
      });
    }
  }
  if (data.recurrenceKind === "NONE") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["recurrenceKind"], message: "Elija un tipo de recurrencia (turno, intervalo o calendario)." });
  }
}

export const createLogScheduleRequestSchema = z
  .object({ templateId: z.string().trim().min(1), orgNodeId: z.string().trim().min(1), ...logScheduleBodyShape })
  .superRefine(refineScheduleBody);
export type CreateLogScheduleRequest = z.infer<typeof createLogScheduleRequestSchema>;

export const updateLogScheduleRequestSchema = z
  .object(logScheduleBodyShape)
  .superRefine(refineScheduleBody);
export type UpdateLogScheduleRequest = z.infer<typeof updateLogScheduleRequestSchema>;

// === DTOs de ocurrencia (RoundOccurrence) ====================================

export const ROUND_OCCURRENCE_STATUSES = ["PENDING", "COMPLETED", "SKIPPED", "CANCELED"] as const;
export const roundOccurrenceStatusSchema = z.enum(ROUND_OCCURRENCE_STATUSES);
export type RoundOccurrenceStatus = z.infer<typeof roundOccurrenceStatusSchema>;

export const roundOccurrenceSchema = z.object({
  id: z.string(),
  scheduleId: z.string(),
  scheduleName: z.string().nullable().optional(),
  templateId: z.string(),
  templateName: z.string().optional(),
  orgNodeId: z.string(),
  orgNodeName: z.string().optional(),
  equipmentId: z.string().nullable(),
  equipmentTag: z.string().nullable().optional(),
  /** Instante (ISO-8601 UTC) en que la ronda se abre / queda anclada. */
  scheduledFor: z.string(),
  /** Plazo (ISO-8601 UTC): vencida si `now > dueAt` y sigue PENDING. */
  dueAt: z.string(),
  shiftCode: z.string().nullable(),
  operationalDate: z.string().nullable(),
  periodKey: z.string().nullable(),
  status: roundOccurrenceStatusSchema,
  /** DERIVADO en consulta (no persistido): PENDING && now > dueAt. */
  overdue: z.boolean(),
  logEntryId: z.string().nullable(),
  entryNumber: z.number().int().nullable().optional(),
  skippedById: z.string().nullable(),
  skippedAt: z.string().nullable(),
  skipReason: z.string().nullable(),
  generatedAt: z.string(),
});
export type RoundOccurrenceDto = z.infer<typeof roundOccurrenceSchema>;

/** Filtros del listado de ocurrencias. */
export const occurrenceQuerySchema = z.object({
  status: roundOccurrenceStatusSchema.optional(),
  overdueOnly: z.coerce.boolean().optional(),
  todayOnly: z.coerce.boolean().optional(),
  orgNodeId: z.string().trim().min(1).optional(),
  templateId: z.string().trim().min(1).optional(),
  scheduleId: z.string().trim().min(1).optional(),
});
export type OccurrenceQuery = z.infer<typeof occurrenceQuerySchema>;

/**
 * Filtros del worklist del OPERADOR ("Mis rondas", 2.3.1). El backend ya acota a
 * `status=PENDING ∩ nodos accesibles ∩ (rol responsable ∈ mis roles | sin responsable)`;
 * estos toggles refinan la vista. Default (sin flags) = pendientes de HOY + arrastre
 * vencido (no oculta lo heredado del turno anterior — entrega de turno ISA-95).
 */
export const myRoundsQuerySchema = z.object({
  /** Solo vencidas (PENDING && now > dueAt). */
  overdueOnly: z.coerce.boolean().optional(),
  /** Solo las del turno vigente del usuario (shiftCode = turno resuelto ahora). */
  shiftOnly: z.coerce.boolean().optional(),
  /** Incluir futuras más allá de hoy (default: solo hoy + vencidas). */
  includeUpcoming: z.coerce.boolean().optional(),
});
export type MyRoundsQuery = z.infer<typeof myRoundsQuerySchema>;

/** Omitir una ocurrencia: motivo obligatorio auditado (GxP). */
export const skipOccurrenceRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type SkipOccurrenceRequest = z.infer<typeof skipOccurrenceRequestSchema>;

// === Generador (función pura) ================================================

/** Turno mínimo que necesita el enumerador (lo mapea el servicio desde la BD). */
export interface EnumerableShift {
  code: string;
  startTime: string; // "HH:MM"
  durationMinutes: number;
}

export interface EnumerateInput {
  kind: RecurrenceKind;
  config: Record<string, unknown>;
  dueWindowMinutes: number;
  timezone: string; // TZ IANA del calendario del nodo
  shifts?: EnumerableShift[]; // requerido para SHIFT
}

/** Un "slot" de ronda calculado (aún sin persistir). */
export interface OccurrenceSlot {
  scheduledFor: Date;
  dueAt: Date;
  shiftCode: string | null;
}

/** Tope defensivo de ocurrencias por corrida (evita explosiones por mala config). */
const MAX_SLOTS = 2000;

/**
 * Enumera las ocurrencias de un horario en el rango semiabierto [from, to). PURA y
 * determinista (única dependencia: `Intl` para la TZ). `dueAt = scheduledFor +
 * dueWindowMinutes` en TODOS los tipos (regla uniforme). NONE no genera nada.
 *  - SHIFT: el INICIO de cada turno (filtrado a `shiftCodes` si se da). Cruza
 *    medianoche sin ambigüedad (el inicio es un instante).
 *  - INTERVAL: cada `everyMinutes` de tiempo real desde el ancla de pared.
 *  - CALENDAR: cada hora de `times` en los días que pasan el filtro weekdays/daysOfMonth.
 */
export function enumerateOccurrences(input: EnumerateInput, from: Date, to: Date): OccurrenceSlot[] {
  if (input.kind === "NONE" || from >= to) return [];
  const tz = input.timezone;
  const dueMs = input.dueWindowMinutes * 60_000;
  const slots: OccurrenceSlot[] = [];
  const push = (scheduledFor: Date, shiftCode: string | null): void => {
    if (scheduledFor >= from && scheduledFor < to && slots.length < MAX_SLOTS) {
      slots.push({ scheduledFor, dueAt: new Date(scheduledFor.getTime() + dueMs), shiftCode });
    }
  };

  // Rango de fechas locales que cubre [from, to), con un día de guarda a cada lado
  // (un inicio de turno o una hora puede caer en el día civil adyacente).
  const firstDate = addDaysToIso(localDateInTz(from, tz), -1);
  const lastDate = addDaysToIso(localDateInTz(new Date(to.getTime() - 1), tz), 1);

  if (input.kind === "SHIFT") {
    const all = input.shifts ?? [];
    const filter = (input.config.shiftCodes as string[] | undefined) ?? undefined;
    const shifts = filter && filter.length > 0 ? all.filter((s) => filter.includes(s.code)) : all;
    for (let d = firstDate; d <= lastDate; d = addDaysToIso(d, 1)) {
      for (const s of shifts) push(zonedTimeToUtc(d, s.startTime, tz), s.code);
    }
  } else if (input.kind === "INTERVAL") {
    const every = (input.config.everyMinutes as number) * 60_000;
    const anchorTime = (input.config.anchorTime as string | undefined) ?? "00:00";
    const base = zonedTimeToUtc(firstDate, anchorTime, tz).getTime();
    let t = base;
    if (t < from.getTime()) {
      const k = Math.ceil((from.getTime() - base) / every);
      t = base + k * every;
    }
    for (let guard = 0; t < to.getTime() && guard < MAX_SLOTS; guard++, t += every) {
      push(new Date(t), null);
    }
  } else if (input.kind === "CALENDAR") {
    const times = (input.config.times as string[]) ?? [];
    const weekdays = input.config.weekdays as number[] | undefined;
    const daysOfMonth = input.config.daysOfMonth as number[] | undefined;
    for (let d = firstDate; d <= lastDate; d = addDaysToIso(d, 1)) {
      if (weekdays && weekdays.length > 0 && !weekdays.includes(isoWeekdayOf(d))) continue;
      if (daysOfMonth && daysOfMonth.length > 0 && !daysOfMonth.includes(Number(d.slice(8, 10)))) continue;
      for (const time of times) push(zonedTimeToUtc(d, time, tz), null);
    }
  }

  slots.sort((a, b) => a.scheduledFor.getTime() - b.scheduledFor.getTime());
  return slots;
}

/** Tipos de recurrencia ofrecidos por el editor (excluye NONE). */
export const SCHEDULABLE_RECURRENCE_KINDS = RECURRENCE_KINDS.filter((k) => k !== "NONE");
