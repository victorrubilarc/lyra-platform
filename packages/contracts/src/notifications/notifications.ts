import { z } from "zod";
import { isNotificationEventKey } from "./events.js";

/**
 * Contratos del motor de notificaciones (Bloque N) — fuente única back↔front.
 * Cinco entidades: `NotificationEvent` (cola transaccional, interna — no se expone
 * como DTO editable), `NotificationOutbox` (bandeja de salida + registro de envío),
 * `NotificationTemplate` (gobernanza viva), `NotificationSubscription` (watchers) y
 * `NotificationPreference` (dato personal, ownership). El catálogo de EVENTOS vive
 * en `./events`; el render seguro en `./render`.
 */

// --- Enumeraciones -----------------------------------------------------------

/** Canales de entrega. EMAIL = correo (SMTP/relay); INAPP = la "campanita" (notificación
 *  in-app por destinatario, leído/no leído). SMS/otros reservan el modelo a futuro. */
export const NOTIFICATION_CHANNELS = ["EMAIL", "INAPP"] as const;
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);
export type NotificationChannel = z.infer<typeof notificationChannelSchema>;

/** Estado de una fila de la bandeja de salida (un mensaje a un destinatario). */
export const NOTIFICATION_OUTBOX_STATUSES = ["PENDING", "SENT", "FAILED", "SUPPRESSED"] as const;
export const notificationOutboxStatusSchema = z.enum(NOTIFICATION_OUTBOX_STATUSES);
export type NotificationOutboxStatus = z.infer<typeof notificationOutboxStatusSchema>;

/** Modo de entrega por preferencia del usuario. DIGEST está diseñado pero diferido. */
export const NOTIFICATION_MODES = ["IMMEDIATE", "DIGEST", "OFF"] as const;
export const notificationModeSchema = z.enum(NOTIFICATION_MODES);
export type NotificationMode = z.infer<typeof notificationModeSchema>;

/** Una clave de evento del catálogo (validada contra `NOTIFICATION_EVENTS`). */
export const notificationEventKeySchema = z
  .string()
  .refine((v) => isNotificationEventKey(v), { message: "Evento de notificación desconocido" });

/** Locale BCP-47 acotado (es-CL hoy; el modelo soporta i18n por plantilla). */
export const notificationLocaleSchema = z.string().trim().min(2).max(10);

// --- Plantillas de mensaje (gobernanza viva) ---------------------------------

export const notificationTemplateSchema = z.object({
  id: z.string(),
  eventKey: z.string(),
  locale: z.string(),
  channel: notificationChannelSchema,
  /** ÁMBITO (épico notif. avanzadas, Fase A): null = GENÉRICA (por defecto); con valor =
   *  específica de esa bitácora (plantilla de formulario). Resolución: la específica
   *  (evento × bitácora) primero; fallback a la genérica. */
  templateId: z.string().nullable(),
  /** Nombre de la bitácora del ámbito, resuelto en backend (null = genérica/«Por defecto»). */
  templateName: z.string().nullable().optional(),
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string(),
  active: z.boolean(),
  /** De sistema (sembrada por defecto). El admin puede editarla pero no borrarla. Las ad-hoc
   *  (por bitácora) NO son de sistema ⇒ se pueden borrar. */
  isSystem: z.boolean(),
  updatedAt: z.string(),
});
export type NotificationTemplateDto = z.infer<typeof notificationTemplateSchema>;

/** Editar una plantilla (asunto/cuerpos/activo). El evento/locale/canal/ámbito no cambian. */
export const updateNotificationTemplateRequestSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  bodyText: z.string().trim().min(1).max(20000),
  bodyHtml: z.string().trim().min(1).max(50000),
  active: z.boolean().optional(),
});
export type UpdateNotificationTemplateRequest = z.infer<typeof updateNotificationTemplateRequestSchema>;

/** Crear una plantilla AD-HOC por bitácora (épico notif. avanzadas). El ámbito (`templateId`)
 *  apunta a una plantilla de formulario; `null` no se permite aquí (la genérica ya existe por
 *  seed y se edita, no se crea). */
