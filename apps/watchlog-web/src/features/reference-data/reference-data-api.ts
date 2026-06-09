import {
  createReferenceItemRequestSchema,
  createReferenceListRequestSchema,
  referenceItemSchema,
  referenceListDetailSchema,
  referenceListSchema,
  resolvedOptionSchema,
  updateReferenceItemRequestSchema,
  updateReferenceListRequestSchema,
  type CreateReferenceItemRequest,
  type CreateReferenceListRequest,
  type ReferenceItem,
  type ReferenceList,
  type ReferenceListDetail,
  type ResolvedOption,
  type UpdateReferenceItemRequest,
  type UpdateReferenceListRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

export function fetchReferenceLists(): Promise<ReferenceList[]> {
  return apiJson("/reference-lists", z.array(referenceListSchema));
}

export function fetchReferenceList(id: string): Promise<ReferenceListDetail> {
  return apiJson(`/reference-lists/${id}`, referenceListDetailSchema);
}

export function resolveReferenceList(idOrKey: string): Promise<ResolvedOption[]> {
  return apiJson(`/reference-lists/${encodeURIComponent(idOrKey)}/resolve`, z.array(resolvedOptionSchema));
}

export function createReferenceList(dto: CreateReferenceListRequest): Promise<ReferenceListDetail> {
  createReferenceListRequestSchema.parse(dto);
  return apiJson("/reference-lists", referenceListDetailSchema, { method: "POST", body: dto });
}

export function updateReferenceList(id: string, dto: UpdateReferenceListRequest): Promise<ReferenceListDetail> {
  updateReferenceListRequestSchema.parse(dto);
  return apiJson(`/reference-lists/${id}`, referenceListDetailSchema, { method: "PATCH", body: dto });
}

export function deleteReferenceList(id: string): Promise<void> {
  return apiVoid(`/reference-lists/${id}`, { method: "DELETE" });
}

export function createReferenceItem(listId: string, dto: CreateReferenceItemRequest): Promise<ReferenceItem> {
  createReferenceItemRequestSchema.parse(dto);
  return apiJson(`/reference-lists/${listId}/items`, referenceItemSchema, { method: "POST", body: dto });
}

export function updateReferenceItem(
  listId: string,
  itemId: string,
  dto: UpdateReferenceItemRequest,
): Promise<ReferenceItem> {
  updateReferenceItemRequestSchema.parse(dto);
  return apiJson(`/reference-lists/${listId}/items/${itemId}`, referenceItemSchema, { method: "PATCH", body: dto });
}

export function deleteReferenceItem(listId: string, itemId: string): Promise<void> {
  return apiVoid(`/reference-lists/${listId}/items/${itemId}`, { method: "DELETE" });
}
