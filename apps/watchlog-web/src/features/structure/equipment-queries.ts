import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateEquipmentCategoryRequest,
  CreateEquipmentRequest,
  UpdateEquipmentCategoryRequest,
  UpdateEquipmentRequest,
} from "@lyra/contracts";
import {
  createCategory,
  createEquipment,
  deleteCategory,
  deleteEquipment,
  fetchCategories,
  fetchEquipmentByNode,
  updateCategory,
  updateEquipment,
} from "./equipment-api.js";

export const EQUIPMENT_KEYS = {
  categories: ["equipment", "categories"] as const,
  byNode: (orgNodeId: string) => ["equipment", "byNode", orgNodeId] as const,
};

// ─── Categorías ──────────────────────────────────────────────────────────────

export function useEquipmentCategories() {
  return useQuery({ queryKey: EQUIPMENT_KEYS.categories, queryFn: fetchCategories });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateEquipmentCategoryRequest) => createCategory(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEYS.categories }),
  });
}

export function useUpdateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateEquipmentCategoryRequest }) => updateCategory(id, dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEYS.categories }),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: EQUIPMENT_KEYS.categories }),
  });
}

// ─── Equipos ─────────────────────────────────────────────────────────────────

export function useEquipmentByNode(orgNodeId: string | null) {
  return useQuery({
    queryKey: EQUIPMENT_KEYS.byNode(orgNodeId ?? ""),
    queryFn: () => fetchEquipmentByNode(orgNodeId!),
    enabled: !!orgNodeId,
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateEquipmentRequest) => createEquipment(dto),
    onSuccess: (eq) => qc.invalidateQueries({ queryKey: EQUIPMENT_KEYS.byNode(eq.orgNodeId) }),
  });
}

export function useUpdateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateEquipmentRequest }) => updateEquipment(id, dto),
    // Invalida todos los listados por nodo (el equipo pudo cambiar de nodo).
    onSuccess: () => qc.invalidateQueries({ queryKey: ["equipment", "byNode"] }),
  });
}

export function useDeleteEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; orgNodeId: string }) => deleteEquipment(id),
    onSuccess: (_data, { orgNodeId }) =>
      qc.invalidateQueries({ queryKey: EQUIPMENT_KEYS.byNode(orgNodeId) }),
  });
}
