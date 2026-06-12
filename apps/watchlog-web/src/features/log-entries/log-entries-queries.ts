import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateLogEntryRequest,
  ExecuteTransitionRequest,
  SaveLogEntrySectionRequest,
  SetDeferralRequest,
  SubmitLogEntryRequest,
} from "@lyra/contracts";
import {
  createLogEntry,
  executeTransition,
  fetchLogEntry,
  fetchNewLogEntryPreview,
  saveLogEntrySection,
  setLogEntryDeferral,
  submitLogEntry,
} from "./log-entries-api.js";

export const LOG_ENTRY_KEYS = {
  all: ["log-entries"] as const,
  detail: (id: string) => ["log-entries", "detail", id] as const,
  preview: (templateId: string, orgNodeId: string | null) => ["log-entries", "preview", templateId, orgNodeId ?? ""] as const,
};

export function useLogEntry(id: string | null) {
  return useQuery({
    queryKey: LOG_ENTRY_KEYS.detail(id ?? ""),
    queryFn: () => fetchLogEntry(id!),
    enabled: !!id,
  });
}

/** Vista previa de una entrada nueva (modo compose 2.8.2): no persiste nada. */
export function useNewLogEntryPreview(templateId: string | null, orgNodeId: string | null, enabled = true) {
  return useQuery({
    queryKey: LOG_ENTRY_KEYS.preview(templateId ?? "", orgNodeId),
    queryFn: () => fetchNewLogEntryPreview(templateId!, orgNodeId),
    enabled: enabled && !!templateId,
    // El preview depende del reloj/turno/periodo del momento: no lo caches agresivo.
    staleTime: 0,
    gcTime: 0,
  });
}

export function useCreateLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateLogEntryRequest) => createLogEntry(dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: LOG_ENTRY_KEYS.all });
      qc.setQueryData(LOG_ENTRY_KEYS.detail(data.id), data);
    },
  });
}

export function useSaveLogEntrySection(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ sectionKey, dto }: { sectionKey: string; dto: SaveLogEntrySectionRequest }) =>
      saveLogEntrySection(id, sectionKey, dto),
    onSuccess: (data) => qc.setQueryData(LOG_ENTRY_KEYS.detail(id), data),
  });
}

export function useSetDeferral(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SetDeferralRequest) => setLogEntryDeferral(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: LOG_ENTRY_KEYS.all });
      qc.setQueryData(LOG_ENTRY_KEYS.detail(id), data);
    },
  });
}

export function useSubmitLogEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: SubmitLogEntryRequest = {}) => submitLogEntry(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: LOG_ENTRY_KEYS.all });
      qc.setQueryData(LOG_ENTRY_KEYS.detail(id), data);
    },
  });
}

export function useExecuteTransition(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: ExecuteTransitionRequest) => executeTransition(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: LOG_ENTRY_KEYS.all });
      qc.setQueryData(LOG_ENTRY_KEYS.detail(id), data);
    },
  });
}
