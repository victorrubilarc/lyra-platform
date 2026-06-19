import { z } from "zod";
import {
  resolveShift,
  type ShiftResolverCalendar,
} from "../operational-calendar/operational-calendar.js";
import { zonedTimeToUtc } from "../shared/date-utils.js";

/**
 * Cambio de turno / Shift Handover (Fase 5 — Slice 1) — contratos compartidos
 * back↔front.
 *
 * La entrega de turno es un proceso CRÍTICO de seguridad de proceso (HSE-UK
 * "Effective Shift Handover"; CCPS *Conduct of Operations*; lecciones de Piper
 * Alpha y Texas City): comunicación estructurada, bidireccional, FIRMADA y
 * trazable, en la que los pendientes NO pueden caerse entre turnos.
 *
 * Diseño (DECISIONS 2026-06-18):
 *  - Ciclo FIJO de 3 pasos (no un WorkflowDefinition configurable): el relevo de
 *    dos partes es un protocolo que el estándar fija. Se reusa SOLO el mecanismo
 *    de FIRMA Part 11 (re-autenticación + significado + hash), no la máquina de
 *    estados editable de incidencias.
 *  - Alcance por NODO + TURNO + día operacional (el turno y su ventana salen del
 *    `OperationalCalendar` que ya existe, asignado por nodo).
 *  - Compilación con ABAC: la entrega NUNCA muestra lo que el usuario no puede
 *    ver (mismo motor de alcance que el resto del sistema).
 *  - Snapshot CONGELADO al firmar (integridad/auditoría) + vista en vivo al armar.
 *  - "Baton" de pendientes: objetos abiertos del alcance + notas manuales que
 *    ruedan turno a turno hasta cerrarse.
 *  - Resumen DETERMINISTA en el Slice 1 (sin IA); el resumen por IA on-premise
 *    se enchufa después detrás de la misma interfaz (Slice 2/3).
 */

// === Vocabularios =============================================================

/** Ciclo de la entrega. FIJO (no configurable): el protocolo de 2 partes del estándar. */
export const SHIFT_HANDOVER_STATUSES = ["COMPILING", "SIGNED_OUT", "ACKNOWLEDGED", "CANCELED"] as const;
export const shiftHandoverStatusSchema = z.enum(SHIFT_HANDOVER_STATUSES);
export type ShiftHandoverStatus = (typeof SHIFT_HANDOVER_STATUSES)[number];

/** Estado de un ítem de la baton. CARRIED = arrastrado desde una entrega previa. */
export const SHIFT_HANDOVER_ITEM_STATUSES = ["OPEN", "CARRIED", "CLOSED"] as const;
export const shiftHandoverItemStatusSchema = z.enum(SHIFT_HANDOVER_ITEM_STATUSES);
export type ShiftHandoverItemStatus = (typeof SHIFT_HANDOVER_ITEM_STATUSES)[number];

/** Origen de un ítem de la baton: objeto de dominio auto-derivado o nota manual. */
export const SHIFT_HANDOVER_ITEM_SOURCES = [
  "MANUAL",
  "INCIDENT",
  "INCIDENT_ACTION",
  "EXCEPTION",
  "INCIDENT_REPORT",
  "ROUND",
] as const;
export const shiftHandoverItemSourceSchema = z.enum(SHIFT_HANDOVER_ITEM_SOURCES);
export type ShiftHandoverItemSource = (typeof SHIFT_HANDOVER_ITEM_SOURCES)[number];

/**
 * Secciones del cockpit (la navegación izquierda del maestro-detalle, §3). Son
 * DATO de presentación auto-derivable del turno; el mapeo a "disciplinas"
 * (Producción/HSE/Mantención/Ambiental) por taxonomía de catálogo queda como
 * mejora futura (BACKLOG). PENDING es la baton (también visible en el panel
 * derecho).
 */
export const HANDOVER_SECTIONS = [
  { key: "ENTRIES", labelKey: "handover.sections.entries" },
  { key: "EXCEPTIONS", labelKey: "handover.sections.exceptions" },
  { key: "INCIDENTS", labelKey: "handover.sections.incidents" },
  { key: "FOLLOWUP", labelKey: "handover.sections.followup" },
  { key: "ROUNDS", labelKey: "handover.sections.rounds" },
  { key: "PENDING", labelKey: "handover.sections.pending" },
] as const;
export type HandoverSectionKey = (typeof HANDOVER_SECTIONS)[number]["key"];

/**
 * Estado general declarado al cierre del turno. Vocabulario inicial fijo
 * (alineado al prototipo); volverlo catálogo configurable = mejora futura.
 */
