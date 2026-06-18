import {
  incidentDashboardSchema,
  incidentDetailSchema,
  incidentListResponseSchema,
  incidentStatsSchema,
  type IncidentDashboard,
  type IncidentDashboardQuery,
  incidentTypeSchema,
  incidentCategorySchema,
  incidentCommentSchema,
  incidentActionSchema,
  incidentInvestigationSchema,
  incidentReportSchema,
  reportingObligationSchema,
  type CancelIncidentReportRequest,
  type CreateIncidentReportRequest,
  type IncidentReportDto,
  type MarkIncidentReportNotApplicableRequest,
  type ReportingObligationDto,
  type SubmitIncidentReportRequest,
  type UpdateIncidentReportRequest,
  type UpsertReportingObligationRequest,
  type CompleteIncidentInvestigationRequest,
  type IncidentInvestigationDto,
  type UpsertIncidentInvestigationRequest,
  type AddIncidentCommentRequest,
  type CancelIncidentActionRequest,
  type CompleteIncidentActionRequest,
  type CreateIncidentActionRequest,
  type IncidentActionDto,
  type UpdateIncidentActionRequest,
  type VerifyIncidentActionRequest,
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
  type UpsertIncidentTypeRequest,
  type UpsertIncidentCategoryRequest,
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
  if (q.reportOverdueOnly) p.set("reportOverdueOnly", "true");
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

/** Querystring del dashboard (Fase 4.5): filtros categóricos + rango + bucket + ventana. */
function dashboardQueryString(q: IncidentDashboardQuery): string {
  const p = new URLSearchParams();
  if (q.lifecycle) p.set("lifecycle", q.lifecycle);
  if (q.typeId) p.set("typeId", q.typeId);
  if (q.categoryId) p.set("categoryId", q.categoryId);
  if (q.severity) p.set("severity", String(q.severity));
  if (q.priority) p.set("priority", q.priority);
  if (q.originType) p.set("originType", q.originType);
  if (q.orgNodeIds && q.orgNodeIds.length) p.set("orgNodeIds", q.orgNodeIds.join(","));
  if (q.equipmentId) p.set("equipmentId", q.equipmentId);
  if (q.createdFrom) p.set("createdFrom", new Date(q.createdFrom).toISOString());
  if (q.createdTo) p.set("createdTo", new Date(q.createdTo).toISOString());
  if (q.bucket) p.set("bucket", q.bucket);
  if (q.recurrenceWindowDays) p.set("recurrenceWindowDays", String(q.recurrenceWindowDays));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function fetchIncidentDashboard(q: IncidentDashboardQuery): Promise<IncidentDashboard> {
  return apiJson(`/incidents/dashboard${dashboardQueryString(q)}`, incidentDashboardSchema);
}

export function fetchIncidentDetail(id: string): Promise<IncidentDetail> {
  return apiJson(`/incidents/${id}`, incidentDetailSchema);
}

export function fetchIncidentStats(): Promise<IncidentStats> {
  return apiJson("/incidents/stats", incidentStatsSchema);
}

export function fetchIncidentTypes(includeInactive = false): Promise<IncidentTypeDto[]> {
  return apiJson(`/incidents/types${includeInactive ? "?includeInactive=true" : ""}`, z.array(incidentTypeSchema));
}

export function fetchIncidentCategories(includeInactive = false): Promise<IncidentCategoryDto[]> {
  return apiJson(`/incidents/categories${includeInactive ? "?includeInactive=true" : ""}`, z.array(incidentCategorySchema));
}

/** Upsert de un tipo de catálogo. `create=true` pide al backend rechazar (409) una key ya usada. */
export function upsertIncidentType(dto: UpsertIncidentTypeRequest, create = false): Promise<IncidentTypeDto> {
  return apiJson(`/incidents/types${create ? "?create=true" : ""}`, incidentTypeSchema, { method: "POST", body: dto });
}

export function upsertIncidentCategory(dto: UpsertIncidentCategoryRequest, create = false): Promise<IncidentCategoryDto> {
  return apiJson(`/incidents/categories${create ? "?create=true" : ""}`, incidentCategorySchema, { method: "POST", body: dto });
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

// --- Acciones CAPA (Fase 4.2a) -----------------------------------------------

export function fetchIncidentActions(incidentId: string): Promise<IncidentActionDto[]> {
  return apiJson(`/incidents/${incidentId}/actions`, z.array(incidentActionSchema));
}

export function createIncidentAction(incidentId: string, dto: CreateIncidentActionRequest): Promise<IncidentActionDto> {
  return apiJson(`/incidents/${incidentId}/actions`, incidentActionSchema, { method: "POST", body: dto });
}

export function updateIncidentAction(actionId: string, dto: UpdateIncidentActionRequest): Promise<IncidentActionDto> {
  return apiJson(`/incidents/actions/${actionId}`, incidentActionSchema, { method: "PATCH", body: dto });
}

export function completeIncidentAction(actionId: string, dto: CompleteIncidentActionRequest): Promise<IncidentActionDto> {
  return apiJson(`/incidents/actions/${actionId}/complete`, incidentActionSchema, { method: "POST", body: dto });
}

export function verifyIncidentAction(actionId: string, dto: VerifyIncidentActionRequest): Promise<IncidentActionDto> {
  return apiJson(`/incidents/actions/${actionId}/verify`, incidentActionSchema, { method: "POST", body: dto });
}

export function cancelIncidentAction(actionId: string, dto: CancelIncidentActionRequest): Promise<IncidentActionDto> {
  return apiJson(`/incidents/actions/${actionId}/cancel`, incidentActionSchema, { method: "POST", body: dto });
}

// --- Investigación de causa raíz (Fase 4.2b) ---------------------------------

const investigationNullableSchema = incidentInvestigationSchema.nullable();

export function fetchIncidentInvestigation(incidentId: string): Promise<IncidentInvestigationDto | null> {
  return apiJson(`/incidents/${incidentId}/investigation`, investigationNullableSchema);
}

export function upsertIncidentInvestigation(incidentId: string, dto: UpsertIncidentInvestigationRequest): Promise<IncidentInvestigationDto> {
  return apiJson(`/incidents/${incidentId}/investigation`, incidentInvestigationSchema, { method: "POST", body: dto });
}

export function completeIncidentInvestigation(incidentId: string, dto: CompleteIncidentInvestigationRequest): Promise<IncidentInvestigationDto> {
  return apiJson(`/incidents/${incidentId}/investigation/complete`, incidentInvestigationSchema, { method: "POST", body: dto });
}

export function reopenIncidentInvestigation(incidentId: string): Promise<IncidentInvestigationDto> {
  return apiJson(`/incidents/${incidentId}/investigation/reopen`, incidentInvestigationSchema, { method: "POST", body: {} });
}

// --- Reportabilidad (Fase 4.3) -----------------------------------------------

export function fetchReportingObligations(includeInactive = false): Promise<ReportingObligationDto[]> {
  return apiJson(`/incidents/obligations${includeInactive ? "?includeInactive=true" : ""}`, z.array(reportingObligationSchema));
}

export function upsertReportingObligation(dto: UpsertReportingObligationRequest, create = false): Promise<ReportingObligationDto> {
  return apiJson(`/incidents/obligations${create ? "?create=true" : ""}`, reportingObligationSchema, { method: "POST", body: dto });
}

export function fetchIncidentReports(incidentId: string): Promise<IncidentReportDto[]> {
  return apiJson(`/incidents/${incidentId}/reports`, z.array(incidentReportSchema));
}

export function materializeIncidentReports(incidentId: string): Promise<number> {
  return apiJson(`/incidents/${incidentId}/reports/materialize`, z.number(), { method: "POST", body: {} });
}

export function createIncidentReport(incidentId: string, dto: CreateIncidentReportRequest): Promise<IncidentReportDto> {
  return apiJson(`/incidents/${incidentId}/reports`, incidentReportSchema, { method: "POST", body: dto });
}

export function updateIncidentReport(reportId: string, dto: UpdateIncidentReportRequest): Promise<IncidentReportDto> {
  return apiJson(`/incidents/reports/${reportId}`, incidentReportSchema, { method: "PATCH", body: dto });
}

export function submitIncidentReport(reportId: string, dto: SubmitIncidentReportRequest): Promise<IncidentReportDto> {
  return apiJson(`/incidents/reports/${reportId}/submit`, incidentReportSchema, { method: "POST", body: dto });
}

export function markIncidentReportNotApplicable(reportId: string, dto: MarkIncidentReportNotApplicableRequest): Promise<IncidentReportDto> {
  return apiJson(`/incidents/reports/${reportId}/not-applicable`, incidentReportSchema, { method: "POST", body: dto });
}

export function cancelIncidentReport(reportId: string, dto: CancelIncidentReportRequest): Promise<IncidentReportDto> {
  return apiJson(`/incidents/reports/${reportId}/cancel`, incidentReportSchema, { method: "POST", body: dto });
}
