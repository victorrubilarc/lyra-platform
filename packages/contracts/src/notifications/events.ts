/**
 * Catálogo de EVENTOS de notificación — Bloque N. Fuente de verdad en CÓDIGO
 * (como `PERMISSION_CATALOG`), no en BD: el motor, el seed de plantillas y la UI
 * de preferencias se derivan de aquí. Cada evento declara las VARIABLES
 * (placeholders) que su plantilla puede usar — whitelist que valida el render
 * SIN `eval` (misma postura segura que el motor de reglas) — con su descripción y
 * un VALOR DE EJEMPLO (para el diccionario + la vista previa del editor).
 *
 * Un evento es `tx-driven` (lo emite el cambio de dominio dentro de su misma
 * transacción, p. ej. una transición de flujo) o `derived` (lo descubre un barrido
 * periódico, p. ej. una ronda vencida o un SLA incumplido — no hay transacción que
 * lo dispare). El resolvedor de destinatarios vive en el backend (consulta BD/ABAC);
 * aquí solo se declara QUÉ datos expone el evento.
 */

/** Una variable disponible para las plantillas de un evento (placeholder `{{name}}`). */
export interface NotificationVariableDef {
  /** Nombre del placeholder, p. ej. `entry.folio`. Se referencia como `{{entry.folio}}`. */
  readonly name: string;
  /** Descripción legible (se muestra en el diccionario del editor de plantillas). */
  readonly description: string;
  /** Valor de ejemplo (para la vista previa en vivo y el diccionario). */
  readonly sample: string;
}

/** Definición de un evento de notificación del catálogo. */
export interface NotificationEventDef {
  /** Clave única y estable, convención `recurso.suceso` (ej. `round.overdue`). */
  readonly key: string;
  /** Grupo para agrupar en la UI (preferencias / plantillas). */
  readonly group: string;
  /** Clave i18n del nombre visible. */
  readonly labelKey: string;
  /** Descripción legible (para qué sirve / cuándo se dispara). */
  readonly description: string;
  /** `derived` = lo descubre el sweeper; `tx` = lo emite el cambio de dominio en su tx. */
  readonly origin: "tx" | "derived";
  /** Variables que el evento expone a la plantilla (whitelist del render). */
  readonly variables: readonly NotificationVariableDef[];
}

/** Variables comunes a TODOS los eventos (contexto de la app + destinatario). */
const COMMON_VARIABLES: readonly NotificationVariableDef[] = [
  { name: "recipient.name", description: "Nombre del destinatario.", sample: "Ana Pérez" },
  { name: "app.name", description: "Nombre del producto.", sample: "Lyra WatchLog" },
  { name: "app.url", description: "URL pública de la aplicación.", sample: "https://watchlog.tuempresa.cl" },
] as const;

/**
 * Variables compartidas por los eventos ligados a una ENTRADA de bitácora. Incluye
 * `entry.summary`: el bloque de campos de RESUMEN configurados en la plantilla
 * (`gridFieldKeys`), ya formateados (etiqueta + valor + unidad, locale activo). Así
 * el correo puede llevar datos PROPIOS de la bitácora sin acoplar la plantilla a un
 * tipo de formulario (las variables de campo individuales = fase 2).
 */
const ENTRY_VARIABLES: readonly NotificationVariableDef[] = [
  { name: "entry.folio", description: "Folio de la entrada.", sample: "#1248" },
  { name: "entry.template", description: "Plantilla de la entrada.", sample: "Ronda de turno — Molienda" },
  { name: "entry.node", description: "Nodo (área) de la entrada.", sample: "Planta Concentradora ▸ Molienda" },
  { name: "entry.url", description: "Enlace directo a la entrada.", sample: "https://watchlog.tuempresa.cl/bitacoras/abc123" },
  {
    name: "entry.summary",
    description: "Campos de resumen de la bitácora (los configurados en «Resumen en la grilla»), con etiqueta, valor y unidad.",
    sample: "Temperatura molino: 78 °C · Presión: 2,1 bar · Estado: Conforme",
  },
] as const;

/**
 * Catálogo de eventos del MVP (4). Crece por fase: incidencias (Fase 4), turnos
 * (Fase 5) añaden sus claves aquí.
 */
