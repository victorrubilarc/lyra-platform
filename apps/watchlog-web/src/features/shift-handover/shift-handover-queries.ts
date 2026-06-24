import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcknowledgeHandoverRequest,
  AddHandoverItemRequest,
  CancelHandoverRequest,
  CompileHandoverRequest,
  ShiftHandoverListQuery,
  SignOutHandoverRequest,
  UpdateHandoverItemRequest,
  UpdateHandoverSummaryRequest,
} from "@lyra/contracts";
import {
  acknowledgeHandover,
  addHandoverItem,
  cancelHandover,
  compileHandover,
  fetchHandoverDetail,
  fetchHandovers,
  signOutHandover,
  updateHandoverItem,
  updateHandoverSummary,
} from "./shift-handover-api.js";
import { useActiveStructureId } from "../structure/structure-queries.js";

const KEY = ["shift-handover"] as const;

export function useHandovers(q: ShiftHandoverListQuery) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: [...KEY, "list", q, structureId], queryFn: () => fetchHandovers(q, structureId) });
}

export function useHandoverDetail(id: string | null) {
  return useQuery({
    queryKey: [...KEY, "detail", id],
    queryFn: () => fetchHandoverDetail(id!),
    enabled: !!id,
    // Si falla (permiso, red, deep link), no reintentar en bucle: que el error se muestre rápido.
    retry: 1,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: KEY });
}

export function useCompileHandover() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (dto: CompileHandoverRequest) => compileHandover(dto), onSuccess: invalidate });
}

export function useUpdateHandoverSummary(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (dto: UpdateHandoverSummaryRequest) => updateHandoverSummary(id, dto), onSuccess: invalidate });
}

export function useAddHandoverItem(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (dto: AddHandoverItemRequest) => addHandoverItem(id, dto), onSuccess: invalidate });
}

export function useUpdateHandoverItem(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ itemId, dto }: { itemId: string; dto: UpdateHandoverItemRequest }) => updateHandoverItem(id, itemId, dto),
    onSuccess: invalidate,
  });
}

export function useSignOutHandover(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (dto: SignOutHandoverRequest) => signOutHandover(id, dto), onSuccess: invalidate });
}

export function useAcknowledgeHandover(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (dto: AcknowledgeHandoverRequest) => acknowledgeHandover(id, dto), onSuccess: invalidate });
}

export function useCancelHandover(id: string) {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (dto: CancelHandoverRequest) => cancelHandover(id, dto), onSuccess: invalidate });
}
