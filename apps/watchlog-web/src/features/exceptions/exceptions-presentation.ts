import type {
  ExceptionStatus,
  ExceptionThresholdType,
  ExceptionTrigger,
} from "@lyra/contracts";

/**
 * Tokens visuales de la capa de excepciones (Fase 4.1.1). Colores SOLO de la
 * paleta de marca / severidad (CLAUDE.md). El componente decide el ícono Lucide
 * por su cuenta a partir de estas claves (no se importan íconos aquí para no
 * acoplar presentación a render).
 */

/** Severidad operacional de la excepción → color + etiqueta es-CL. */
export const THRESHOLD_META: Record<ExceptionThresholdType, { label: string; color: string }> = {
  critical: { label: "Crítica", color: "#EF4444" },
  warning: { label: "Advertencia", color: "#F59E0B" },
  invalid: { label: "Posible inválido", color: "#06B6D4" },
};

/** Estado de triage → color + etiqueta + si es terminal. */
export const STATUS_META: Record<ExceptionStatus, { label: string; color: string; terminal: boolean }> = {
  OPEN: { label: "Abierta", color: "#F59E0B", terminal: false },
  ACKNOWLEDGED: { label: "Reconocida", color: "#6366F1", terminal: false },
  DISMISSED: { label: "Descartada", color: "#6B7280", terminal: true },
  CONVERTED: { label: "Convertida", color: "#06B6D4", terminal: true },
  CORRECTED: { label: "Corregida", color: "#22C55E", terminal: true },
};

/** Qué disparó la excepción → etiqueta legible. */
export const TRIGGER_META: Record<ExceptionTrigger, { label: string }> = {
  THRESHOLD_CRIT: { label: "Umbral crítico" },
  THRESHOLD_WARN: { label: "Umbral de advertencia" },
  RULE: { label: "Regla de negocio" },
  MANUAL: { label: "Registro manual" },
};

/** Presenta un valor de excepción (escalar) para lectura. Las celdas de
 *  tabla/matriz llegan a nivel de campo en el MVP (occurrenceRef suele ser null). */
export function formatExceptionValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

/** Texto de la banda violada a partir del snapshot congelado (best-effort). */
export function bandHint(
  bands: { warnLow?: number | null; warnHigh?: number | null; critLow?: number | null; critHigh?: number | null } | null,
  unit: string | null,
): string | null {
  if (!bands) return null;
  const u = unit ? ` ${unit}` : "";
  const parts: string[] = [];
  if (bands.critLow != null || bands.critHigh != null) {
    parts.push(`crítico ${bands.critLow ?? "−∞"}…${bands.critHigh ?? "∞"}${u}`);
  }
  if (bands.warnLow != null || bands.warnHigh != null) {
    parts.push(`advertencia ${bands.warnLow ?? "−∞"}…${bands.warnHigh ?? "∞"}${u}`);
  }
  return parts.length ? parts.join(" · ") : null;
}
