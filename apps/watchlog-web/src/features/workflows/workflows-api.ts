import {
  createWorkflowRequestSchema,
  publishWorkflowRequestSchema,
  saveWorkflowDraftRequestSchema,
  updateWorkflowRequestSchema,
  workflowDetailSchema,
  workflowListItemSchema,
  type CreateWorkflowRequest,
  type PublishWorkflowRequest,
  type SaveWorkflowDraftRequest,
  type UpdateWorkflowRequest,
  type WorkflowDetail,
  type WorkflowListItem,
  type WorkflowListQuery,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

export function fetchWorkflows(query: WorkflowListQuery = {}): Promise<WorkflowListItem[]> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  const qs = params.toString();
  return apiJson(`/workflows${qs ? `?${qs}` : ""}`, z.array(workflowListItemSchema));
}

export function fetchWorkflow(id: string, versionId?: string): Promise<WorkflowDetail> {
  const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return apiJson(`/workflows/${id}${qs}`, workflowDetailSchema);
}

export function createWorkflow(dto: CreateWorkflowRequest): Promise<WorkflowDetail> {
  createWorkflowRequestSchema.parse(dto);
  return apiJson("/workflows", workflowDetailSchema, { method: "POST", body: dto });
}

export function updateWorkflow(id: string, dto: UpdateWorkflowRequest): Promise<WorkflowDetail> {
  updateWorkflowRequestSchema.parse(dto);
  return apiJson(`/workflows/${id}`, workflowDetailSchema, { method: "PATCH", body: dto });
}

export function saveWorkflowDraft(id: string, dto: SaveWorkflowDraftRequest): Promise<WorkflowDetail> {
  saveWorkflowDraftRequestSchema.parse(dto);
  return apiJson(`/workflows/${id}/draft`, workflowDetailSchema, { method: "PUT", body: dto });
}

export function publishWorkflow(id: string, dto: PublishWorkflowRequest = {}): Promise<WorkflowDetail> {
  publishWorkflowRequestSchema.parse(dto);
  return apiJson(`/workflows/${id}/publish`, workflowDetailSchema, { method: "POST", body: dto });
}

export function deleteWorkflow(id: string): Promise<void> {
  return apiVoid(`/workflows/${id}`, { method: "DELETE" });
}
