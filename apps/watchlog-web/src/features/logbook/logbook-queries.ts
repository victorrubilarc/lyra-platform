import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import type { LogEntryListQuery } from "@lyra/contracts";
import {
  fetchLogbookChanges,
  fetchLogbookFilterTemplates,
  fetchLogbookList,
  fetchLogbookRelated,
  fetchLogbookStats,
  fetchLogbookTimeline,
  verifyLogbookSignature,
} from "./logbook-api.js";

export const LOGBOOK_KEYS = {
  list: (query: LogEntryListQuery) => ["logbook", "list", query] as const,
  stats: (query: LogEntryListQuery) => ["logbook", "stats", query] as const,
  timeline: (id: string) => ["logbook", "timeline", id] as const,
  changes: (id: string) => ["logbook", "changes", id] as const,
  related: (id: string) => ["logbook", "related", id] as const,
  filterTemplates: ["logbook", "filter-templates"] as const,
};

/** Plantillas con alcance para el filtro de la grilla (no las del admin). */
export function useLogbookFilterTemplates() {
  return useQuery({
    queryKey: LOGBOOK_KEYS.filterTemplates,
    queryFn: fetchLogbookFilterTemplates,
    staleTime: 60_000,
  });
}

/** Listado paginado por cursor keyset (la query NO incluye `cursor`: lo maneja el hook). */
export function useLogbookList(query: LogEntryListQuery) {
  return useInfiniteQuery({
    queryKey: LOGBOOK_KEYS.list(query),
    queryFn: ({ pageParam }) => fetchLogbookList({ ...query, cursor: pageParam || undefined }),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useLogbookStats(query: LogEntryListQuery) {
  return useQuery({ queryKey: LOGBOOK_KEYS.stats(query), queryFn: () => fetchLogbookStats(query) });
}

export function useLogbookTimeline(id: string) {
  return useInfiniteQuery({
    queryKey: LOGBOOK_KEYS.timeline(id),
    queryFn: ({ pageParam }) => fetchLogbookTimeline(id, pageParam || undefined),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useLogbookChanges(id: string) {
  return useInfiniteQuery({
    queryKey: LOGBOOK_KEYS.changes(id),
    queryFn: ({ pageParam }) => fetchLogbookChanges(id, pageParam || undefined),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useLogbookRelated(id: string) {
  return useQuery({ queryKey: LOGBOOK_KEYS.related(id), queryFn: () => fetchLogbookRelated(id) });
}

/** Verificación on-demand (no se cachea: cada verificación es un acto auditado). */
export function useVerifySignature(id: string) {
  return useMutation({ mutationFn: (signatureId: string) => verifyLogbookSignature(id, signatureId) });
}
