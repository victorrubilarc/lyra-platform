import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateWorkflowRequest,
  PublishWorkflowRequest,
  SaveWorkflowDraftRequest,
  UpdateWorkflowRequest,
  WorkflowListQuery,
} from "@lyra/contracts";
import {
  createWorkflow,
  deleteWorkflow,
  fetchWorkflow,
  fetchWorkflows,
  publishWorkflow,
  saveWorkflowDraft,
  updateWorkflow,
} from "./workflows-api.js";

export const WORKFLOW_KEYS = {
  all: ["workflows"] as const,
  list: (query: WorkflowListQuery) => ["workflows", "list", query] as const,
  detail: (id: string) => ["workflows", "detail", id] as const,
};

export function useWorkflows(query: WorkflowListQuery) {
  return useQuery({ queryKey: WORKFLOW_KEYS.list(query), queryFn: () => fetchWorkflows(query) });
}

export function useWorkflow(id: string | null) {
  return useQuery({
    queryKey: WORKFLOW_KEYS.detail(id ?? ""),
    queryFn: () => fetchWorkflow(id!),
    enabled: !!id,
  });
}

export function useCreateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateWorkflowRequest) => createWorkflow(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKFLOW_KEYS.all }),
  });
}

export function useUpdateWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateWorkflowRequest }) => updateWorkflow(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: WORKFLOW_KEYS.all });
      qc.setQueryData(WORKFLOW_KEYS.detail(data.id), data);
    },
  });
}

export function useSaveWorkflowDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: SaveWorkflowDraftRequest }) => saveWorkflowDraft(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: WORKFLOW_KEYS.all });
      qc.setQueryData(WORKFLOW_KEYS.detail(data.id), data);
    },
  });
}

export function usePublishWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto?: PublishWorkflowRequest }) => publishWorkflow(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: WORKFLOW_KEYS.all });
      qc.setQueryData(WORKFLOW_KEYS.detail(data.id), data);
    },
  });
}

export function useDeleteWorkflow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORKFLOW_KEYS.all }),
  });
}
