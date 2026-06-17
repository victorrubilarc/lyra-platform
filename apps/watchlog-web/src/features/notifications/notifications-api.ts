import { z } from "zod";
import {
  notificationTemplateSchema,
  notificationSubscriptionSchema,
  notificationPreferenceSchema,
  notificationOutboxItemSchema,
  notificationOutboxDetailSchema,
  createNotificationTemplateRequestSchema,
  updateNotificationTemplateRequestSchema,
  setNotificationPreferenceRequestSchema,
  upsertNotificationSubscriptionRequestSchema,
  type NotificationTemplateDto,
  type NotificationTemplateListQuery,
  type CreateNotificationTemplateRequest,
  type NotificationSubscriptionDto,
  type NotificationPreferenceDto,
  type NotificationOutboxItem,
  type NotificationOutboxDetail,
  type NotificationOutboxQuery,
  type UpdateNotificationTemplateRequest,
  type SetNotificationPreferenceRequest,
  type UpsertNotificationSubscriptionRequest,
} from "@lyra/contracts";
import { apiJson, apiVoid } from "../../lib/api-client.js";

// --- Catálogo de eventos (variables disponibles para el editor de plantillas) ---
const eventDefSchema = z.object({
  key: z.string(),
  group: z.string(),
  labelKey: z.string(),
  description: z.string(),
  origin: z.enum(["tx", "derived"]),
  variables: z.array(z.object({ name: z.string(), description: z.string(), sample: z.string() })),
});
export type NotificationEventDefDto = z.infer<typeof eventDefSchema>;

export function fetchNotificationEvents(): Promise<NotificationEventDefDto[]> {
  return apiJson("/notifications/events", z.object({ events: z.array(eventDefSchema) })).then((r) => r.events);
}

// --- Plantillas ---
export function fetchNotificationTemplates(q: NotificationTemplateListQuery = {}): Promise<NotificationTemplateDto[]> {
  const qs = new URLSearchParams();
  if (q.eventKey) qs.set("eventKey", q.eventKey);
  if (q.scope) qs.set("scope", q.scope);
  if (q.templateId) qs.set("templateId", q.templateId);
  if (q.q) qs.set("q", q.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiJson(`/notifications/templates${suffix}`, z.object({ templates: z.array(notificationTemplateSchema) })).then((r) => r.templates);
}

export function createNotificationTemplate(dto: CreateNotificationTemplateRequest): Promise<NotificationTemplateDto> {
  createNotificationTemplateRequestSchema.parse(dto);
  return apiJson("/notifications/templates", notificationTemplateSchema, { method: "POST", body: dto });
}

export function updateNotificationTemplate(id: string, dto: UpdateNotificationTemplateRequest): Promise<NotificationTemplateDto> {
  updateNotificationTemplateRequestSchema.parse(dto);
  return apiJson(`/notifications/templates/${id}`, notificationTemplateSchema, { method: "PATCH", body: dto });
}

export function deleteNotificationTemplate(id: string): Promise<void> {
  return apiVoid(`/notifications/templates/${id}`, { method: "DELETE" });
}

/** Comodines de campo `{{campo.<key>}}` de la bitácora a la que se ata una plantilla ad-hoc. */
const fieldVariableSchema = z.object({ name: z.string(), description: z.string(), sample: z.string() });
export type NotificationFieldVariable = z.infer<typeof fieldVariableSchema>;

export function fetchNotificationFieldVariables(templateId: string): Promise<NotificationFieldVariable[]> {
  return apiJson(
    `/notifications/templates/field-variables?templateId=${encodeURIComponent(templateId)}`,
    z.object({ variables: z.array(fieldVariableSchema) }),
  ).then((r) => r.variables);
}

// --- Suscripciones ---
export function fetchNotificationSubscriptions(): Promise<NotificationSubscriptionDto[]> {
  return apiJson("/notifications/subscriptions", z.object({ subscriptions: z.array(notificationSubscriptionSchema) })).then(
    (r) => r.subscriptions,
  );
}

export function createNotificationSubscription(dto: UpsertNotificationSubscriptionRequest): Promise<NotificationSubscriptionDto> {
  upsertNotificationSubscriptionRequestSchema.parse(dto);
  return apiJson("/notifications/subscriptions", notificationSubscriptionSchema, { method: "POST", body: dto });
}

export function deleteNotificationSubscription(id: string): Promise<void> {
  return apiVoid(`/notifications/subscriptions/${id}`, { method: "DELETE" });
}

// --- Preferencias propias ---
export function fetchMyNotificationPreferences(): Promise<NotificationPreferenceDto[]> {
  return apiJson("/notifications/preferences", z.object({ preferences: z.array(notificationPreferenceSchema) })).then(
    (r) => r.preferences,
  );
}

export function setMyNotificationPreference(dto: SetNotificationPreferenceRequest): Promise<NotificationPreferenceDto> {
  setNotificationPreferenceRequestSchema.parse(dto);
  return apiJson("/notifications/preferences", notificationPreferenceSchema, { method: "PUT", body: dto });
}

// --- Bandeja de salida ---
const outboxListSchema = z.object({ items: z.array(notificationOutboxItemSchema), nextCursor: z.string().nullable() });

export function fetchNotificationOutbox(q: NotificationOutboxQuery = {}): Promise<{ items: NotificationOutboxItem[]; nextCursor: string | null }> {
  const qs = new URLSearchParams();
  if (q.status) qs.set("status", q.status);
  if (q.eventKey) qs.set("eventKey", q.eventKey);
  if (q.q) qs.set("q", q.q);
  if (q.cursor) qs.set("cursor", q.cursor);
  if (q.limit) qs.set("limit", String(q.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiJson(`/notifications/outbox${suffix}`, outboxListSchema);
}

export function fetchNotificationOutboxDetail(id: string): Promise<NotificationOutboxDetail> {
  return apiJson(`/notifications/outbox/${id}`, notificationOutboxDetailSchema);
}

export function retryNotificationOutbox(id: string): Promise<NotificationOutboxItem> {
  return apiJson(`/notifications/outbox/${id}/retry`, notificationOutboxItemSchema, { method: "POST", body: {} });
}
