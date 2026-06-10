import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateLogEntryRequest, LogEntryListQuery, SaveLogEntrySectionRequest, SubmitLogEntryRequest } from "@lyra/contracts";
import {
  createLogEntry,
  fetchLogEntries,
  fetchLogEntry,
  saveLogEntrySection,
  submitLogEntry,
} from "./log-entries-api.js";

export const LOG_ENTRY_KEYS = {
  all: ["log-entries"] as const,
  list: (query: LogEntryListQuery) => ["log-entries", "list", query] as const,
  detail: (id: string) => ["log-entries", "detail", id] as const,
};

export function useLogEntries(query: LogEntryListQuery = {}) {
  return useQuery({ queryKey: LOG_ENTRY_KEYS.list(query), queryFn: () => fetchLogEntries(query) });
}

export function useLogEntry(id: string | null) {
  return useQuery({
    queryKey: LOG_ENTRY_KEYS.detail(id ?? ""),
    queryFn: () => fetchLogEntry(id!),
    enabled: !!id,
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
