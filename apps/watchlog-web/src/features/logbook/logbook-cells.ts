import type { LogEntrySummaryValue } from "@lyra/contracts";
import { formatDateTime as fmtDateTime, formatLocalDate, formatNumber } from "../../lib/format.js";

/**
 * Formatea UN valor de resumen según su tipo, con la configuración REGIONAL activa
 * (lib/format). El backend manda el valor estructurado + meta; aquí se presenta.
 * Compartido por la grilla (`LogbookPage`) y el vistazo lateral (`PeekDrawer`).
 */
export function formatSummaryValue(sv: LogEntrySummaryValue): string {
  const v = sv.value;
  if (v === null || v === undefined) return "—";
  switch (sv.dataType) {
    case "NUMBER": {
      const n = typeof v === "number" ? v : Number(v);
      const num = Number.isFinite(n) ? formatNumber(n) : String(v);
      return sv.unit ? `${num} ${sv.unit}` : num;
    }
    case "CODE":
    case "CODE_ARRAY":
      // El valor guarda el code; el label resuelto (inline / lista) viene en optionLabel.
      return sv.optionLabel ?? (Array.isArray(v) ? v.join(", ") : String(v));
    case "BOOLEAN":
      return v ? "Sí" : "No";
    case "DATE":
      return typeof v === "string" ? formatLocalDate(v) : String(v);
    case "DATETIME":
      return typeof v === "string" ? fmtDateTime(v) : String(v);
    default:
      return String(v);
  }
}
