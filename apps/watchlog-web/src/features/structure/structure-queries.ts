import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateOrgLevelRequest, CreateOrgNodeRequest, UpdateOrgLevelRequest, UpdateOrgNodeRequest } from "@lyra/contracts";
import {
  createLevel,
  createNode,
  deleteLevel,
  deleteNode,
  fetchLevels,
  fetchTree,
  updateLevel,
  updateNode,
} from "./structure-api.js";

export const QUERY_KEYS = {
  levels: ["structure", "levels"] as const,
  tree: ["structure", "tree"] as const,
};

// ─── Queries ───────────────────────────────────────────────────────────────

export function useOrgLevels() {
  return useQuery({ queryKey: QUERY_KEYS.levels, queryFn: fetchLevels });
}

export function useOrgTree() {
  return useQuery({ queryKey: QUERY_KEYS.tree, queryFn: fetchTree });
}

// ─── Mutations — niveles ───────────────────────────────────────────────────

export function useCreateLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateOrgLevelRequest) => createLevel(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.levels }),
  });
}

export function useUpdateLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateOrgLevelRequest }) => updateLevel(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.levels }),
  });
}

export function useDeleteLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLevel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.levels }),
  });
}

// ─── Mutations — nodos ─────────────────────────────────────────────────────

export function useCreateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateOrgNodeRequest) => createNode(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.tree }),
  });
}

export function useUpdateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateOrgNodeRequest }) => updateNode(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.tree }),
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNode(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.tree }),
  });
}
