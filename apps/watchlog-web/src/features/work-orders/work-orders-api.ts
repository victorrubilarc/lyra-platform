import {
  workOrderDetailSchema,
  workOrderListResponseSchema,
  workOrderStatsSchema,
  workOrderTypeSchema,
  workOrderTagSchema,
  type AssignWorkOrderRequest,
  type CancelWorkOrderRequest,
  type CreateWorkOrderRequest,
  type SpecialtyDto,
  type TransitionWorkOrderRequest,
  type UpdateWorkOrderRequest,
  type UpsertSpecialtyRequest,
  type UpsertWorkOrderTypeRequest,
  type WorkOrderDetail,
  type WorkOrderListQuery,
  type WorkOrderListResponse,
  type WorkOrderStats,
  type WorkOrderTypeDto,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson } from "../../lib/api-client.js";

function queryString(q: WorkOrderListQuery): string {
  const p = new URLSearchParams();
  if (q.search) p.set("search", q.search);
  if (q.lifecycle) p.set("lifecycle", q.lifecycle);
  if (q.typeId) p.set("typeId", q.typeId);
  if (q.criticality) p.set("criticality", String(q.criticality));
  if (q.priority) p.set("priority", q.priority);
  if (q.originType) p.set("originType", q.originType);
  if (q.orgNodeIds && q.orgNodeIds.length) p.set("orgNodeIds", q.orgNodeIds.join(","));
  if (q.equipmentId) p.set("equipmentId", q.equipmentId);
  if (q.ownerId) p.set("ownerId", q.ownerId);
  if (q.specialtyId) p.set("specialtyId", q.specialtyId);
  if (q.requiresPtw) p.set("requiresPtw", "true");
  if (q.mine) p.set("mine", "true");
  if (q.unassignedOnly) p.set("unassignedOnly", "true");
  if (q.sort) p.set("sort", q.sort);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Anexa `&structureId=` (aislamiento L1b) a un querystring ya armado. */
function withStructure(qs: string, structureId?: string | null): string {
  if (!structureId) return qs;
  return qs ? `${qs}&structureId=${encodeURIComponent(structureId)}` : `?structureId=${encodeURIComponent(structureId)}`;
}

export function fetchWorkOrders(q: WorkOrderListQuery, structureId?: string | null): Promise<WorkOrderListResponse> {
  return apiJson(`/work-orders${withStructure(queryString(q), structureId)}`, workOrderListResponseSchema);
}

export function fetchWorkOrderDetail(id: string): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}`, workOrderDetailSchema);
}

export function fetchWorkOrderStats(structureId?: string | null): Promise<WorkOrderStats> {
  return apiJson(`/work-orders/stats${withStructure("", structureId)}`, workOrderStatsSchema);
}

export function fetchWorkOrderTypes(includeInactive = false): Promise<WorkOrderTypeDto[]> {
  return apiJson(`/work-orders/types${includeInactive ? "?includeInactive=true" : ""}`, z.array(workOrderTypeSchema));
}

export function fetchWorkOrderSpecialties(includeInactive = false): Promise<SpecialtyDto[]> {
  return apiJson(`/work-orders/specialties${includeInactive ? "?includeInactive=true" : ""}`, z.array(workOrderTagSchema));
}

export function upsertWorkOrderType(dto: UpsertWorkOrderTypeRequest, create = false): Promise<WorkOrderTypeDto> {
  return apiJson(`/work-orders/types${create ? "?create=true" : ""}`, workOrderTypeSchema, { method: "POST", body: dto });
}

export function upsertWorkOrderSpecialty(dto: UpsertSpecialtyRequest, create = false): Promise<SpecialtyDto> {
  return apiJson(`/work-orders/specialties${create ? "?create=true" : ""}`, workOrderTagSchema, { method: "POST", body: dto });
}

const userOptionSchema = z.object({ id: z.string(), name: z.string() });
export type WorkOrderUserOption = z.infer<typeof userOptionSchema>;

export function fetchWorkOrderAssignableUsers(): Promise<WorkOrderUserOption[]> {
  return apiJson("/work-orders/users", z.array(userOptionSchema));
}

const equipmentOptionSchema = z.object({ id: z.string(), name: z.string(), tag: z.string().nullable() });
export type WorkOrderEquipmentOption = z.infer<typeof equipmentOptionSchema>;

export function fetchWorkOrderEquipmentOptions(nodeId: string): Promise<WorkOrderEquipmentOption[]> {
  return apiJson(`/work-orders/equipment-options?nodeId=${encodeURIComponent(nodeId)}`, z.array(equipmentOptionSchema));
}

export function createWorkOrder(dto: CreateWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson("/work-orders", workOrderDetailSchema, { method: "POST", body: dto });
}

export function updateWorkOrder(id: string, dto: UpdateWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}`, workOrderDetailSchema, { method: "PATCH", body: dto });
}

export function assignWorkOrder(id: string, dto: AssignWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}/assign`, workOrderDetailSchema, { method: "POST", body: dto });
}

export function cancelWorkOrder(id: string, dto: CancelWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}/cancel`, workOrderDetailSchema, { method: "POST", body: dto });
}

/** Ejecuta una transición del flujo (Puerta 1: enviar / aprobar [firma] / rechazar). */
export function transitionWorkOrder(id: string, dto: TransitionWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}/transitions`, workOrderDetailSchema, { method: "POST", body: dto });
}
