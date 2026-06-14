import { z } from "zod";
import {
  createLogEntryRequestSchema,
  executeTransitionRequestSchema,
  logEntryDetailSchema,
  saveLogEntrySectionRequestSchema,
  setDeferralRequestSchema,
  submitLogEntryRequestSchema,
  templateEligibleNodesSchema,
  templateListItemSchema,
  voidLogEntryRequestSchema,
  type CreateLogEntryRequest,
  type ExecuteTransitionRequest,
  type LogEntryDetail,
  type SaveLogEntrySectionRequest,
  type SetDeferralRequest,
  type SubmitLogEntryRequest,
  type TemplateEligibleNodes,
  type TemplateListItem,
  type VoidLogEntryRequest,
} from "@lyra/contracts";
import { apiJson } from "../../lib/api-client.js";

/**
 * Plantillas publicadas que el usuario puede usar para CREAR una entrada (picker de
 * "Nueva entrada"). Endpoint del módulo de bitácoras gateado por `logentry:create`
 * — no exige el permiso de administración de plantillas.
 */
export function fetchAvailableTemplates(): Promise<TemplateListItem[]> {
  return apiJson("/log-entries/templates", z.array(templateListItemSchema));
}

/**
 * Nodos en los que el usuario puede crear una entrada con esta plantilla (multi-
 * nodo 2.8.0): asignaciones de la plantilla ∩ alcance de nodo del usuario. La web
 * autoselecciona si hay 1 y obliga a elegir si hay más de 1.
 */
export function fetchTemplateEligibleNodes(templateId: string): Promise<TemplateEligibleNodes> {
  return apiJson(`/log-entries/templates/${encodeURIComponent(templateId)}/nodes`, templateEligibleNodesSchema);
}

// El LISTADO de entradas vive en `features/logbook` (módulo de Bitácoras 2.6,
// paginado por cursor); aquí queda solo el ciclo de LLENADO (crear/guardar/
// enviar/transicionar) sobre el detalle.

export function fetchLogEntry(id: string): Promise<LogEntryDetail> {
  return apiJson(`/log-entries/${id}`, logEntryDetailSchema);
}

/**
 * Vista previa de una entrada NUEVA sin persistir (modo compose 2.8.2): el mismo
 * detalle que produciría crear+abrir, con `id: ""`. La entrada se materializa
 * recién en el primer guardado real.
 */
export function fetchNewLogEntryPreview(
  templateId: string,
  orgNodeId?: string | null,
  equipmentId?: string | null,
): Promise<LogEntryDetail> {
  const qs = new URLSearchParams({ templateId });
  if (orgNodeId) qs.set("orgNodeId", orgNodeId);
  if (equipmentId) qs.set("equipmentId", equipmentId);
  return apiJson(`/log-entries/new?${qs.toString()}`, logEntryDetailSchema);
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

/** Anula (descarta) un borrador con motivo obligatorio (≥5). Status → VOID (2.8.2). */
export function voidLogEntry(id: string, dto: VoidLogEntryRequest): Promise<LogEntryDetail> {
  voidLogEntryRequestSchema.parse(dto);
  return apiJson(`/log-entries/${id}/void`, logEntryDetailSchema, { method: "POST", body: dto });
}
