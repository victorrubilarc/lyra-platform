import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignWorkOrderRequest,
  CancelWorkOrderRequest,
  CreateWorkOrderRequest,
  TransitionWorkOrderRequest,
  UpdateWorkOrderRequest,
  UpsertSpecialtyRequest,
  UpsertWorkOrderTypeRequest,
  WorkOrderListQuery,
} from "@lyra/contracts";
import {
  assignWorkOrder,
  cancelWorkOrder,
  createWorkOrder,
  fetchWorkOrderAssignableUsers,
  fetchWorkOrderDetail,
  fetchWorkOrderEquipmentOptions,
  fetchWorkOrderSpecialties,
  fetchWorkOrderStats,
  fetchWorkOrderTypes,
  fetchWorkOrders,
  transitionWorkOrder,
  updateWorkOrder,
  upsertWorkOrderSpecialty,
  upsertWorkOrderType,
} from "./work-orders-api.js";
import { useActiveStructureId } from "../structure/structure-queries.js";

export const WORK_ORDER_KEYS = {
  all: ["work-orders"] as const,
  list: (q: WorkOrderListQuery, structureId: string | null) => ["work-orders", "list", q, structureId] as const,
  detail: (id: string) => ["work-orders", "detail", id] as const,
  stats: (structureId: string | null) => ["work-orders", "stats", structureId] as const,
  types: () => ["work-orders", "types"] as const,
  specialties: () => ["work-orders", "specialties"] as const,
};

export function useWorkOrders(q: WorkOrderListQuery) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: WORK_ORDER_KEYS.list(q, structureId), queryFn: () => fetchWorkOrders(q, structureId) });
}

export function useWorkOrderDetail(id: string | null) {
  return useQuery({ queryKey: WORK_ORDER_KEYS.detail(id ?? ""), queryFn: () => fetchWorkOrderDetail(id!), enabled: !!id });
}

export function useWorkOrderStats() {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: WORK_ORDER_KEYS.stats(structureId), queryFn: () => fetchWorkOrderStats(structureId) });
}

export function useWorkOrderTypes() {
  return useQuery({ queryKey: WORK_ORDER_KEYS.types(), queryFn: () => fetchWorkOrderTypes() });
}

export function useWorkOrderSpecialties() {
  return useQuery({ queryKey: WORK_ORDER_KEYS.specialties(), queryFn: () => fetchWorkOrderSpecialties() });
}

/** Variantes para el MANTENEDOR: incluyen inactivos (key distinto, no contamina los desplegables del alta). */
export function useWorkOrderTypesAdmin() {
  return useQuery({ queryKey: [...WORK_ORDER_KEYS.types(), "admin"], queryFn: () => fetchWorkOrderTypes(true) });
}

export function useWorkOrderSpecialtiesAdmin() {
  return useQuery({ queryKey: [...WORK_ORDER_KEYS.specialties(), "admin"], queryFn: () => fetchWorkOrderSpecialties(true) });
}

export function useUpsertWorkOrderType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, create }: { dto: UpsertWorkOrderTypeRequest; create?: boolean }) => upsertWorkOrderType(dto, create),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.types() }),
  });
}

export function useUpsertWorkOrderSpecialty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, create }: { dto: UpsertSpecialtyRequest; create?: boolean }) => upsertWorkOrderSpecialty(dto, create),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.specialties() }),
  });
}

export function useWorkOrderAssignableUsers() {
  return useQuery({ queryKey: ["work-orders", "users"], queryFn: fetchWorkOrderAssignableUsers });
}

export function useWorkOrderEquipmentOptions(nodeId: string | undefined) {
  return useQuery({
    queryKey: ["work-orders", "equipment-options", nodeId],
    queryFn: () => fetchWorkOrderEquipmentOptions(nodeId!),
    enabled: !!nodeId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.all });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: CreateWorkOrderRequest) => createWorkOrder(dto), onSuccess: () => invalidate(qc) });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: UpdateWorkOrderRequest }) => updateWorkOrder(id, dto), onSuccess: () => invalidate(qc) });
}

export function useAssignWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: AssignWorkOrderRequest }) => assignWorkOrder(id, dto), onSuccess: () => invalidate(qc) });
}

export function useCancelWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: CancelWorkOrderRequest }) => cancelWorkOrder(id, dto), onSuccess: () => invalidate(qc) });
}

export function useTransitionWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: TransitionWorkOrderRequest }) => transitionWorkOrder(id, dto), onSuccess: () => invalidate(qc) });
}
