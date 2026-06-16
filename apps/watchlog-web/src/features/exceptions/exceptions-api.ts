import {
  exceptionDedupeSuggestionSchema,
  exceptionListResponseSchema,
  exceptionSummarySchema,
  logEntryExceptionSchema,
  type AcknowledgeExceptionRequest,
  type AssociateExceptionRequest,
  type ConvertExceptionRequest,
  type CorrectExceptionRequest,
  type CreateManualExceptionRequest,
  type DismissExceptionRequest,
  type ExceptionDedupeSuggestion,
  type ExceptionListQuery,
  type ExceptionListResponse,
  type ExceptionSummary,
  type LogEntryExceptionDto,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson } from "../../lib/api-client.js";

function queryString(q: ExceptionListQuery): string {
  const p = new URLSearchParams();
  if (q.search) p.set("search", q.search);
  if (q.status) p.set("status", q.status);
  if (q.openOnly) p.set("openOnly", "true");
  if (q.thresholdType) p.set("thresholdType", q.thresholdType);
  if (q.triggerKind) p.set("triggerKind", q.triggerKind);
  if (q.logEntryId) p.set("logEntryId", q.logEntryId);
  if (q.incidentId) p.set("incidentId", q.incidentId);
  if (q.orgNodeIds && q.orgNodeIds.length) p.set("orgNodeIds", q.orgNodeIds.join(","));
  if (q.equipmentId) p.set("equipmentId", q.equipmentId);
  if (q.unlinkedOnly) p.set("unlinkedOnly", "true");
  if (q.sort) p.set("sort", q.sort);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function fetchExceptions(q: ExceptionListQuery): Promise<ExceptionListResponse> {
  return apiJson(`/exceptions${queryString(q)}`, exceptionListResponseSchema);
}

export function fetchExceptionSummary(logEntryId: string): Promise<ExceptionSummary> {
  return apiJson(`/exceptions/summary?logEntryId=${encodeURIComponent(logEntryId)}`, exceptionSummarySchema);
}

export function fetchExceptionDetail(id: string): Promise<LogEntryExceptionDto> {
  return apiJson(`/exceptions/${id}`, logEntryExceptionSchema);
}

export function fetchDedupeSuggestions(id: string): Promise<ExceptionDedupeSuggestion[]> {
  return apiJson(`/exceptions/${id}/dedupe-suggestions`, z.array(exceptionDedupeSuggestionSchema));
}

export function acknowledgeException(id: string, dto: AcknowledgeExceptionRequest): Promise<LogEntryExceptionDto> {
  return apiJson(`/exceptions/${id}/acknowledge`, logEntryExceptionSchema, { method: "POST", body: dto });
}

export function dismissException(id: string, dto: DismissExceptionRequest): Promise<LogEntryExceptionDto> {
  return apiJson(`/exceptions/${id}/dismiss`, logEntryExceptionSchema, { method: "POST", body: dto });
}

export function correctException(id: string, dto: CorrectExceptionRequest): Promise<LogEntryExceptionDto> {
  return apiJson(`/exceptions/${id}/correct`, logEntryExceptionSchema, { method: "POST", body: dto });
}

const convertResultSchema = z.object({ incidentId: z.string() });
export type ConvertResult = z.infer<typeof convertResultSchema>;

export function convertException(dto: ConvertExceptionRequest): Promise<ConvertResult> {
  return apiJson("/exceptions/convert", convertResultSchema, { method: "POST", body: dto });
}

export function associateException(dto: AssociateExceptionRequest): Promise<ConvertResult> {
  return apiJson("/exceptions/associate", convertResultSchema, { method: "POST", body: dto });
}

export function createManualException(dto: CreateManualExceptionRequest): Promise<LogEntryExceptionDto> {
  return apiJson("/exceptions/manual", logEntryExceptionSchema, { method: "POST", body: dto });
}
