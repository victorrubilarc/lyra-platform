import type { WorkOrderLifecycle, WorkOrderOrigin, WorkOrderPriority } from "@lyra/contracts";

/** Tokens de criticidad 1..5 (misma escala de severidad del DS). */
const CRITICALITY_COLORS = ["#6B7280", "#22C55E", "#84CC16", "#EAB308", "#F97316", "#EF4444"];

export function criticalityColor(c: number): string {
  return CRITICALITY_COLORS[c] ?? "#6B7280";
}

export function criticalityLabel(c: number): string {
  return ["—", "Muy baja", "Baja", "Media", "Alta", "Crítica"][c] ?? `C${c}`;
}

export const PRIORITY_META: Record<WorkOrderPriority, { label: string; color: string }> = {
  LOW: { label: "Baja", color: "#22C55E" },
  MEDIUM: { label: "Media", color: "#EAB308" },
  HIGH: { label: "Alta", color: "#F97316" },
  CRITICAL: { label: "Crítica", color: "#EF4444" },
};

export const LIFECYCLE_META: Record<WorkOrderLifecycle, { label: string; color: string }> = {
  DRAFT: { label: "Borrador", color: "#9AA3B8" },
  OPEN: { label: "Abierta", color: "#6366F1" },
  CLOSED: { label: "Cerrada", color: "#22C55E" },
  CANCELED: { label: "Anulada", color: "#6B7280" },
};

export const ORIGIN_META: Record<WorkOrderOrigin, { label: string }> = {
  DIRECT: { label: "Directa" },
  RULE: { label: "Regla" },
  EXCEPTION: { label: "Excepción" },
  PLANNED: { label: "Planificada" },
  INCIDENT: { label: "Incidencia" },
};

/**
 * Paleta acotada para el color del chip de un catálogo (tipo/área/especialidad).
 * Valores canónicos de los tokens del DS (CLAUDE.md): acentos + severidades. El
 * modelo persiste el hex; aquí solo se ofrece la paleta de marca (sin hex libre).
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
