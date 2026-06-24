import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateLogEntryRequest,
  ExecuteTransitionRequest,
  ReferenceEntity,
  SaveLogEntrySectionRequest,
  SetDeferralRequest,
  SubmitLogEntryRequest,
  VoidLogEntryRequest,
} from "@lyra/contracts";
import {
  createLogEntry,
  executeTransition,
  fetchAvailableTemplates,
  fetchLogEntry,
  fetchNewLogEntryPreview,
  fetchReferenceOptions,
  saveLogEntrySection,
  setLogEntryDeferral,
  submitLogEntry,
  voidLogEntry,
} from "./log-entries-api.js";
import { useActiveStructureId } from "../structure/structure-queries.js";

export const LOG_ENTRY_KEYS = {
  all: ["log-entries"] as const,
  detail: (id: string) => ["log-entries", "detail", id] as const,
  preview: (templateId: string, orgNodeId: string | null, equipmentId: string | null) =>
    ["log-entries", "preview", templateId, orgNodeId ?? "", equipmentId ?? ""] as const,
};

/**
 * Plantillas disponibles para crear una entrada (gateado por logentry:create).
 * Acotadas a la estructura activa del workspace (coherencia L1c; aditivo al ABAC),
 * espejo de los listados. La queryKey incluye la estructura para no servir caché de
 * otra. Lo reusan "Nueva entrada" y el alta de programación de rondas.
 */
export function useAvailableTemplates() {
  const structureId = useActiveStructureId();
  return useQuery({
    queryKey: ["log-entries", "available-templates", structureId ?? ""] as const,
    queryFn: () => fetchAvailableTemplates(structureId),
  });
}

export function useLogEntry(id: string | null) {
  return useQuery({
    queryKey: LOG_ENTRY_KEYS.detail(id ?? ""),
    queryFn: () => fetchLogEntry(id!),
    enabled: !!id,
  });
}

/**
 * Opciones de un selector de REFERENCIA (Ola 2): equipo/usuario/nodo/turno con
 * ABAC server-side. Para FieldControl (fill y visor resuelven label idéntico). Se
 * cachea por (kind, nodo); deshabilitada si falta el contexto que la entidad exige
 * (equipo/turno requieren nodo).
 */
export function useReferenceOptions(kind: ReferenceEntity | null, nodeId: string | null, enabled = true) {
  const needsNode = kind === "equipment" || kind === "shift";
  return useQuery({
    queryKey: ["log-entries", "references", kind ?? "", nodeId ?? ""] as const,
    queryFn: () => fetchReferenceOptions(kind!, { nodeId }),
    enabled: enabled && !!kind && (!needsNode || !!nodeId),
    staleTime: 60_000,
  });
}

/** Vista previa de una entrada nueva (modo compose 2.8.2): no persiste nada. */
export function useNewLogEntryPreview(
  templateId: string | null,
  orgNodeId: string | null,
  equipmentId: string | null = null,
  enabled = true,
) {
  return useQuery({
    queryKey: LOG_ENTRY_KEYS.preview(templateId ?? "", orgNodeId, equipmentId),
    queryFn: () => fetchNewLogEntryPreview(templateId!, orgNodeId, equipmentId),
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

/** Anula (descarta) un borrador (2.8.2): status → VOID con motivo auditado. */
export function useVoidLogEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: VoidLogEntryRequest) => voidLogEntry(id, dto),
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
