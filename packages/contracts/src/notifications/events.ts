/**
 * Catálogo de EVENTOS de notificación — Bloque N. Fuente de verdad en CÓDIGO
 * (como `PERMISSION_CATALOG`), no en BD: el motor, el seed de plantillas y la UI
 * de preferencias se derivan de aquí. Cada evento declara las VARIABLES
 * (placeholders) que su plantilla puede usar — whitelist que valida el render
 * SIN `eval` (misma postura segura que el motor de reglas).
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
  /** Descripción legible (se muestra en el editor de plantillas). */
  readonly description: string;
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
  { name: "recipient.name", description: "Nombre del destinatario." },
  { name: "app.name", description: "Nombre del producto (Lyra WatchLog)." },
  { name: "app.url", description: "URL pública de la aplicación." },
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
      "Una ronda programada venció (pasó su plazo sin iniciarse). Avisa al rol responsable del horario (o, sin responsable, a quien alcanza el nodo).",
    origin: "derived",
    variables: [
      ...COMMON_VARIABLES,
      { name: "schedule.name", description: "Nombre del horario de la ronda." },
      { name: "template.name", description: "Plantilla de la ronda." },
      { name: "node.name", description: "Nodo (área) de la ronda." },
      { name: "equipment.tag", description: "Equipo asociado (si lo hay)." },
      { name: "occurrence.scheduledFor", description: "Momento programado de la ronda." },
      { name: "occurrence.dueAt", description: "Plazo límite de la ronda." },
      { name: "occurrence.overdueBy", description: "Tiempo de atraso (ej. «2 h 30 min»)." },
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
      { name: "entry.folio", description: "Folio de la entrada." },
      { name: "entry.template", description: "Plantilla de la entrada." },
      { name: "entry.node", description: "Nodo (área) de la entrada." },
      { name: "entry.state", description: "Estado de flujo actual." },
      { name: "entry.sla", description: "SLA del estado (ej. «4 h»)." },
      { name: "entry.delayedBy", description: "Tiempo de atraso sobre el SLA." },
      { name: "entry.url", description: "Enlace directo a la entrada." },
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
      { name: "entry.folio", description: "Folio de la entrada." },
      { name: "entry.template", description: "Plantilla de la entrada." },
      { name: "entry.node", description: "Nodo (área) de la entrada." },
      { name: "entry.fromState", description: "Estado de origen." },
      { name: "entry.toState", description: "Estado de destino (el nuevo)." },
      { name: "entry.actor", description: "Quién ejecutó la transición." },
      { name: "entry.url", description: "Enlace directo a la entrada." },
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
      { name: "entry.folio", description: "Folio de la entrada." },
      { name: "entry.template", description: "Plantilla de la entrada." },
      { name: "entry.node", description: "Nodo (área) de la entrada." },
      { name: "entry.state", description: "Estado que requiere firma." },
      { name: "entry.url", description: "Enlace directo a la entrada." },
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