export const HANDOVER_GENERAL_STATUSES = [
  "OPERATIONAL",
  "OPERATIONAL_WITH_OBSERVATIONS",
  "STOPPED_MAINTENANCE",
  "STOPPED_FAILURE",
] as const;
export const handoverGeneralStatusSchema = z.enum(HANDOVER_GENERAL_STATUSES);
export type HandoverGeneralStatus = (typeof HANDOVER_GENERAL_STATUSES)[number];

// === Compilación (cockpit auto-poblado) =======================================

/** Alcance + dimensiones operacionales resueltas de una entrega. */
export const handoverScopeSchema = z.object({
  orgNodeId: z.string(),
  nodeName: z.string(),
  /** Turno SALIENTE (el que se entrega). */
  shiftCode: z.string().nullable(),
  shiftLabel: z.string().nullable(),
  /** Turno ENTRANTE (el que recibe), derivado del calendario. */
  incomingShiftCode: z.string().nullable(),
  incomingShiftLabel: z.string().nullable(),
  /** Día operacional "YYYY-MM-DD". */
  operationalDay: z.string(),
  /** Ventana del turno en UTC (ISO), base del rango de compilación. */
  windowStart: z.string(),
  windowEnd: z.string(),
  timezone: z.string(),
});
export type HandoverScope = z.infer<typeof handoverScopeSchema>;

const compiledEntrySchema = z.object({
  id: z.string(),
  folio: z.string(),
  templateName: z.string(),
  status: z.string(),
  byName: z.string().nullable(),
  at: z.string(),
  severity: z.number().int().nullable(),
});
export type CompiledEntry = z.infer<typeof compiledEntrySchema>;

const compiledExceptionSchema = z.object({
  id: z.string(),
  /** warning | critical | rule | manual (clasificación de origen). */
  kind: z.string(),
  detail: z.string(),
  status: z.string(),
  fieldLabel: z.string().nullable(),
  at: z.string(),
  /** Si ya derivó en incidencia. */
  incidentId: z.string().nullable(),
});
export type CompiledException = z.infer<typeof compiledExceptionSchema>;

const compiledIncidentSchema = z.object({
  id: z.string(),
  folio: z.string(),
  title: z.string(),
  typeName: z.string().nullable(),
  severity: z.number().int(),
  stateName: z.string().nullable(),
  dueAt: z.string().nullable(),
  /** Flags derivados para resaltar en el cockpit. */
  critical: z.boolean(),
  overdue: z.boolean(),
});
export type CompiledIncident = z.infer<typeof compiledIncidentSchema>;

const compiledFollowupSchema = z.object({
  id: z.string(),
  /** "ACTION" (CAPA) | "REPORT" (reporte regulatorio). */
  kind: z.enum(["ACTION", "REPORT"]),
  code: z.string(),
  title: z.string(),
  incidentFolio: z.string(),
  incidentId: z.string(),
  dueAt: z.string().nullable(),
  status: z.string(),
  overdue: z.boolean(),
});
export type CompiledFollowup = z.infer<typeof compiledFollowupSchema>;

const compiledRoundSchema = z.object({
  id: z.string(),
  name: z.string(),
  templateName: z.string(),
  /** "COMPLETED" | "OVERDUE" | "PENDING" | "SKIPPED". */
  status: z.string(),
  scheduledFor: z.string(),
  dueAt: z.string().nullable(),
});
export type CompiledRound = z.infer<typeof compiledRoundSchema>;

/** Contenido COMPILADO del cockpit (vista en vivo o snapshot congelado al firmar). */
export const handoverCockpitSchema = z.object({
  scope: handoverScopeSchema,
  generatedAt: z.string(),
  /** Conteo por sección (para los badges del nav). */
  counts: z.record(z.string(), z.number().int()),
  entries: z.array(compiledEntrySchema),
  exceptions: z.array(compiledExceptionSchema),
  incidents: z.array(compiledIncidentSchema),
  followups: z.array(compiledFollowupSchema),
  rounds: z.array(compiledRoundSchema),
});
export type HandoverCockpit = z.infer<typeof handoverCockpitSchema>;

// === Baton (ítems que ruedan) =================================================

