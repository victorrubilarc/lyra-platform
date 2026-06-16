import type { IncidentLifecycle, IncidentOrigin, IncidentPriority } from "@lyra/contracts";

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
