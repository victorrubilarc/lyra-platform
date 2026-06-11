import {
  createLogEntryRequestSchema,
  executeTransitionRequestSchema,
  logEntryDetailSchema,
  saveLogEntrySectionRequestSchema,
  setDeferralRequestSchema,
  submitLogEntryRequestSchema,
  type CreateLogEntryRequest,
  type ExecuteTransitionRequest,
  type LogEntryDetail,
  type SaveLogEntrySectionRequest,
  type SetDeferralRequest,
  type SubmitLogEntryRequest,
} from "@lyra/contracts";
import { apiJson } from "../../lib/api-client.js";

// El LISTADO de entradas vive en `features/logbook` (módulo de Bitácoras 2.6,
// paginado por cursor); aquí queda solo el ciclo de LLENADO (crear/guardar/
// enviar/transicionar) sobre el detalle.

export function fetchLogEntry(id: string): Promise<LogEntryDetail> {
  return apiJson(`/log-entries/${id}`, logEntryDetailSchema);
}

export function createLogEntry(dto: CreateLogEntryRequest): Promise<LogEntryDetail> {
  createLogEntryRequestSchema.parse(dto);
  return apiJson("/log-entries", logEntryDetailSchema, { method: "POST", body: dto });
}

export function saveLogEntrySection(
  id: string,
  sectionKey: string,
  dto: SaveLogEntrySectionRequest,
): Promise<LogEntryDetail> {
  saveLogEntrySectionRequestSchema.parse(dto);
  return apiJson(`/log-entries/${id}/sections/${encodeURIComponent(sectionKey)}`, logEntryDetailSchema, {
    method: "PUT",
    body: dto,
  });
}

/** Declara, corrige o quita (deferred: null) el registro DIFERIDO de un borrador (2.7.0). */
export function setLogEntryDeferral(id: string, dto: SetDeferralRequest): Promise<LogEntryDetail> {
  setDeferralRequestSchema.parse(dto);
  return apiJson(`/log-entries/${id}/deferral`, logEntryDetailSchema, { method: "PUT", body: dto });
}

export function submitLogEntry(id: string, dto: SubmitLogEntryRequest = {}): Promise<LogEntryDetail> {
  submitLogEntryRequestSchema.parse(dto);
  return apiJson(`/log-entries/${id}/submit`, logEntryDetailSchema, { method: "POST", body: dto });
}

export function executeTransition(id: string, dto: ExecuteTransitionRequest): Promise<LogEntryDetail> {
  executeTransitionRequestSchema.parse(dto);
  return apiJson(`/log-entries/${id}/transitions`, logEntryDetailSchema, { method: "POST", body: dto });
}
