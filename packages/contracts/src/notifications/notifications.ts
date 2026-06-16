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

/** Canales de entrega. EMAIL es el único implementado; el resto reserva el modelo. */
export const NOTIFICATION_CHANNELS = ["EMAIL"] as const;
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
  subject: z.string(),
  bodyText: z.string(),
  bodyHtml: z.string(),
  active: z.boolean(),
  /** De sistema (sembrada por defecto). El admin puede editarla pero no borrarla. */
  isSystem: z.boolean(),
  updatedAt: z.string(),
});
export type NotificationTemplateDto = z.infer<typeof notificationTemplateSchema>;

/** Editar una plantilla (asunto/cuerpos/activo). El evento/locale/canal no cambian. */
export const updateNotificationTemplateRequestSchema = z.object({
  subject: z.string().trim().min(1).max(300),
  bodyText: z.string().trim().min(1).max(20000),
  bodyHtml: z.string().trim().min(1).max(50000),
  active: z.boolean().optional(),
});
export type UpdateNotificationTemplateRequest = z.infer<typeof updateNotificationTemplateRequestSchema>;

export const notificationTemplateListResponseSchema = z.object({
  templates: z.array(notificationTemplateSchema),
});
export type NotificationTemplateListResponse = z.infer<typeof notificationTemplateListResponseSchema>;

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
