import {
  shiftHandoverDetailSchema,
  shiftHandoverListResponseSchema,
  type AcknowledgeHandoverRequest,
  type AddHandoverItemRequest,
  type CancelHandoverRequest,
  type CompileHandoverRequest,
  type ShiftHandoverDetail,
  type ShiftHandoverListQuery,
  type ShiftHandoverListResponse,
  type SignOutHandoverRequest,
  type UpdateHandoverItemRequest,
  type UpdateHandoverSummaryRequest,
} from "@lyra/contracts";
import { API_BASE, apiJson } from "../../lib/api-client.js";
import { getAccessToken } from "../../lib/session-token.js";

function queryString(q: ShiftHandoverListQuery): string {
  const p = new URLSearchParams();
  if (q.orgNodeId) p.set("orgNodeId", q.orgNodeId);
  if (q.shiftCode) p.set("shiftCode", q.shiftCode);
  if (q.status) p.set("status", q.status);
  if (q.fromDay) p.set("fromDay", q.fromDay);
  if (q.toDay) p.set("toDay", q.toDay);
  if (q.search) p.set("search", q.search);
  p.set("page", String(q.page));
  p.set("pageSize", String(q.pageSize));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function fetchHandovers(q: ShiftHandoverListQuery): Promise<ShiftHandoverListResponse> {
  return apiJson(`/shift-handover${queryString(q)}`, shiftHandoverListResponseSchema);
}

export function fetchHandoverDetail(id: string): Promise<ShiftHandoverDetail> {
  return apiJson(`/shift-handover/${id}`, shiftHandoverDetailSchema);
}

export function compileHandover(dto: CompileHandoverRequest): Promise<ShiftHandoverDetail> {
  return apiJson("/shift-handover/compile", shiftHandoverDetailSchema, { method: "POST", body: dto });
}

export function updateHandoverSummary(id: string, dto: UpdateHandoverSummaryRequest): Promise<ShiftHandoverDetail> {
  return apiJson(`/shift-handover/${id}/summary`, shiftHandoverDetailSchema, { method: "PATCH", body: dto });
}

export function addHandoverItem(id: string, dto: AddHandoverItemRequest): Promise<ShiftHandoverDetail> {
  return apiJson(`/shift-handover/${id}/items`, shiftHandoverDetailSchema, { method: "POST", body: dto });
}

export function updateHandoverItem(id: string, itemId: string, dto: UpdateHandoverItemRequest): Promise<ShiftHandoverDetail> {
  return apiJson(`/shift-handover/${id}/items/${itemId}`, shiftHandoverDetailSchema, { method: "PATCH", body: dto });
}

export function signOutHandover(id: string, dto: SignOutHandoverRequest): Promise<ShiftHandoverDetail> {
  return apiJson(`/shift-handover/${id}/sign-out`, shiftHandoverDetailSchema, { method: "POST", body: dto });
}

export function acknowledgeHandover(id: string, dto: AcknowledgeHandoverRequest): Promise<ShiftHandoverDetail> {
  return apiJson(`/shift-handover/${id}/acknowledge`, shiftHandoverDetailSchema, { method: "POST", body: dto });
}

export function cancelHandover(id: string, dto: CancelHandoverRequest): Promise<ShiftHandoverDetail> {
  return apiJson(`/shift-handover/${id}/cancel`, shiftHandoverDetailSchema, { method: "POST", body: dto });
}

/**
 * URL del stream SSE del resumen por IA en vivo (Slice 3). `EventSource` no puede mandar el
 * header Authorization, así que el access token viaja por query (auth confinada a ese endpoint
 * en el backend). `generalStatus` viaja para que el grounding refleje el estado seleccionado.
 */
export function handoverSummaryStreamUrl(id: string, generalStatus?: string): string | null {
  const token = getAccessToken();
  if (!token) return null;
  const p = new URLSearchParams({ access_token: token });
  if (generalStatus) p.set("generalStatus", generalStatus);
  return `${API_BASE}/shift-handover/${id}/summary/stream?${p.toString()}`;
}
