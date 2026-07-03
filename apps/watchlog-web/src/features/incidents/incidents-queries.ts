import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddIncidentCommentRequest,
  AssignIncidentRequest,
  CancelIncidentActionRequest,
  CancelIncidentRequest,
  CompleteIncidentActionRequest,
  CompleteIncidentInvestigationRequest,
  CreateIncidentActionRequest,
  CreateIncidentRequest,
  IncidentDashboardQuery,
  IncidentListQuery,
  TransitionIncidentRequest,
  UpdateIncidentActionRequest,
  UpdateIncidentRequest,
  UpsertIncidentInvestigationRequest,
  UpsertIncidentTypeRequest,
  UpsertIncidentCategoryRequest,
  UpsertReportingObligationRequest,
  CreateIncidentReportRequest,
  UpdateIncidentReportRequest,
  SubmitIncidentReportRequest,
  MarkIncidentReportNotApplicableRequest,
  CancelIncidentReportRequest,
  VerifyIncidentActionRequest,
} from "@lyra/contracts";
import {
  assignIncident,
  cancelIncident,
  cancelIncidentAction,
  commentIncident,
  completeIncidentAction,
  createIncident,
  createIncidentAction,
  fetchAssignableUsers,
  fetchIncidentActions,
  fetchIncidentEquipmentOptions,
  fetchIncidentCategories,
  fetchCrossDashboard,
  fetchIncidentDashboard,
  fetchIncidentDetail,
  fetchIncidentWorkOrders,
  fetchIncidentStats,
  fetchIncidentTypes,
  fetchIncidents,
  fetchIncidentInvestigation,
  upsertIncidentInvestigation,
  completeIncidentInvestigation,
  reopenIncidentInvestigation,
  transitionIncident,
  updateIncident,
  updateIncidentAction,
  upsertIncidentType,
  upsertIncidentCategory,
  verifyIncidentAction,
  fetchReportingObligations,
  upsertReportingObligation,
  fetchIncidentReports,
  materializeIncidentReports,
  createIncidentReport,
  updateIncidentReport,
  submitIncidentReport,
  markIncidentReportNotApplicable,
  cancelIncidentReport,
} from "./incidents-api.js";
import { useActiveStructureId } from "../structure/structure-queries.js";

export const INCIDENT_KEYS = {
  all: ["incidents"] as const,
  list: (q: IncidentListQuery, structureId: string | null) => ["incidents", "list", q, structureId] as const,
  detail: (id: string) => ["incidents", "detail", id] as const,
  stats: (structureId: string | null) => ["incidents", "stats", structureId] as const,
  types: () => ["incidents", "types"] as const,
  categories: () => ["incidents", "categories"] as const,
  actions: (incidentId: string) => ["incidents", "actions", incidentId] as const,
  investigation: (incidentId: string) => ["incidents", "investigation", incidentId] as const,
  obligations: () => ["incidents", "obligations"] as const,
  reports: (incidentId: string) => ["incidents", "reports", incidentId] as const,
  workOrders: (incidentId: string) => ["incidents", "work-orders", incidentId] as const,
  dashboard: (q: IncidentDashboardQuery, structureId: string | null) => ["incidents", "dashboard", q, structureId] as const,
  crossDashboard: () => ["incidents", "dashboard", "cross"] as const,
};

export function useIncidentDashboard(q: IncidentDashboardQuery) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: INCIDENT_KEYS.dashboard(q, structureId), queryFn: () => fetchIncidentDashboard(q, structureId) });
}

/**
 * Vista ejecutiva cross-estructura (L3). NO depende de la estructura activa (la cruza):
 * por eso su queryKey no lleva `structureId`. El ABAC por nodo lo aplica el backend.
 */
export function useCrossDashboard() {
  return useQuery({ queryKey: INCIDENT_KEYS.crossDashboard(), queryFn: () => fetchCrossDashboard() });
}

export function useIncidents(q: IncidentListQuery) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: INCIDENT_KEYS.list(q, structureId), queryFn: () => fetchIncidents(q, structureId) });
}

export function useIncidentDetail(id: string | null) {
  return useQuery({ queryKey: INCIDENT_KEYS.detail(id ?? ""), queryFn: () => fetchIncidentDetail(id!), enabled: !!id });
}

/** OT relacionadas (vista inversa del enlace Incidencia↔OT, S7b). */
export function useIncidentWorkOrders(id: string | null) {
  return useQuery({ queryKey: INCIDENT_KEYS.workOrders(id ?? ""), queryFn: () => fetchIncidentWorkOrders(id!), enabled: !!id });
}