export const createNotificationTemplateRequestSchema = z.object({
  eventKey: notificationEventKeySchema,
  locale: notificationLocaleSchema,
  channel: notificationChannelSchema.optional(),
  /** Bitácora (plantilla de formulario) a la que se ata esta plantilla específica. */
  templateId: z.string().min(1),
  subject: z.string().trim().min(1).max(300),
  bodyText: z.string().trim().min(1).max(20000),
  bodyHtml: z.string().trim().min(1).max(50000),
  active: z.boolean().optional(),
});
export type CreateNotificationTemplateRequest = z.infer<typeof createNotificationTemplateRequestSchema>;

/** Filtros del listado de plantillas (master): por evento y por ámbito. */
export const notificationTemplateListQuerySchema = z.object({
  eventKey: z.string().optional(),
  /** `generic` = solo «Por defecto»; `scoped` = solo por bitácora; omitido = todas. */
  scope: z.enum(["generic", "scoped"]).optional(),
  templateId: z.string().optional(),
  q: z.string().trim().max(200).optional(),
});
export type NotificationTemplateListQuery = z.infer<typeof notificationTemplateListQuerySchema>;

export const notificationTemplateListResponseSchema = z.object({
  templates: z.array(notificationTemplateSchema),
});
export type NotificationTemplateListResponse = z.infer<typeof notificationTemplateListResponseSchema>;

/**
 * Precedencia de plantilla (fuente única back↔front): de un conjunto de candidatas del
 * MISMO evento/locale/canal, elige la ESPECÍFICA de la bitácora (`templateId` coincide)
 * y, si no hay, la GENÉRICA (`templateId === null`). Solo considera activas. Devuelve
 * `null` si no hay ninguna aplicable.
 */
export function pickTemplateForScope<T extends { templateId: string | null; active: boolean }>(
  candidates: readonly T[],
  logbookTemplateId: string | null,
): T | null {
  const active = candidates.filter((c) => c.active);
  if (logbookTemplateId) {
    const specific = active.find((c) => c.templateId === logbookTemplateId);
    if (specific) return specific;
  }
  return active.find((c) => c.templateId === null) ?? null;
}

// --- Suscripciones (watchers) ------------------------------------------------

export const notificationSubscriptionSchema = z.object({
  id: z.string(),
  eventKey: z.string(),
  subjectUserId: z.string().nullable(),
  subjectRoleId: z.string().nullable(),
  subjectRoleName: z.string().nullable().optional(),
  orgNodeId: z.string().nullable(),
  includeDescendants: z.boolean(),
  templateId: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
});
export type NotificationSubscriptionDto = z.infer<typeof notificationSubscriptionSchema>;

/** Crear/editar una suscripción. Sujeto = usuario XOR rol (uno y solo uno). */
export const upsertNotificationSubscriptionRequestSchema = z
  .object({
    eventKey: notificationEventKeySchema,
    subjectUserId: z.string().nullish(),
    subjectRoleId: z.string().nullish(),
    orgNodeId: z.string().nullish(),
    includeDescendants: z.boolean().optional(),
    templateId: z.string().nullish(),
    enabled: z.boolean().optional(),
  })
  .refine((v) => Boolean(v.subjectUserId) !== Boolean(v.subjectRoleId), {
    message: "Indique exactamente un sujeto: usuario o rol",
    path: ["subjectUserId"],
  });
export type UpsertNotificationSubscriptionRequest = z.infer<
  typeof upsertNotificationSubscriptionRequestSchema
>;

export const notificationSubscriptionListResponseSchema = z.object({
  subscriptions: z.array(notificationSubscriptionSchema),
});
export type NotificationSubscriptionListResponse = z.infer<
  typeof notificationSubscriptionListResponseSchema
>;

// --- Preferencias del usuario (dato personal, ownership) ----------------------

export const notificationPreferenceSchema = z.object({
  eventKey: z.string(),
  channel: notificationChannelSchema,
  mode: notificationModeSchema,
});
export type NotificationPreferenceDto = z.infer<typeof notificationPreferenceSchema>;

/** Fijar el modo de un evento×canal para el usuario autenticado. */
export const setNotificationPreferenceRequestSchema = z.object({
  eventKey: notificationEventKeySchema,
  channel: notificationChannelSchema,
  mode: notificationModeSchema,
});
export type SetNotificationPreferenceRequest = z.infer<typeof setNotificationPreferenceRequestSchema>;

export const notificationPreferenceListResponseSchema = z.object({
  preferences: z.array(notificationPreferenceSchema),
});
export type NotificationPreferenceListResponse = z.infer<
  typeof notificationPreferenceListResponseSchema
