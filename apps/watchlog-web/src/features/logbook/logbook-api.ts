import {
  logEntryChangesResponseSchema,
  logEntryListResponseSchema,
  logEntryStatsSchema,
  logEntryTimelineResponseSchema,
  relatedLogEntriesSchema,
  signatureVerifyResultSchema,
  type LogEntryChangesResponse,
  type LogEntryListQuery,
  type LogEntryListResponse,
  type LogEntryStats,
  type LogEntryTimelineResponse,
  type RelatedLogEntries,
  type SignatureVerifyResult,
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
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

export function fetchLogbookList(query: LogEntryListQuery): Promise<LogEntryListResponse> {
  const qs = listQueryString(query);
  return apiJson(`/log-entries${qs ? `?${qs}` : ""}`, logEntryListResponseSchema);
}

export function fetchLogbookStats(query: LogEntryListQuery): Promise<LogEntryStats> {
  const qs = listQueryString(query);
  return apiJson(`/log-entries/stats${qs ? `?${qs}` : ""}`, logEntryStatsSchema);
}

/** Export CSV server-side del set COMPLETO filtrado (no solo la página). */
export function exportLogbookCsv(query: LogEntryListQuery): Promise<Blob> {
  const qs = listQueryString(query);
  return apiBlob(`/log-entries/export${qs ? `?${qs}` : ""}`);
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
