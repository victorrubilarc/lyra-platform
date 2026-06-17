import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateNotificationTemplateRequest,
  InboxListQuery,
  NotificationOutboxQuery,
  NotificationTemplateListQuery,
  SetNotificationPreferenceRequest,
  UpdateNotificationTemplateRequest,
  UpsertNotificationSubscriptionRequest,
} from "@lyra/contracts";
import {
  createNotificationSubscription,
  createNotificationTemplate,
  deleteNotificationSubscription,
  deleteNotificationTemplate,
  fetchInbox,
  fetchInboxUnreadCount,
  fetchMyNotificationPreferences,
  fetchNotificationEvents,
  fetchNotificationFieldVariables,
  fetchNotificationOutbox,
  fetchNotificationSubscriptions,
  fetchNotificationTemplates,
  markAllInboxRead,
  markInboxRead,
  retryNotificationOutbox,
  setMyNotificationPreference,
  updateNotificationTemplate,
} from "./notifications-api.js";

export const NOTIF_KEYS = {
  all: ["notifications"] as const,
  events: () => ["notifications", "events"] as const,
  templates: (q: NotificationTemplateListQuery = {}) => ["notifications", "templates", q] as const,
  fieldVariables: (templateId: string) => ["notifications", "field-variables", templateId] as const,
  subscriptions: () => ["notifications", "subscriptions"] as const,
  preferences: () => ["notifications", "preferences"] as const,
  outbox: (q: NotificationOutboxQuery) => ["notifications", "outbox", q] as const,
  inbox: (q: InboxListQuery = {}) => ["notifications", "inbox", q] as const,
  inboxUnread: () => ["notifications", "inbox", "unread"] as const,
};

/** Fallback de poll del contador de no leídas (SSE lo hace instantáneo cuando conecta). */
const UNREAD_POLL_MS = 60_000;

/** Contador de no leídas de la campanita (badge). Poll como respaldo del SSE. */
export function useInboxUnreadCount(enabled = true) {
  return useQuery({
    queryKey: NOTIF_KEYS.inboxUnread(),
    queryFn: fetchInboxUnreadCount,
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    refetchOnWindowFocus: true,
  });
}

/** Lista de notificaciones in-app del usuario (campanita / bandeja). */
export function useInbox(query: InboxListQuery = {}, enabled = true) {
  return useQuery({ queryKey: NOTIF_KEYS.inbox(query), queryFn: () => fetchInbox(query), enabled });
}

export function useMarkInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markInboxRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}

export function useMarkAllInboxRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllInboxRead(),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}

export function useNotificationEvents() {
  return useQuery({ queryKey: NOTIF_KEYS.events(), queryFn: fetchNotificationEvents, staleTime: Infinity });
}

export function useNotificationTemplates(query: NotificationTemplateListQuery = {}, enabled = true) {
  return useQuery({ queryKey: NOTIF_KEYS.templates(query), queryFn: () => fetchNotificationTemplates(query), enabled });
}

/** Comodines de campo `{{campo.<key>}}` de una bitácora (editor de plantilla ad-hoc). */
export function useNotificationFieldVariables(templateId: string | null) {
  return useQuery({
    queryKey: NOTIF_KEYS.fieldVariables(templateId ?? ""),
    queryFn: () => fetchNotificationFieldVariables(templateId as string),
    enabled: Boolean(templateId),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateNotificationTemplateRequest) => createNotificationTemplate(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}

export function useUpdateNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateNotificationTemplateRequest }) => updateNotificationTemplate(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}

export function useDeleteNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotificationTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}

export function useNotificationSubscriptions(enabled = true) {
  return useQuery({ queryKey: NOTIF_KEYS.subscriptions(), queryFn: fetchNotificationSubscriptions, enabled });
}

export function useCreateNotificationSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertNotificationSubscriptionRequest) => createNotificationSubscription(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.subscriptions() }),
  });
}

export function useDeleteNotificationSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotificationSubscription(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.subscriptions() }),
  });
}

export function useMyNotificationPreferences(enabled = true) {
  return useQuery({ queryKey: NOTIF_KEYS.preferences(), queryFn: fetchMyNotificationPreferences, enabled });
}

export function useSetMyNotificationPreference() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SetNotificationPreferenceRequest) => setMyNotificationPreference(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.preferences() }),
  });
}

export function useNotificationOutbox(q: NotificationOutboxQuery = {}, enabled = true) {
  return useQuery({ queryKey: NOTIF_KEYS.outbox(q), queryFn: () => fetchNotificationOutbox(q), enabled });
}

export function useRetryNotificationOutbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryNotificationOutbox(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIF_KEYS.all }),
  });
}
