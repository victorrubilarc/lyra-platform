import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateReferenceItemRequest,
  CreateReferenceListRequest,
  UpdateReferenceItemRequest,
  UpdateReferenceListRequest,
} from "@lyra/contracts";
import {
  createReferenceItem,
  createReferenceList,
  deleteReferenceItem,
  deleteReferenceList,
  fetchReferenceList,
  fetchReferenceLists,
  resolveReferenceList,
  updateReferenceItem,
  updateReferenceList,
} from "./reference-data-api.js";

export const REFERENCE_KEYS = {
  all: ["reference-lists"] as const,
  list: () => ["reference-lists", "list"] as const,
  detail: (id: string) => ["reference-lists", "detail", id] as const,
  resolve: (idOrKey: string) => ["reference-lists", "resolve", idOrKey] as const,
};

export function useReferenceLists() {
  return useQuery({ queryKey: REFERENCE_KEYS.list(), queryFn: fetchReferenceLists });
}

export function useReferenceList(id: string | null) {
  return useQuery({
    queryKey: REFERENCE_KEYS.detail(id ?? ""),
    queryFn: () => fetchReferenceList(id!),
    enabled: !!id,
  });
}

/** Resuelve los ítems activos de una lista (por id o key). Para el Form Builder. */
export function useResolvedReferenceList(idOrKey: string | null) {
  return useQuery({
    queryKey: REFERENCE_KEYS.resolve(idOrKey ?? ""),
    queryFn: () => resolveReferenceList(idOrKey!),
    enabled: !!idOrKey,
  });
}

export function useCreateReferenceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateReferenceListRequest) => createReferenceList(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: REFERENCE_KEYS.all }),
  });
}

export function useUpdateReferenceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateReferenceListRequest }) => updateReferenceList(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: REFERENCE_KEYS.all });
      qc.setQueryData(REFERENCE_KEYS.detail(data.id), data);
    },
  });
}

export function useDeleteReferenceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteReferenceList(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: REFERENCE_KEYS.all }),
  });
}

export function useCreateReferenceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, dto }: { listId: string; dto: CreateReferenceItemRequest }) =>
      createReferenceItem(listId, dto),
    onSuccess: (_data, { listId }) => {
      qc.invalidateQueries({ queryKey: REFERENCE_KEYS.detail(listId) });
      qc.invalidateQueries({ queryKey: REFERENCE_KEYS.list() });
    },
  });
}

export function useUpdateReferenceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, itemId, dto }: { listId: string; itemId: string; dto: UpdateReferenceItemRequest }) =>
      updateReferenceItem(listId, itemId, dto),
    onSuccess: (_data, { listId }) => {
      qc.invalidateQueries({ queryKey: REFERENCE_KEYS.detail(listId) });
    },
  });
}

export function useDeleteReferenceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listId, itemId }: { listId: string; itemId: string }) => deleteReferenceItem(listId, itemId),
    onSuccess: (_data, { listId }) => {
      qc.invalidateQueries({ queryKey: REFERENCE_KEYS.detail(listId) });
      qc.invalidateQueries({ queryKey: REFERENCE_KEYS.list() });
    },
  });
}