export const NOTIFICATION_EVENTS = [
  {
    key: "round.overdue",
    group: "schedules",
    labelKey: "notifications.events.roundOverdue",
    description:
      "Una ronda programada venció (pasó su plazo sin iniciarse). Avisa al rol responsable del horario (o, sin responsable, a quien se suscriba).",
    origin: "derived",
    variables: [
      ...COMMON_VARIABLES,
      { name: "schedule.name", description: "Nombre del horario de la ronda.", sample: "Ronda turno A — Molienda" },
      { name: "template.name", description: "Plantilla de la ronda.", sample: "Ronda de turno — Molienda" },
      { name: "node.name", description: "Nodo (área) de la ronda.", sample: "Planta Concentradora ▸ Molienda" },
      { name: "equipment.tag", description: "Equipo asociado (si lo hay).", sample: "ML-01" },
      { name: "occurrence.scheduledFor", description: "Momento programado de la ronda.", sample: "16 jun 2026, 08:00" },
      { name: "occurrence.dueAt", description: "Plazo límite de la ronda.", sample: "16 jun 2026, 09:00" },
      { name: "occurrence.overdueBy", description: "Tiempo de atraso.", sample: "2 h 30 min" },
    ],
  },
  {
    key: "entry.sla.breached",
    group: "logbook",
    labelKey: "notifications.events.slaBreached",
    description:
      "Una entrada superó el tiempo máximo de permanencia (SLA) en su estado de flujo. Avisa a los responsables del estado actual.",
    origin: "derived",
    variables: [
      ...COMMON_VARIABLES,
      ...ENTRY_VARIABLES,
      { name: "entry.state", description: "Estado de flujo actual.", sample: "En revisión" },
      { name: "entry.sla", description: "SLA del estado.", sample: "4 h" },
      { name: "entry.delayedBy", description: "Tiempo de atraso sobre el SLA.", sample: "1 h 10 min" },
    ],
  },
  {
    key: "entry.transition",
    group: "logbook",
    labelKey: "notifications.events.transition",
    description:
      "Una entrada avanzó de estado en su flujo. Avisa a los responsables del nuevo estado («te toca»).",
    origin: "tx",
    variables: [
      ...COMMON_VARIABLES,
      ...ENTRY_VARIABLES,
      { name: "entry.fromState", description: "Estado de origen.", sample: "Borrador" },
      { name: "entry.toState", description: "Estado de destino (el nuevo).", sample: "En revisión" },
      { name: "entry.actor", description: "Quién ejecutó la transición.", sample: "Juan Soto" },
    ],
  },
  {
    key: "entry.signature.pending",
    group: "logbook",
    labelKey: "notifications.events.signaturePending",
    description:
      "Una entrada quedó en un estado que requiere firma electrónica (Part 11). Avisa a los responsables de firmar.",
    origin: "tx",
    variables: [
      ...COMMON_VARIABLES,
      ...ENTRY_VARIABLES,
      { name: "entry.state", description: "Estado que requiere firma.", sample: "Aprobación supervisor" },
    ],
  },
] as const satisfies readonly NotificationEventDef[];

/** Unión literal de todas las claves de evento conocidas. */
export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number]["key"];

/** Todas las claves del catálogo, como arreglo plano. */
export const ALL_NOTIFICATION_EVENT_KEYS: readonly NotificationEventKey[] = NOTIFICATION_EVENTS.map(
  (e) => e.key as NotificationEventKey,
);

const EVENT_BY_KEY = new Map<string, NotificationEventDef>(NOTIFICATION_EVENTS.map((e) => [e.key, e]));

/** ¿La cadena es una clave de evento válida del catálogo? */
export function isNotificationEventKey(value: string): value is NotificationEventKey {
  return EVENT_BY_KEY.has(value);
}

/** Definición de un evento por su clave (o `undefined` si no existe). */
export function notificationEventDef(key: string): NotificationEventDef | undefined {
  return EVENT_BY_KEY.get(key);
}

/** Conjunto de placeholders permitidos para un evento (común + propios). */
export function allowedVariablesForEvent(key: string): Set<string> {
  const def = EVENT_BY_KEY.get(key);
  return new Set((def?.variables ?? []).map((v) => v.name));
}

/**
 * Prefijo de las VARIABLES DE CAMPO de una bitácora (épico notif. avanzadas, Fase A):
 * `{{campo.<key>}}`. Solo aplican a plantillas AD-HOC atadas a una bitácora; el editor
 * ofrece las keys de la versión PUBLICADA y el valor sale de la versión CONGELADA de la
 * entrada al renderizar (campo ausente ⇒ vacío, degradación elegante).
 */
export const FIELD_VARIABLE_PREFIX = "campo.";

/** Nombre de placeholder de un campo de bitácora (ej. `campo.temp_molino`). */
export function fieldVariableName(fieldKey: string): string {
  return `${FIELD_VARIABLE_PREFIX}${fieldKey}`;
}

/** ¿El placeholder es una variable de campo (`campo.<key>`)? */
export function isFieldVariable(name: string): boolean {
  return name.startsWith(FIELD_VARIABLE_PREFIX) && name.length > FIELD_VARIABLE_PREFIX.length;
}

/**
 * Conjunto de placeholders permitidos para una PLANTILLA: las del evento más, si la
 * plantilla está atada a una bitácora, las variables de campo `campo.<key>`. `fieldKeys`
 * vacío ⇒ solo las del evento (genérica). Whitelist del render seguro (sin eval).
 */
export function allowedVariablesForTemplate(eventKey: string, fieldKeys: readonly string[] = []): Set<string> {
  const allowed = allowedVariablesForEvent(eventKey);
  for (const k of fieldKeys) allowed.add(fieldVariableName(k));
  return allowed;
}

/** Contexto de EJEMPLO de un evento (variable → valor de ejemplo), para la vista previa. */
export function sampleContextForEvent(key: string): Record<string, string> {
  const def = EVENT_BY_KEY.get(key);
  const ctx: Record<string, string> = {};
  for (const v of def?.variables ?? []) ctx[v.name] = v.sample;
  return ctx;
}