export const shiftHandoverItemSchema = z.object({
  id: z.string(),
  source: shiftHandoverItemSourceSchema,
  status: shiftHandoverItemStatusSchema,
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  title: z.string(),
  detail: z.string().nullable(),
  /** Sección/categoría sugerida del cockpit. */
  category: z.string().nullable(),
  severity: z.number().int().nullable(),
  /** Entrega en la que NACIÓ el ítem (rastro del rolling). */
  originHandoverId: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type ShiftHandoverItem = z.infer<typeof shiftHandoverItemSchema>;

// === Firma / acuse (Part 11 inline) ===========================================

export const handoverSignatureSchema = z.object({
  byId: z.string().nullable(),
  byName: z.string().nullable(),
  at: z.string().nullable(),
  meaning: z.string().nullable(),
  method: z.string().nullable(),
});
export type HandoverSignature = z.infer<typeof handoverSignatureSchema>;

export const handoverAcknowledgeStateSchema = z.object({
  readSummary: z.boolean(),
  reviewedItems: z.boolean(),
  noObservations: z.boolean(),
  observations: z.string().nullable(),
});
export type HandoverAcknowledgeState = z.infer<typeof handoverAcknowledgeStateSchema>;

// === Timeline =================================================================

export const shiftHandoverActivitySchema = z.object({
  id: z.string(),
  kind: z.string(),
  summary: z.string(),
  actorName: z.string().nullable(),
  occurredAt: z.string(),
});
export type ShiftHandoverActivity = z.infer<typeof shiftHandoverActivitySchema>;

// === DTOs de lista / detalle ==================================================

export const shiftHandoverListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  status: shiftHandoverStatusSchema,
  orgNodeId: z.string(),
  nodeName: z.string(),
  shiftCode: z.string().nullable(),
  shiftLabel: z.string().nullable(),
  operationalDay: z.string(),
  generalStatus: handoverGeneralStatusSchema.nullable(),
  outgoingByName: z.string().nullable(),
  incomingByName: z.string().nullable(),
  signedOutAt: z.string().nullable(),
  acknowledgedAt: z.string().nullable(),
  /** Pendientes abiertos (OPEN+CARRIED) en la baton. */
  openItemCount: z.number().int(),
  createdAt: z.string(),
});
export type ShiftHandoverListItem = z.infer<typeof shiftHandoverListItemSchema>;

export const shiftHandoverDetailSchema = shiftHandoverListItemSchema.extend({
  summaryText: z.string().nullable(),
  /** Cómo se generó el resumen: `none` = determinista (Slice 1). */
  summaryProvider: z.string().nullable(),
  /** Contenido del cockpit: snapshot congelado si está firmado; vista en vivo si no. */
  cockpit: handoverCockpitSchema,
  /** true si `cockpit` proviene del snapshot congelado (read-only). */
  frozen: z.boolean(),
  items: z.array(shiftHandoverItemSchema),
  signOut: handoverSignatureSchema,
  acknowledgement: handoverSignatureSchema,
  ackState: handoverAcknowledgeStateSchema,
  cancelReason: z.string().nullable(),
  activities: z.array(shiftHandoverActivitySchema),
  /** Permisos efectivos del actor sobre ESTA entrega (gobierna botones del cockpit). */
  canSign: z.boolean(),
  canAcknowledge: z.boolean(),
});
export type ShiftHandoverDetail = z.infer<typeof shiftHandoverDetailSchema>;

// === Requests =================================================================

/** Compilar (o recuperar) la entrega del turno actual de un nodo. */
export const compileHandoverRequestSchema = z.object({
  orgNodeId: z.string().min(1),
  /** Instante de referencia (ISO). Default = ahora. El turno se resuelve del calendario. */
  at: z.string().datetime().optional(),
});
export type CompileHandoverRequest = z.infer<typeof compileHandoverRequestSchema>;

export const updateHandoverSummaryRequestSchema = z.object({
  generalStatus: handoverGeneralStatusSchema.optional(),
  /** Texto del resumen (editable antes de firmar). Vacío ⇒ se re-deriva el determinista. */
  summaryText: z.string().max(8000).optional(),
  /** Re-derivar el resumen desde el cockpit. */
  regenerate: z.boolean().optional(),
  /**
   * Solo con `regenerate`: generar el resumen con IA (proveedor configurado, grounded al
   * snapshot). Si no hay IA o falla, cae al determinista (degradación elegante, AC-IA-5):
   * la respuesta vuelve con `summaryProvider="none"`. La firma sigue siendo humana.
   */
  useAi: z.boolean().optional(),
});
export type UpdateHandoverSummaryRequest = z.infer<typeof updateHandoverSummaryRequestSchema>;

export const addHandoverItemRequestSchema = z.object({
  title: z.string().trim().min(3).max(280),
  detail: z.string().trim().max(2000).optional(),
  category: z.string().trim().max(48).optional(),
  severity: z.number().int().min(1).max(5).optional(),
});
export type AddHandoverItemRequest = z.infer<typeof addHandoverItemRequestSchema>;

