import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateSavedViewRequest,
  LogEntryListQuery,
  SavedViewModule,
  UpdateSavedViewRequest,
} from "@lyra/contracts";
import {
  createSavedView,
  deleteSavedView,
  fetchLogbookChanges,
  fetchLogbookFacets,
  fetchLogbookFilterTemplates,
  fetchLogbookList,
  fetchLogbookRelated,
  fetchLogbookStats,
  fetchLogbookTimeline,
  fetchSavedViews,
  updateSavedView,
  verifyLogbookSignature,
} from "./logbook-api.js";
import { useActiveStructureId } from "../structure/structure-queries.js";

export const LOGBOOK_KEYS = {
  list: (query: LogEntryListQuery, structureId: string | null) => ["logbook", "list", query, structureId] as const,
  stats: (query: LogEntryListQuery, structureId: string | null) => ["logbook", "stats", query, structureId] as const,
  facets: (query: LogEntryListQuery, structureId: string | null) => ["logbook", "facets", query, structureId] as const,
  timeline: (id: string) => ["logbook", "timeline", id] as const,
  changes: (id: string) => ["logbook", "changes", id] as const,
  related: (id: string) => ["logbook", "related", id] as const,
  filterTemplates: ["logbook", "filter-templates"] as const,
  savedViews: (module: SavedViewModule) => ["saved-views", module] as const,
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
  const structureId = useActiveStructureId();
  return useInfiniteQuery({
    queryKey: LOGBOOK_KEYS.list(query, structureId),
    queryFn: ({ pageParam }) => fetchLogbookList({ ...query, cursor: pageParam || undefined }, structureId),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useLogbookStats(query: LogEntryListQuery) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: LOGBOOK_KEYS.stats(query, structureId), queryFn: () => fetchLogbookStats(query, structureId) });
}

/** Facetas con conteo del set filtrado (estilo Splunk/Kibana). */
export function useLogbookFacets(query: LogEntryListQuery, enabled: boolean) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: LOGBOOK_KEYS.facets(query, structureId), queryFn: () => fetchLogbookFacets(query, structureId), enabled, staleTime: 15_000 });
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

// --- Vistas guardadas (Fase 2.8.1b) -----------------------------------------

/** Vistas guardadas del usuario para un módulo (preferencia personal). */
export function useSavedViews(module: SavedViewModule) {
  return useQuery({
    queryKey: LOGBOOK_KEYS.savedViews(module),
    queryFn: () => fetchSavedViews(module).then((r) => r.views),
    staleTime: 30_000,
  });
}

/** Mutaciones de vistas (crear/actualizar/eliminar) con invalidación de la lista. */
export function useSavedViewMutations(module: SavedViewModule) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: LOGBOOK_KEYS.savedViews(module) });
  const create = useMutation({ mutationFn: (body: CreateSavedViewRequest) => createSavedView(body), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateSavedViewRequest }) => updateSavedView(id, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteSavedView(id), onSuccess: invalidate });
  return { create, update, remove };
}
