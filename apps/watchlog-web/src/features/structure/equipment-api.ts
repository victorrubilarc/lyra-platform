import {
  createEquipmentCategoryRequestSchema,
  createEquipmentRequestSchema,
  equipmentCategorySchema,
  equipmentSchema,
  updateEquipmentCategoryRequestSchema,
  updateEquipmentRequestSchema,
  type CreateEquipmentCategoryRequest,
  type CreateEquipmentRequest,
  type Equipment,
  type EquipmentCategory,
  type UpdateEquipmentCategoryRequest,
  type UpdateEquipmentRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

// --- Categorías ---

export function fetchCategories(): Promise<EquipmentCategory[]> {
  return apiJson("/structure/equipment/categories", z.array(equipmentCategorySchema));
}

export function createCategory(dto: CreateEquipmentCategoryRequest): Promise<EquipmentCategory> {
  createEquipmentCategoryRequestSchema.parse(dto);
  return apiJson("/structure/equipment/categories", equipmentCategorySchema, { method: "POST", body: dto });
}

export function updateCategory(id: string, dto: UpdateEquipmentCategoryRequest): Promise<EquipmentCategory> {
  updateEquipmentCategoryRequestSchema.parse(dto);
  return apiJson(`/structure/equipment/categories/${id}`, equipmentCategorySchema, { method: "PATCH", body: dto });
}

export function deleteCategory(id: string): Promise<void> {
  return apiVoid(`/structure/equipment/categories/${id}`, { method: "DELETE" });
}

// --- Equipos ---

export function fetchEquipmentByNode(orgNodeId: string): Promise<Equipment[]> {
  return apiJson(
    `/structure/equipment?orgNodeId=${encodeURIComponent(orgNodeId)}`,
    z.array(equipmentSchema),
  );
}

/** Busca equipos por nombre/tag/código en toda la estructura accesible (ABAC). */
export function searchEquipment(term: string): Promise<Equipment[]> {
  return apiJson(
    `/structure/equipment?search=${encodeURIComponent(term)}`,
    z.array(equipmentSchema),
  );
}

export function createEquipment(dto: CreateEquipmentRequest): Promise<Equipment> {
  createEquipmentRequestSchema.parse(dto);
  return apiJson("/structure/equipment", equipmentSchema, { method: "POST", body: dto });
}

export function updateEquipment(id: string, dto: UpdateEquipmentRequest): Promise<Equipment> {
  updateEquipmentRequestSchema.parse(dto);
  return apiJson(`/structure/equipment/${id}`, equipmentSchema, { method: "PATCH", body: dto });
}

export function deleteEquipment(id: string): Promise<void> {
  return apiVoid(`/structure/equipment/${id}`, { method: "DELETE" });
}
