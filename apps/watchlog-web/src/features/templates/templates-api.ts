import {
  createTemplateRequestSchema,
  publishTemplateRequestSchema,
  saveTemplateDraftRequestSchema,
  templateDetailSchema,
  templateListItemSchema,
  updateTemplateRequestSchema,
  type CreateTemplateRequest,
  type PublishTemplateRequest,
  type SaveTemplateDraftRequest,
  type TemplateDetail,
  type TemplateListItem,
  type TemplateListQuery,
  type UpdateTemplateRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

export function fetchTemplates(query: TemplateListQuery = {}): Promise<TemplateListItem[]> {
  const params = new URLSearchParams();
  if (query.search) params.set("search", query.search);
  if (query.status) params.set("status", query.status);
  if (query.orgNodeId) params.set("orgNodeId", query.orgNodeId);
  const qs = params.toString();
  return apiJson(`/templates${qs ? `?${qs}` : ""}`, z.array(templateListItemSchema));
}

export function fetchTemplate(id: string, versionId?: string): Promise<TemplateDetail> {
  const qs = versionId ? `?versionId=${encodeURIComponent(versionId)}` : "";
  return apiJson(`/templates/${id}${qs}`, templateDetailSchema);
}

export function createTemplate(dto: CreateTemplateRequest): Promise<TemplateDetail> {
  createTemplateRequestSchema.parse(dto);
  return apiJson("/templates", templateDetailSchema, { method: "POST", body: dto });
}

export function updateTemplate(id: string, dto: UpdateTemplateRequest): Promise<TemplateDetail> {
  updateTemplateRequestSchema.parse(dto);
  return apiJson(`/templates/${id}`, templateDetailSchema, { method: "PATCH", body: dto });
}

export function saveTemplateDraft(id: string, dto: SaveTemplateDraftRequest): Promise<TemplateDetail> {
  saveTemplateDraftRequestSchema.parse(dto);
  return apiJson(`/templates/${id}/draft`, templateDetailSchema, { method: "PUT", body: dto });
}

export function publishTemplate(id: string, dto: PublishTemplateRequest = {}): Promise<TemplateDetail> {
  publishTemplateRequestSchema.parse(dto);
  return apiJson(`/templates/${id}/publish`, templateDetailSchema, { method: "POST", body: dto });
}

export function deleteTemplate(id: string): Promise<void> {
  return apiVoid(`/templates/${id}`, { method: "DELETE" });
}
