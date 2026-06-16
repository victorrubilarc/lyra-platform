import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddIncidentCommentRequest,
  AssignIncidentRequest,
  CancelIncidentRequest,
  CreateIncidentRequest,
  IncidentListQuery,
  TransitionIncidentRequest,
  UpdateIncidentRequest,
} from "@lyra/contracts";
import {
  assignIncident,
  cancelIncident,
  commentIncident,
  createIncident,
  fetchAssignableUsers,
  fetchIncidentCategories,
  fetchIncidentDetail,
  fetchIncidentStats,
  fetchIncidentTypes,
  fetchIncidents,
  transitionIncident,
  updateIncident,
} from "./incidents-api.js";

export const INCIDENT_KEYS = {
  all: ["incidents"] as const,
  list: (q: IncidentListQuery) => ["incidents", "list", q] as const,
  detail: (id: string) => ["incidents", "detail", id] as const,
  stats: () => ["incidents", "stats"] as const,
  types: () => ["incidents", "types"] as const,
  categories: () => ["incidents", "categories"] as const,
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
  return useQuery({ queryKey: INCIDENT_KEYS.types(), queryFn: fetchIncidentTypes });
}

export function useIncidentCategories() {
  return useQuery({ queryKey: INCIDENT_KEYS.categories(), queryFn: fetchIncidentCategories });
}

export function useAssignableUsers() {
  return useQuery({ queryKey: ["incidents", "users"], queryFn: fetchAssignableUsers });
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
