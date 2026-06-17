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
  IncidentListQuery,
  TransitionIncidentRequest,
  UpdateIncidentActionRequest,
  UpdateIncidentRequest,
  UpsertIncidentInvestigationRequest,
  UpsertIncidentTypeRequest,
  UpsertIncidentCategoryRequest,
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
  fetchIncidentDetail,
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
} from "./incidents-api.js";

export const INCIDENT_KEYS = {
  all: ["incidents"] as const,
  list: (q: IncidentListQuery) => ["incidents", "list", q] as const,
  detail: (id: string) => ["incidents", "detail", id] as const,
  stats: () => ["incidents", "stats"] as const,
  types: () => ["incidents", "types"] as const,
  categories: () => ["incidents", "categories"] as const,
  actions: (incidentId: string) => ["incidents", "actions", incidentId] as const,
  investigation: (incidentId: string) => ["incidents", "investigation", incidentId] as const,
};

export function useIncidents(q: IncidentListQuery) {
  return useQuery({ queryKey: INCIDENT_KEYS.list(q), queryFn: () => fetchIncidents(q) });
}

export function useIncidentDetail(id: string | null) {
  return useQuery({ queryKey: INCIDENT_KEYS.detail(id ?? ""), queryFn: () => fetchIncidentDetail(id!), enabled: !!id });
}

export function useIncidentStats() {
  return useQuery({ queryKey: INCIDENT_KEYS.stats(), queryFn: fetchIncidentStats });
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
