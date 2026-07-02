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
