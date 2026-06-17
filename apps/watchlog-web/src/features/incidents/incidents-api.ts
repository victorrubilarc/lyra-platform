import {
  incidentDetailSchema,
  incidentListResponseSchema,
  incidentStatsSchema,
  incidentTypeSchema,
  incidentCategorySchema,
  incidentCommentSchema,
  type AddIncidentCommentRequest,
  type AssignIncidentRequest,
  type CancelIncidentRequest,
  type CreateIncidentRequest,
  type IncidentDetail,
  type IncidentListQuery,
  type IncidentListResponse,
  type IncidentStats,
  type IncidentTypeDto,
  type IncidentCategoryDto,
  type IncidentCommentDto,
  type TransitionIncidentRequest,
  type UpdateIncidentRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson } from "../../lib/api-client.js";

function queryString(q: IncidentListQuery): string {
  const p = new URLSearchParams();
  if (q.search) p.set("search", q.search);
  if (q.lifecycle) p.set("lifecycle", q.lifecycle);
  if (q.typeId) p.set("typeId", q.typeId);
  if (q.categoryId) p.set("categoryId", q.categoryId);
  if (q.severity) p.set("severity", String(q.severity));
  if (q.priority) p.set("priority", q.priority);
  if (q.originType) p.set("originType", q.originType);
  if (q.orgNodeIds && q.orgNodeIds.length) p.set("orgNodeIds", q.orgNodeIds.join(","));
  if (q.equipmentId) p.set("equipmentId", q.equipmentId);
  if (q.ownerId) p.set("ownerId", q.ownerId);
  if (q.currentStateKey) p.set("currentStateKey", q.currentStateKey);
  if (q.mine) p.set("mine", "true");
  if (q.unassignedOnly) p.set("unassignedOnly", "true");
  if (q.overdueOnly) p.set("overdueOnly", "true");
  if (q.reportableOnly) p.set("reportableOnly", "true");
  if (q.fromLogbookOnly) p.set("fromLogbookOnly", "true");
  if (q.sort) p.set("sort", q.sort);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function fetchIncidents(q: IncidentListQuery): Promise<IncidentListResponse> {
  return apiJson(`/incidents${queryString(q)}`, incidentListResponseSchema);
}

export function fetchIncidentDetail(id: string): Promise<IncidentDetail> {
  return apiJson(`/incidents/${id}`, incidentDetailSchema);
}

export function fetchIncidentStats(): Promise<IncidentStats> {
  return apiJson("/incidents/stats", incidentStatsSchema);
}

export function fetchIncidentTypes(): Promise<IncidentTypeDto[]> {
  return apiJson("/incidents/types", z.array(incidentTypeSchema));
}

export function fetchIncidentCategories(): Promise<IncidentCategoryDto[]> {
  return apiJson("/incidents/categories", z.array(incidentCategorySchema));
}

const userOptionSchema = z.object({ id: z.string(), name: z.string() });
export type IncidentUserOption = z.infer<typeof userOptionSchema>;

export function fetchAssignableUsers(): Promise<IncidentUserOption[]> {
  return apiJson("/incidents/users", z.array(userOptionSchema));
}

const equipmentOptionSchema = z.object({ id: z.string(), name: z.string(), tag: z.string().nullable() });
export type IncidentEquipmentOption = z.infer<typeof equipmentOptionSchema>;

export function fetchIncidentEquipmentOptions(nodeId: string): Promise<IncidentEquipmentOption[]> {
  return apiJson(`/incidents/equipment-options?nodeId=${encodeURIComponent(nodeId)}`, z.array(equipmentOptionSchema));
}

export function createIncident(dto: CreateIncidentRequest): Promise<IncidentDetail> {
  return apiJson("/incidents", incidentDetailSchema, { method: "POST", body: dto });
}

export function updateIncident(id: string, dto: UpdateIncidentRequest): Promise<IncidentDetail> {
  return apiJson(`/incidents/${id}`, incidentDetailSchema, { method: "PATCH", body: dto });
}

export function assignIncident(id: string, dto: AssignIncidentRequest): Promise<IncidentDetail> {
  return apiJson(`/incidents/${id}/assign`, incidentDetailSchema, { method: "POST", body: dto });
}

export function commentIncident(id: string, dto: AddIncidentCommentRequest): Promise<IncidentCommentDto> {
  return apiJson(`/incidents/${id}/comments`, incidentCommentSchema, { method: "POST", body: dto });
}

export function transitionIncident(id: string, dto: TransitionIncidentRequest): Promise<IncidentDetail> {
  return apiJson(`/incidents/${id}/transitions`, incidentDetailSchema, { method: "POST", body: dto });
}

export function cancelIncident(id: string, dto: CancelIncidentRequest): Promise<IncidentDetail> {
  return apiJson(`/incidents/${id}/cancel`, incidentDetailSchema, { method: "POST", body: dto });
}
