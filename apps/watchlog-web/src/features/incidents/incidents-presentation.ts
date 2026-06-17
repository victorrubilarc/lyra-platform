import type { IncidentActionKind, IncidentActionStatus, IncidentLifecycle, IncidentOrigin, IncidentPriority } from "@lyra/contracts";

/** Tokens de severidad 1..5 (CLAUDE.md). */
export const SEVERITY_COLORS = ["#6B7280", "#22C55E", "#84CC16", "#EAB308", "#F97316", "#EF4444"];

export function severityColor(sev: number): string {
  return SEVERITY_COLORS[sev] ?? "#6B7280";
}

export function severityLabel(sev: number): string {
  return ["—", "Muy baja", "Baja", "Media", "Alta", "Crítica"][sev] ?? `S${sev}`;
}

export const PRIORITY_META: Record<IncidentPriority, { label: string; color: string }> = {
  LOW: { label: "Baja", color: "#22C55E" },
  MEDIUM: { label: "Media", color: "#EAB308" },
  HIGH: { label: "Alta", color: "#F97316" },
  CRITICAL: { label: "Crítica", color: "#EF4444" },
};

export const LIFECYCLE_META: Record<IncidentLifecycle, { label: string; color: string }> = {
  OPEN: { label: "Abierta", color: "#6366F1" },
  CLOSED: { label: "Cerrada", color: "#22C55E" },
  CANCELED: { label: "Anulada", color: "#6B7280" },
};

export const ORIGIN_META: Record<IncidentOrigin, { label: string }> = {
  MANUAL: { label: "Manual" },
  LOG_ENTRY: { label: "Bitácora" },
  EXCEPTION: { label: "Excepción" },
  RULE: { label: "Regla" },
};

// === Acciones CAPA (Fase 4.2a) ===============================================

export const ACTION_KIND_META: Record<IncidentActionKind, { label: string; color: string }> = {
  CORRECTIVE: { label: "Correctiva", color: "#6366F1" },
  PREVENTIVE: { label: "Preventiva", color: "#06B6D4" },
  IMMEDIATE: { label: "Inmediata", color: "#F97316" },
};

export const ACTION_STATUS_META: Record<IncidentActionStatus, { label: string; color: string }> = {
  OPEN: { label: "Abierta", color: "#9AA3B8" },
  IN_PROGRESS: { label: "En progreso", color: "#06B6D4" },
  DONE: { label: "Realizada", color: "#EAB308" },
  VERIFIED: { label: "Verificada", color: "#22C55E" },
  CANCELED: { label: "Anulada", color: "#6B7280" },
};

/**
 * Paleta acotada para el color del chip de un TIPO de incidencia. Son los valores
 * canónicos de los tokens del DS (CLAUDE.md): acentos + severidades. El modelo
 * persiste el hex; aquí ofrecemos solo la paleta de marca (sin hex libre).
 */
export const CATALOG_COLOR_SWATCHES: ReadonlyArray<{ value: string; label: string }> = [
  { value: "#6366F1", label: "Índigo (acento)" },
  { value: "#06B6D4", label: "Cian (info)" },
  { value: "#22C55E", label: "Verde (sev. 1)" },
  { value: "#84CC16", label: "Lima (sev. 2)" },
  { value: "#EAB308", label: "Ámbar (sev. 3)" },
  { value: "#F97316", label: "Naranjo (sev. 4)" },
  { value: "#EF4444", label: "Rojo (sev. 5)" },
  { value: "#6B7280", label: "Gris (neutro)" },
];