export function useIncidentStats() {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: INCIDENT_KEYS.stats(structureId), queryFn: () => fetchIncidentStats(structureId) });
}

export function useIncidentTypes() {
  return useQuery({ queryKey: INCIDENT_KEYS.types(), queryFn: () => fetchIncidentTypes() });
}

export function useIncidentCategories() {
  return useQuery({ queryKey: INCIDENT_KEYS.categories(), queryFn: () => fetchIncidentCategories() });
}

/** Variantes para el MANTENEDOR: incluyen inactivos (key distinto, no contamina los desplegables del alta). */
export function useIncidentTypesAdmin() {
  return useQuery({ queryKey: [...INCIDENT_KEYS.types(), "admin"], queryFn: () => fetchIncidentTypes(true) });
}

export function useIncidentCategoriesAdmin() {
  return useQuery({ queryKey: [...INCIDENT_KEYS.categories(), "admin"], queryFn: () => fetchIncidentCategories(true) });
}

export function useUpsertIncidentType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, create }: { dto: UpsertIncidentTypeRequest; create?: boolean }) => upsertIncidentType(dto, create),
    // Invalida tanto el caché admin como el de los desplegables (prefijo ["incidents","types"]).
    onSuccess: () => qc.invalidateQueries({ queryKey: INCIDENT_KEYS.types() }),
  });
}

export function useUpsertIncidentCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, create }: { dto: UpsertIncidentCategoryRequest; create?: boolean }) => upsertIncidentCategory(dto, create),
    onSuccess: () => qc.invalidateQueries({ queryKey: INCIDENT_KEYS.categories() }),
  });
}

export function useAssignableUsers() {
  return useQuery({ queryKey: ["incidents", "users"], queryFn: fetchAssignableUsers });
}

/** Equipos/activos del nodo elegido (para el selector del alta). Solo si hay nodo. */
export function useIncidentEquipmentOptions(nodeId: string | undefined) {
  return useQuery({
    queryKey: ["incidents", "equipment-options", nodeId],
    queryFn: () => fetchIncidentEquipmentOptions(nodeId!),
    enabled: !!nodeId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.all });
}

export function useCreateIncident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: CreateIncidentRequest) => createIncident(dto), onSuccess: () => invalidate(qc) });
}

export function useUpdateIncident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: UpdateIncidentRequest }) => updateIncident(id, dto), onSuccess: () => invalidate(qc) });
}

export function useAssignIncident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: AssignIncidentRequest }) => assignIncident(id, dto), onSuccess: () => invalidate(qc) });
}

export function useCommentIncident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: AddIncidentCommentRequest }) => commentIncident(id, dto), onSuccess: () => invalidate(qc) });
}

export function useTransitionIncident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: TransitionIncidentRequest }) => transitionIncident(id, dto), onSuccess: () => invalidate(qc) });
}

export function useCancelIncident() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: CancelIncidentRequest }) => cancelIncident(id, dto), onSuccess: () => invalidate(qc) });
}

// --- Acciones CAPA (Fase 4.2a) -----------------------------------------------

export function useIncidentActions(incidentId: string | null) {
  return useQuery({
    queryKey: INCIDENT_KEYS.actions(incidentId ?? ""),
    queryFn: () => fetchIncidentActions(incidentId!),
    enabled: !!incidentId,
  });
}

/** Tras mutar una acción: refresca su lista + el detalle (puede cambiar el bloqueo de cierre) + KPIs. */
function invalidateActions(qc: ReturnType<typeof useQueryClient>, incidentId: string): void {
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.actions(incidentId) });
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.detail(incidentId) });
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.all });
}

export function useCreateIncidentAction(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateIncidentActionRequest) => createIncidentAction(incidentId, dto),
    onSuccess: () => invalidateActions(qc, incidentId),
  });
}

export function useUpdateIncidentAction(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, dto }: { actionId: string; dto: UpdateIncidentActionRequest }) => updateIncidentAction(actionId, dto),
    onSuccess: () => invalidateActions(qc, incidentId),
  });
}

export function useCompleteIncidentAction(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, dto }: { actionId: string; dto: CompleteIncidentActionRequest }) => completeIncidentAction(actionId, dto),
    onSuccess: () => invalidateActions(qc, incidentId),
  });
}

export function useVerifyIncidentAction(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, dto }: { actionId: string; dto: VerifyIncidentActionRequest }) => verifyIncidentAction(actionId, dto),
    onSuccess: () => invalidateActions(qc, incidentId),
  });
}