>;

// --- Bandeja de salida (outbox / registro de envío) --------------------------

export const notificationOutboxItemSchema = z.object({
  id: z.string(),
  eventKey: z.string(),
  channel: notificationChannelSchema,
  recipientUserId: z.string().nullable(),
  recipientName: z.string().nullable().optional(),
  recipientEmail: z.string(),
  subject: z.string(),
  status: notificationOutboxStatusSchema,
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  relatedEntityType: z.string().nullable(),
  relatedEntityId: z.string().nullable(),
  createdAt: z.string(),
  sentAt: z.string().nullable(),
});
export type NotificationOutboxItem = z.infer<typeof notificationOutboxItemSchema>;

/** Detalle de un mensaje de la bandeja (incluye el cuerpo renderizado). */
export const notificationOutboxDetailSchema = notificationOutboxItemSchema.extend({
  bodyText: z.string(),
  bodyHtml: z.string(),
});
export type NotificationOutboxDetail = z.infer<typeof notificationOutboxDetailSchema>;

/** Filtros de la bandeja de salida (pantalla de correo saliente, Req-1/Req-5). */
export const notificationOutboxQuerySchema = z.object({
  status: notificationOutboxStatusSchema.optional(),
  eventKey: z.string().optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type NotificationOutboxQuery = z.infer<typeof notificationOutboxQuerySchema>;

export const notificationOutboxListResponseSchema = z.object({
  items: z.array(notificationOutboxItemSchema),
  nextCursor: z.string().nullable(),
});
export type NotificationOutboxListResponse = z.infer<typeof notificationOutboxListResponseSchema>;

// --- Bandeja IN-APP (la "campanita", ownership) ------------------------------
//
// Fase B del épico: una notificación in-app es una fila de `NotificationOutbox`
// con `channel = INAPP` y `recipientUserId = el dueño`. "Leída" = `readAt` no nulo.
// Estos DTOs exponen SOLO las del usuario autenticado (nunca las de otro).

export const inboxItemSchema = z.object({
  id: z.string(),
  eventKey: z.string(),
  subject: z.string(),
  /** Vista previa del cuerpo en texto plano (recortada en backend para la lista). */
  preview: z.string(),
  /** Tipo/id de la entidad relacionada (para derivar el deep link en el cliente). */
  relatedEntityType: z.string().nullable(),
  relatedEntityId: z.string().nullable(),
  createdAt: z.string(),
  /** Momento de entrega (in-app: cuando el worker la marca SENT). */
  sentAt: z.string().nullable(),
  /** null = NO leída. */
  readAt: z.string().nullable(),
});
export type InboxItem = z.infer<typeof inboxItemSchema>;

/** Filtros de la bandeja in-app: por estado de lectura + paginación por cursor. */
export const inboxListQuerySchema = z.object({
  unreadOnly: z.coerce.boolean().optional(),
  q: z.string().trim().max(200).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export type InboxListQuery = z.infer<typeof inboxListQuerySchema>;

export const inboxListResponseSchema = z.object({
  items: z.array(inboxItemSchema),
  nextCursor: z.string().nullable(),
  /** Conteo total de NO leídas del usuario (para mantener el badge sincronizado). */
  unread: z.number().int(),
});
export type InboxListResponse = z.infer<typeof inboxListResponseSchema>;

export const inboxUnreadCountSchema = z.object({ unread: z.number().int() });
export type InboxUnreadCount = z.infer<typeof inboxUnreadCountSchema>;

/**
 * Deep link de una notificación in-app a partir de la entidad relacionada que el
 * outbox ya guarda (`relatedEntityType`/`relatedEntityId`). Fuente ÚNICA back↔front
 * para que la campanita navegue de forma consistente sin materializar URLs en BD.
 * Devuelve una ruta relativa del SPA, o `null` si la entidad no tiene destino propio.
 */
export function deepLinkForEntity(type: string | null, id: string | null): string | null {
  if (!type || !id) return null;
  switch (type) {
    case "LogEntry":
      return `/bitacoras/${id}`;
    case "RoundOccurrence":
      return "/mis-rondas";
    case "Incident":
      return `/incidencias?incidentId=${id}`;
    case "ShiftHandover":
      return `/cambio-turno?handoverId=${id}`;
    default:
      return null;
  }
}
