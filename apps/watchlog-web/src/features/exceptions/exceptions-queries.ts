import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AcknowledgeExceptionRequest,
  AssociateExceptionRequest,
  ConvertExceptionRequest,
  CorrectExceptionRequest,
  CreateManualExceptionRequest,
  DismissExceptionRequest,
  ExceptionListQuery,
} from "@lyra/contracts";
import {
  acknowledgeException,
  associateException,
  convertException,
  correctException,
  createManualException,
  dismissException,
  fetchDedupeSuggestions,
  fetchExceptionDetail,
  fetchExceptionSummary,
  fetchExceptions,
} from "./exceptions-api.js";

export const EXCEPTION_KEYS = {
  all: ["exceptions"] as const,
  list: (q: ExceptionListQuery) => ["exceptions", "list", q] as const,
  detail: (id: string) => ["exceptions", "detail", id] as const,
  summary: (logEntryId: string) => ["exceptions", "summary", logEntryId] as const,
  dedupe: (id: string) => ["exceptions", "dedupe", id] as const,
};

export function useExceptions(q: ExceptionListQuery, enabled = true) {
  return useQuery({ queryKey: EXCEPTION_KEYS.list(q), queryFn: () => fetchExceptions(q), enabled });
}

export function useExceptionSummary(logEntryId: string | null) {
  return useQuery({
    queryKey: EXCEPTION_KEYS.summary(logEntryId ?? ""),
    queryFn: () => fetchExceptionSummary(logEntryId!),
    enabled: !!logEntryId,
  });
}

export function useExceptionDetail(id: string | null) {
  return useQuery({ queryKey: EXCEPTION_KEYS.detail(id ?? ""), queryFn: () => fetchExceptionDetail(id!), enabled: !!id });
}

export function useDedupeSuggestions(id: string | null) {
  return useQuery({ queryKey: EXCEPTION_KEYS.dedupe(id ?? ""), queryFn: () => fetchDedupeSuggestions(id!), enabled: !!id });
}

/** Invalida TODO lo de excepciones + las incidencias (convert/associate las tocan). */
function invalidate(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: EXCEPTION_KEYS.all });
  qc.invalidateQueries({ queryKey: ["incidents"] });
}

export function useAcknowledgeException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AcknowledgeExceptionRequest }) => acknowledgeException(id, dto),
    onSuccess: () => invalidate(qc),
  });
}

export function useDismissException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DismissExceptionRequest }) => dismissException(id, dto),
    onSuccess: () => invalidate(qc),
  });
}

export function useCorrectException() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: CorrectExceptionRequest }) => correctException(id, dto),
    onSuccess: () => invalidate(qc),
  });
}

export function useConvertException() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: ConvertExceptionRequest) => convertException(dto), onSuccess: () => invalidate(qc) });
}

export function useAssociateException() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: AssociateExceptionRequest) => associateException(dto), onSuccess: () => invalidate(qc) });
}

export function useCreateManualException() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: CreateManualExceptionRequest) => createManualException(dto), onSuccess: () => invalidate(qc) });
}