export function useCancelIncidentAction(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ actionId, dto }: { actionId: string; dto: CancelIncidentActionRequest }) => cancelIncidentAction(actionId, dto),
    onSuccess: () => invalidateActions(qc, incidentId),
  });
}

// --- Investigación de causa raíz (Fase 4.2b) ---------------------------------

export function useIncidentInvestigation(incidentId: string | null) {
  return useQuery({
    queryKey: INCIDENT_KEYS.investigation(incidentId ?? ""),
    queryFn: () => fetchIncidentInvestigation(incidentId!),
    enabled: !!incidentId,
  });
}

/** Tras mutar la investigación: refresca su query + el detalle (cambia el bloqueo de cierre) + acciones (label de causa) + KPIs. */
function invalidateInvestigation(qc: ReturnType<typeof useQueryClient>, incidentId: string): void {
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.investigation(incidentId) });
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.detail(incidentId) });
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.actions(incidentId) });
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.all });
}

export function useUpsertIncidentInvestigation(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertIncidentInvestigationRequest) => upsertIncidentInvestigation(incidentId, dto),
    onSuccess: () => invalidateInvestigation(qc, incidentId),
  });
}

export function useCompleteIncidentInvestigation(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CompleteIncidentInvestigationRequest) => completeIncidentInvestigation(incidentId, dto),
    onSuccess: () => invalidateInvestigation(qc, incidentId),
  });
}

export function useReopenIncidentInvestigation(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => reopenIncidentInvestigation(incidentId),
    onSuccess: () => invalidateInvestigation(qc, incidentId),
  });
}

// --- Reportabilidad (Fase 4.3) -----------------------------------------------

/** Catálogo de obligaciones para los desplegables del detalle (solo activas). */
export function useReportingObligations() {
  return useQuery({ queryKey: INCIDENT_KEYS.obligations(), queryFn: () => fetchReportingObligations() });
}

/** Variante para el MANTENEDOR: incluye inactivas (key distinto, no contamina los desplegables). */
export function useReportingObligationsAdmin() {
  return useQuery({ queryKey: [...INCIDENT_KEYS.obligations(), "admin"], queryFn: () => fetchReportingObligations(true) });
}

export function useUpsertReportingObligation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, create }: { dto: UpsertReportingObligationRequest; create?: boolean }) => upsertReportingObligation(dto, create),
    onSuccess: () => qc.invalidateQueries({ queryKey: INCIDENT_KEYS.obligations() }),
  });
}

export function useIncidentReports(incidentId: string | null) {
  return useQuery({
    queryKey: INCIDENT_KEYS.reports(incidentId ?? ""),
    queryFn: () => fetchIncidentReports(incidentId!),
    enabled: !!incidentId,
  });
}

/** Tras mutar un reporte: refresca su lista + el detalle (cambia el bloqueo de cierre) + KPIs/grilla. */
function invalidateReports(qc: ReturnType<typeof useQueryClient>, incidentId: string): void {
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.reports(incidentId) });
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.detail(incidentId) });
  qc.invalidateQueries({ queryKey: INCIDENT_KEYS.all });
}

export function useMaterializeIncidentReports(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => materializeIncidentReports(incidentId), onSuccess: () => invalidateReports(qc, incidentId) });
}

export function useCreateIncidentReport(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateIncidentReportRequest) => createIncidentReport(incidentId, dto),
    onSuccess: () => invalidateReports(qc, incidentId),
  });
}

export function useUpdateIncidentReport(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, dto }: { reportId: string; dto: UpdateIncidentReportRequest }) => updateIncidentReport(reportId, dto),
    onSuccess: () => invalidateReports(qc, incidentId),
  });
}

export function useSubmitIncidentReport(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, dto }: { reportId: string; dto: SubmitIncidentReportRequest }) => submitIncidentReport(reportId, dto),
    onSuccess: () => invalidateReports(qc, incidentId),
  });
}

export function useMarkIncidentReportNotApplicable(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, dto }: { reportId: string; dto: MarkIncidentReportNotApplicableRequest }) => markIncidentReportNotApplicable(reportId, dto),
    onSuccess: () => invalidateReports(qc, incidentId),
  });
}

export function useCancelIncidentReport(incidentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, dto }: { reportId: string; dto: CancelIncidentReportRequest }) => cancelIncidentReport(reportId, dto),
    onSuccess: () => invalidateReports(qc, incidentId),
  });
}