export const updateHandoverItemRequestSchema = z.object({
  status: shiftHandoverItemStatusSchema.optional(),
  title: z.string().trim().min(3).max(280).optional(),
  detail: z.string().trim().max(2000).optional().nullable(),
});
export type UpdateHandoverItemRequest = z.infer<typeof updateHandoverItemRequestSchema>;

/** Firma del saliente (Part 11): re-autenticación + estado general al cierre. */
export const signOutHandoverRequestSchema = z.object({
  password: z.string().min(1),
  mfaCode: z.string().optional(),
  generalStatus: handoverGeneralStatusSchema,
});
export type SignOutHandoverRequest = z.infer<typeof signOutHandoverRequestSchema>;

/** Acuse del entrante (Part 11): checks de revisión + observaciones + re-autenticación. */
export const acknowledgeHandoverRequestSchema = z.object({
  password: z.string().min(1),
  mfaCode: z.string().optional(),
  readSummary: z.literal(true),
  reviewedItems: z.literal(true),
  noObservations: z.boolean(),
  observations: z.string().trim().max(2000).optional(),
});
export type AcknowledgeHandoverRequest = z.infer<typeof acknowledgeHandoverRequestSchema>;

export const cancelHandoverRequestSchema = z.object({
  reason: z.string().trim().min(5).max(500),
});
export type CancelHandoverRequest = z.infer<typeof cancelHandoverRequestSchema>;

