import {
  createLogEntryRequestSchema,
  logEntryDetailSchema,
  logEntryListItemSchema,
  saveLogEntrySectionRequestSchema,
  submitLogEntryRequestSchema,
  type CreateLogEntryRequest,
  type LogEntryDetail,
  type LogEntryListItem,
  type LogEntryListQuery,
  type SaveLogEntrySectionRequest,
  type SubmitLogEntryRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson } from "../../lib/api-client.js";

export function fetchLogEntries(query: LogEntryListQuery = {}): Promise<LogEntryListItem[]> {
  const params = new URLSearchParams();
  if (query.templateId) params.set("templateId", query.templateId);
  if (query.orgNodeId) params.set("orgNodeId", query.orgNodeId);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiJson(`/log-entries${qs ? `?${qs}` : ""}`, z.array(logEntryListItemSchema));
}

export function fetchLogEntry(id: string): Promise<LogEntryDetail> {
  return apiJson(`/log-entries/${id}`, logEntryDetailSchema);
}

export function createLogEntry(dto: CreateLogEntryRequest): Promise<LogEntryDetail> {
  createLogEntryRequestSchema.parse(dto);
  return apiJson("/log-entries", logEntryDetailSchema, { method: "POST", body: dto });
}

export function saveLogEntrySection(
  id: string,
  sectionKey: string,
  dto: SaveLogEntrySectionRequest,
): Promise<LogEntryDetail> {
  saveLogEntrySectionRequestSchema.parse(dto);
  return apiJson(`/log-entries/${id}/sections/${encodeURIComponent(sectionKey)}`, logEntryDetailSchema, {
    method: "PUT",
    body: dto,
  });
}

export function submitLogEntry(id: string, dto: SubmitLogEntryRequest = {}): Promise<LogEntryDetail> {
  submitLogEntryRequestSchema.parse(dto);
  return apiJson(`/log-entries/${id}/submit`, logEntryDetailSchema, { method: "POST", body: dto });
}
