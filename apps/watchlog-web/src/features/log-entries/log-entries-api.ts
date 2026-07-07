import { z } from "zod";
import {
  createLogEntryRequestSchema,
  executeTransitionRequestSchema,
  fileDescriptorSchema,
  logEntryDetailSchema,
  referenceOptionsResultSchema,
  saveLogEntrySectionRequestSchema,
  setDeferralRequestSchema,
  submitLogEntryRequestSchema,
  templateEligibleNodesSchema,
  templateListItemSchema,
  voidLogEntryRequestSchema,
  type CreateLogEntryRequest,
  type ExecuteTransitionRequest,
  type FileDescriptor,
  type LogEntryDetail,
  type ReferenceEntity,
  type ReferenceOptionsResult,
  type SaveLogEntrySectionRequest,
  type SetDeferralRequest,
  type SubmitLogEntryRequest,
  type TemplateEligibleNodes,
  type TemplateListItem,
  type VoidLogEntryRequest,
} from "@lyra/contracts";
import { apiBlob, apiJson, apiUpload } from "../../lib/api-client.js";

/**
 * Sube un archivo de EVIDENCIA a un campo ATTACHMENT (Ola 3). Subida PROXIED por
 * la API (choke-point de validación tamaño/tipo). Devuelve el descriptor; el
 * llamador lo agrega al valor del campo y guarda la sección por el canal normal.
 */
export function uploadAttachment(
  entryId: string,
  sectionKey: string,
  fieldKey: string,
  file: File,
): Promise<FileDescriptor> {
  const form = new FormData();
  form.append("file", file, file.name);
  return apiUpload(
    `/log-entries/${entryId}/attachments/${encodeURIComponent(sectionKey)}/${encodeURIComponent(fieldKey)}`,
    form,
    fileDescriptorSchema,
  );
}

/**
 * Descarga un adjunto PROXIED por la API (H1 2026-07-07: fetch autenticado con
 * Bearer → blob → object URL; el navegador jamás toca MinIO ni viajan tokens en
 * la URL). `inline` pide disposición de previsualización (la API solo la honra
 * para tipos inline-safe). El llamador debe `URL.revokeObjectURL` al terminar.
 */
export async function fetchAttachmentObjectUrl(
  entryId: string,
  descriptorId: string,
  inline = false,
): Promise<{ url: string }> {
  const blob = await apiBlob(
    `/log-entries/${entryId}/attachments/${encodeURIComponent(descriptorId)}${inline ? "?inline=1" : ""}`,
  );
  return { url: URL.createObjectURL(blob) };
}

/**
 * Opciones de un selector de REFERENCIA (Ola 2) con ABAC server-side. `nodeId` =
 * nodo de la entrada (acota equipo/turno); `q` filtra. El backend decide el alcance.
 */
export function fetchReferenceOptions(
  kind: ReferenceEntity,
  params: { nodeId?: string | null; q?: string } = {},
): Promise<ReferenceOptionsResult> {
  const qs = new URLSearchParams();
  if (params.nodeId) qs.set("nodeId", params.nodeId);
  if (params.q) qs.set("q", params.q);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiJson(`/log-entries/references/${kind}/options${suffix}`, referenceOptionsResultSchema);
}

/**
 * Plantillas publicadas que el usuario puede usar para CREAR una entrada (picker de
 * "Nueva entrada"). Endpoint del módulo de bitácoras gateado por `logentry:create`
 * — no exige el permiso de administración de plantillas. `structureId` acota el
 * picker a la estructura activa del workspace (coherencia L1c; aditivo al ABAC).
 */
export function fetchAvailableTemplates(structureId?: string | null): Promise<TemplateListItem[]> {
  const suffix = structureId ? `?structureId=${encodeURIComponent(structureId)}` : "";
  return apiJson(`/log-entries/templates${suffix}`, z.array(templateListItemSchema));
}

/**
 * Nodos en los que el usuario puede crear una entrada con esta plantilla (multi-
 * nodo 2.8.0): asignaciones de la plantilla ∩ alcance de nodo del usuario. La web
 * autoselecciona si hay 1 y obliga a elegir si hay más de 1. `structureId` acota
 * los nodos a la estructura activa del workspace (coherencia L1c; aditivo al ABAC).
 */
export function fetchTemplateEligibleNodes(
  templateId: string,
  structureId?: string | null,
): Promise<TemplateEligibleNodes> {
  const suffix = structureId ? `?structureId=${encodeURIComponent(structureId)}` : "";
  return apiJson(
    `/log-entries/templates/${encodeURIComponent(templateId)}/nodes${suffix}`,
    templateEligibleNodesSchema,
  );
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