/** Filtros del historial (filtros en 1 línea + paginación). */
export const shiftHandoverListQuerySchema = z.object({
  orgNodeId: z.string().optional(),
  shiftCode: z.string().optional(),
  status: shiftHandoverStatusSchema.optional(),
  /** Día operacional desde/hasta "YYYY-MM-DD". */
  fromDay: z.string().optional(),
  toDay: z.string().optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ShiftHandoverListQuery = z.infer<typeof shiftHandoverListQuerySchema>;

export const shiftHandoverListResponseSchema = z.object({
  items: z.array(shiftHandoverListItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type ShiftHandoverListResponse = z.infer<typeof shiftHandoverListResponseSchema>;

// === Helpers PUROS ============================================================

/** Folio humano de una entrega: "SH-0001". */
export function shiftHandoverCode(n: number): string {
  return `SH-${String(n).padStart(4, "0")}`;
}

/** Resolución de la ventana de un turno (saliente + entrante) para compilar. */
export interface HandoverWindow {
  operationalDay: string;
  shiftCode: string | null;
  shiftLabel: string | null;
  incomingShiftCode: string | null;
  incomingShiftLabel: string | null;
  /** Ventana del turno SALIENTE en UTC. */
  windowStart: Date;
  windowEnd: Date;
}

/**
 * Resuelve, para un instante y un calendario de turnos, el turno saliente, su
 * ventana en UTC y el turno entrante (el que empieza al cerrar). Función PURA
 * (única dependencia: `Intl` vía los helpers de fecha). Sin turnos o en un hueco,
 * la ventana cae al día operacional completo y el turno entrante es null.
 */
export function resolveHandoverWindow(at: Date, cal: ShiftResolverCalendar): HandoverWindow {
  const { operationalDate, shiftCode, shiftLabel } = resolveShift(at, cal);
  const shift = shiftCode != null ? cal.shifts.find((s) => s.code === shiftCode) : undefined;

  if (!shift) {
    // Hueco / sin turnos: ventana = día operacional completo (00:00 → +24 h).
    const start = zonedTimeToUtc(operationalDate, "00:00", cal.timezone);
    return {
      operationalDay: operationalDate,
      shiftCode,
      shiftLabel,
      incomingShiftCode: null,
      incomingShiftLabel: null,
      windowStart: start,
      windowEnd: new Date(start.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  // La ventana puede arrancar en el día operacional o en el día civil del instante;
  // usamos la fecha local del instante para anclar el inicio de pared del turno.
  const windowStart = zonedTimeToUtc(localDayOf(at, cal.timezone, shift.startTime), shift.startTime, cal.timezone);
  // Corrige el caso del turno nocturno que arrancó "ayer": si el inicio calculado
  // queda en el futuro respecto del instante, retrocede un día.
  let start = windowStart;
  if (start.getTime() > at.getTime()) {
    const prevDay = isoMinusOneDay(localDayOf(at, cal.timezone, shift.startTime));
    start = zonedTimeToUtc(prevDay, shift.startTime, cal.timezone);
  }
  const end = new Date(start.getTime() + shift.durationMinutes * 60 * 1000);

  // Turno entrante = el que cubre el instante de cierre.
  const incoming = resolveShift(new Date(end.getTime() + 1000), cal);

  return {
    operationalDay: operationalDate,
    shiftCode,
    shiftLabel,
    incomingShiftCode: incoming.shiftCode,
    incomingShiftLabel: incoming.shiftLabel,
    windowStart: start,
    windowEnd: end,
  };
}

/** Fecha local "YYYY-MM-DD" del instante en la TZ (para anclar la hora de pared). */
function localDayOf(at: Date, tz: string, _startTime: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return fmt.format(at); // en-CA ⇒ "YYYY-MM-DD"
}

function isoMinusOneDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! - 1));
  return dt.toISOString().slice(0, 10);
}

/** ¿El ítem de la baton sigue abierto (rueda al siguiente turno)? */
export function isHandoverItemOpen(status: ShiftHandoverItemStatus): boolean {
  return status === "OPEN" || status === "CARRIED";
}

/**
 * Construye el RESUMEN DETERMINISTA (modo `none`, sin IA) a partir del cockpit
 * compilado y los pendientes. Función PURA: es la fuente del brief profesional
 * del Slice 1 y la línea base que el resumen por IA (Slice 3) deberá igualar o
 * superar. Todo lo que aparece aquí es rastreable al dato crudo mostrado al lado
 * (pre-cumple el grounding AC-IA-2/AC-IA-3).
 */
export function buildDeterministicSummary(
  cockpit: HandoverCockpit,
  openItems: readonly { title: string }[],
  opts: { generalStatus?: HandoverGeneralStatus | null; generalStatusLabel?: string } = {},
): string {
  const lines: string[] = [];
  const s = cockpit.scope;
  const turno = s.shiftLabel ?? s.shiftCode ?? "turno";
  const estado = opts.generalStatusLabel ?? generalStatusFallback(opts.generalStatus);
  lines.push(`Entrega de ${turno} en ${s.nodeName}. Estado general al cierre: ${estado}.`);

  const criticalInc = cockpit.incidents.filter((i) => i.critical).length;
  const overdueInc = cockpit.incidents.filter((i) => i.overdue).length;
  if (cockpit.incidents.length > 0) {
    let t = `Incidencias activas en el alcance: ${cockpit.incidents.length}`;
    const extra: string[] = [];
    if (criticalInc > 0) extra.push(`${criticalInc} crítica(s)`);
    if (overdueInc > 0) extra.push(`${overdueInc} con plazo vencido`);
    if (extra.length) t += ` (${extra.join(", ")})`;
    lines.push(`${t}.`);
  } else {
    lines.push("Sin incidencias activas en el alcance.");
  }

  const critExc = cockpit.exceptions.filter((e) => e.kind === "critical").length;
  if (cockpit.exceptions.length > 0) {
    lines.push(
      `Excepciones del turno: ${cockpit.exceptions.length}${critExc > 0 ? ` (${critExc} crítica(s) — lecturas fuera de umbral)` : ""}.`,
    );
  }

  const overdueFollow = cockpit.followups.filter((f) => f.overdue).length;
  if (cockpit.followups.length > 0) {
    lines.push(
      `Acciones/Reportes pendientes: ${cockpit.followups.length}${overdueFollow > 0 ? ` (${overdueFollow} vencido(s))` : ""}.`,
    );
  }

  const overdueRounds = cockpit.rounds.filter((r) => r.status === "OVERDUE").length;
  const doneRounds = cockpit.rounds.filter((r) => r.status === "COMPLETED").length;
  if (cockpit.rounds.length > 0) {
    lines.push(`Rondas: ${doneRounds} cumplida(s), ${overdueRounds} vencida(s) de ${cockpit.rounds.length}.`);
  }

  lines.push(`Registros sellados en el turno: ${cockpit.entries.length}.`);

  if (openItems.length > 0) {
    lines.push("Pendientes para el turno entrante:");
    for (const it of openItems.slice(0, 12)) lines.push(`• ${it.title}`);
    if (openItems.length > 12) lines.push(`• … y ${openItems.length - 12} más.`);
  } else {
    lines.push("Sin pendientes adicionales para el turno entrante.");
  }

  return lines.join("\n");
}

function generalStatusFallback(status?: HandoverGeneralStatus | null): string {
  switch (status) {
    case "OPERATIONAL":
      return "Operativo";
    case "OPERATIONAL_WITH_OBSERVATIONS":
      return "Operativo con observaciones";
    case "STOPPED_MAINTENANCE":
      return "Detenido por mantención";
    case "STOPPED_FAILURE":
      return "Detenido por falla";
    default:
      return "—";
  }
}
