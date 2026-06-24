import {
  logEntryChangesResponseSchema,
  logEntryFacetsSchema,
  logEntryListResponseSchema,
  logEntryStatsSchema,
  logEntryTimelineResponseSchema,
  myShiftFilterSchema,
  relatedLogEntriesSchema,
  savedViewListResponseSchema,
  savedViewSchema,
  signatureVerifyResultSchema,
  sortKeysToParam,
  type CreateSavedViewRequest,
  type LogEntryChangesResponse,
  type LogEntryListQuery,
  type LogEntryListResponse,
  type LogEntryFacets,
  type LogEntryStats,
  type LogEntryTimelineResponse,
  type MyShiftFilter,
  type RelatedLogEntries,
  type SavedViewDto,
  type SavedViewListResponse,
  type SavedViewModule,
  type SignatureVerifyResult,
  type UpdateSavedViewRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiBlob, apiJson } from "../../lib/api-client.js";

/** Plantilla visible en el filtro de Bitácoras (id + nombre, con alcance aplicado). */
const filterTemplateSchema = z.object({ id: z.string(), name: z.string() });
export type FilterTemplate = z.infer<typeof filterTemplateSchema>;

/**
 * Plantillas que el usuario puede VER (poblar el filtro de la grilla). Acotadas
 * por el MISMO alcance ABAC que la grilla (nodo × plantilla) ⇒ el filtro nunca
 * ofrece plantillas fuera de privilegio. Endpoint de lectura (`logentry:view`).
 */
export function fetchLogbookFilterTemplates(): Promise<FilterTemplate[]> {
  return apiJson("/log-entries/filter-templates", z.array(filterTemplateSchema.passthrough()).transform(
    (rows) => rows.map((r) => ({ id: r.id, name: r.name })),
  ));
}

/** Serializa la query del listado (omitiendo vacíos) para el backend. */
export function listQueryString(query: LogEntryListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || key === "sorts") continue;
    params.set(key, String(value));
  }
  // Multi-sort → CSV `campo:dir` (String(array de objetos) daría "[object Object]").
  if (query.sorts && query.sorts.length) params.set("sorts", sortKeysToParam(query.sorts));
  return params.toString();
}

/** Une el querystring del listado con `structureId` (estructura activa; aislamiento L1b). */
function withStructure(qs: string, structureId?: string | null): string {
  const s = structureId ? (qs ? `${qs}&structureId=${encodeURIComponent(structureId)}` : `structureId=${encodeURIComponent(structureId)}`) : qs;
  return s ? `?${s}` : "";
}

export function fetchLogbookList(query: LogEntryListQuery, structureId?: string | null): Promise<LogEntryListResponse> {
  return apiJson(`/log-entries${withStructure(listQueryString(query), structureId)}`, logEntryListResponseSchema);
}

export function fetchLogbookStats(query: LogEntryListQuery, structureId?: string | null): Promise<LogEntryStats> {
  return apiJson(`/log-entries/stats${withStructure(listQueryString(query), structureId)}`, logEntryStatsSchema);
}

/** Facetas con conteo del set filtrado (mismo where+ABAC; conteos de hermanos). */
export function fetchLogbookFacets(query: LogEntryListQuery, structureId?: string | null): Promise<LogEntryFacets> {
  return apiJson(`/log-entries/facets${withStructure(listQueryString(query), structureId)}`, logEntryFacetsSchema);
}

/** Filtros resueltos de "Mi turno" (turno/día vigentes + autor), resueltos por backend. */
export function fetchMyShiftFilter(): Promise<MyShiftFilter> {
  return apiJson(`/log-entries/my-shift`, myShiftFilterSchema);
}

/** Export CSV server-side del set COMPLETO filtrado (no solo la página). */
export function exportLogbookCsv(query: LogEntryListQuery, structureId?: string | null): Promise<Blob> {
  return apiBlob(`/log-entries/export${withStructure(listQueryString(query), structureId)}`);
}

export function fetchLogbookTimeline(id: string, cursor?: string): Promise<LogEntryTimelineResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiJson(`/log-entries/${id}/timeline${qs}`, logEntryTimelineResponseSchema);
}

export function fetchLogbookChanges(id: string, cursor?: string): Promise<LogEntryChangesResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiJson(`/log-entries/${id}/changes${qs}`, logEntryChangesResponseSchema);
}

export function fetchLogbookRelated(id: string): Promise<RelatedLogEntries> {
  return apiJson(`/log-entries/${id}/related`, relatedLogEntriesSchema);
}

/** Verificación de integridad de una firma (§11.70). Acto auditado en backend. */
export function verifyLogbookSignature(id: string, signatureId: string): Promise<SignatureVerifyResult> {
  return apiJson(`/log-entries/${id}/signatures/${signatureId}/verify`, signatureVerifyResultSchema, {
    method: "POST",
    body: {},
  });
}

// --- Vistas guardadas (Fase 2.8.1b) — preferencia personal, ownership-gated -----

// Los esquemas con `.default()` tienen input ≠ output; `apiJson` unifica ambos en su
// genérico, así que tipamos el retorno por el OUTPUT (lo que `parse` produce en runtime).
export function fetchSavedViews(module: SavedViewModule): Promise<SavedViewListResponse> {
  return apiJson(`/saved-views?module=${encodeURIComponent(module)}`, savedViewListResponseSchema) as Promise<SavedViewListResponse>;
}

export function createSavedView(body: CreateSavedViewRequest): Promise<SavedViewDto> {
  return apiJson(`/saved-views`, savedViewSchema, { method: "POST", body }) as Promise<SavedViewDto>;
}

export function updateSavedView(id: string, body: UpdateSavedViewRequest): Promise<SavedViewDto> {
  return apiJson(`/saved-views/${id}`, savedViewSchema, { method: "PATCH", body }) as Promise<SavedViewDto>;
}

export function deleteSavedView(id: string): Promise<{ ok: true }> {
  return apiJson(`/saved-views/${id}`, z.object({ ok: z.literal(true) }), { method: "DELETE" });
}
