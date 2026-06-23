import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateOrgLevelRequest,
  CreateOrgNodeRequest,
  CreateOrgStructureRequest,
  UpdateOrgLevelRequest,
  UpdateOrgNodeRequest,
  UpdateOrgStructureRequest,
} from "@lyra/contracts";
import { useStructureStore } from "../../shell/structure-store.js";
import {
  createLevel,
  createNode,
  createStructure,
  deleteLevel,
  deleteNode,
  deleteStructure,
  fetchLevels,
  fetchStructures,
  fetchTree,
  updateLevel,
  updateNode,
  updateStructure,
} from "./structure-api.js";

export const QUERY_KEYS = {
  structures: ["structure", "structures"] as const,
  // Árbol y niveles dependen de la estructura activa: el id entra en la clave para
  // que cambiar de estructura refresque TODO lo que cuelga de ellos (pickers incluidos).
  levels: (structureId: string | null) => ["structure", "levels", structureId] as const,
  tree: (structureId: string | null) => ["structure", "tree", structureId] as const,
};

/** Id de la estructura activa del shell (null = la por defecto del backend). */
export function useActiveStructureId(): string | null {
  return useStructureStore((s) => s.activeStructureId);
}

// ─── Queries ───────────────────────────────────────────────────────────────

/** Estructuras accesibles (para el selector y el mantenedor). */
export function useOrgStructures() {
  return useQuery({ queryKey: QUERY_KEYS.structures, queryFn: fetchStructures });
}

export function useOrgLevels() {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: QUERY_KEYS.levels(structureId), queryFn: () => fetchLevels(structureId) });
}

export function useOrgTree() {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: QUERY_KEYS.tree(structureId), queryFn: () => fetchTree(structureId) });
}

// ─── Mutations — estructuras ───────────────────────────────────────────────

export function useCreateStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateOrgStructureRequest) => createStructure(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.structures }),
  });
}

export function useUpdateStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateOrgStructureRequest }) => updateStructure(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.structures }),
  });
}

export function useDeleteStructure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteStructure(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUERY_KEYS.structures }),
  });
}

// ─── Mutations — niveles ───────────────────────────────────────────────────
// La estructura activa decide DÓNDE caen los niveles/nodos raíz nuevos. Las
// invalidaciones usan el prefijo ["structure", …] para refrescar todas las variantes.

export function useCreateLevel() {
  const qc = useQueryClient();
  const structureId = useActiveStructureId();
  return useMutation({
    mutationFn: (dto: CreateOrgLevelRequest) => createLevel({ structureId: structureId ?? undefined, ...dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["structure", "levels"] }),
  });
}

export function useUpdateLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateOrgLevelRequest }) => updateLevel(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["structure", "levels"] }),
  });
}

export function useDeleteLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLevel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["structure", "levels"] }),
  });
}

// ─── Mutations — nodos ─────────────────────────────────────────────────────

export function useCreateNode() {
  const qc = useQueryClient();
  const structureId = useActiveStructureId();
  return useMutation({
    // structureId solo aplica a raíces (sin parentId); los hijos heredan del padre.
    mutationFn: (dto: CreateOrgNodeRequest) => createNode({ structureId: structureId ?? undefined, ...dto }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["structure", "tree"] }),
  });
}

export function useUpdateNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateOrgNodeRequest }) => updateNode(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["structure", "tree"] }),
  });
}

export function useDeleteNode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNode(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["structure", "tree"] }),
  });
}
