import type { LogEntryListQuery, LogEntrySortField } from "@lyra/contracts";

/**
 * Estado de la grilla de Bitácoras que viaja en la URL (deep-link): filtros +
 * orden. La fuente de verdad de la pantalla es la URL — un enlace pegado en otro
 * navegador reproduce la misma vista (patrón Kibana/Splunk).
 */
export interface LogbookGridState {
  q: string;
  templateId: string;
  orgNodeId: string;
  includeDescendants: boolean;
  status: "" | "DRAFT" | "SUBMITTED" | "VOID";
  stateKey: string;
  shiftCode: string;
  periodKey: string;
  operationalDate: string;
  /** Días locales (YYYY-MM-DD) del rango de fecha efectiva / captura. */
  effectiveFromDay: string;
  effectiveToDay: string;
  recordedFromDay: string;
  recordedToDay: string;
  onlyMine: boolean;
  pendingSignature: boolean;
  thresholdBand: "" | "WARN" | "CRIT" | "ANY";
  /** Origen del registro (2.7.0): "" = todos. */
  entryOrigin: "" | "ONLINE" | "DEFERRED";
  sort: LogEntrySortField;
  dir: "asc" | "desc";
}

export const DEFAULT_GRID_STATE: LogbookGridState = {
  q: "",
  templateId: "",
  orgNodeId: "",
  includeDescendants: true,
  status: "",
  stateKey: "",
  shiftCode: "",
  periodKey: "",
  operationalDate: "",
  effectiveFromDay: "",
  effectiveToDay: "",
  recordedFromDay: "",
  recordedToDay: "",
  onlyMine: false,
  pendingSignature: false,
  thresholdBand: "",
  entryOrigin: "",
  sort: "recordedAt",
  dir: "desc",
};

/** Día local YYYY-MM-DD (para `<input type="date">`). */
export function isoDay(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

const dayStart = (day: string): string => new Date(`${day}T00:00:00`).toISOString();
const dayEnd = (day: string): string => new Date(`${day}T23:59:59.999`).toISOString();

/** Convierte el estado de la grilla a la query del contrato (la valida el backend). */
export function toListQuery(state: LogbookGridState, currentUserId: string | null): LogEntryListQuery {
  return {
    q: state.q.trim() || undefined,
    templateId: state.templateId || undefined,
    orgNodeId: state.orgNodeId || undefined,
    includeDescendants: state.orgNodeId ? state.includeDescendants : undefined,
    status: state.status || undefined,
    stateKey: state.stateKey || undefined,
    shiftCode: state.shiftCode.trim() || undefined,
    periodKey: state.periodKey.trim() || undefined,
    operationalDate: state.operationalDate || undefined,
    effectiveFrom: state.effectiveFromDay ? dayStart(state.effectiveFromDay) : undefined,
    effectiveTo: state.effectiveToDay ? dayEnd(state.effectiveToDay) : undefined,
    recordedFrom: state.recordedFromDay ? dayStart(state.recordedFromDay) : undefined,
    recordedTo: state.recordedToDay ? dayEnd(state.recordedToDay) : undefined,
    createdById: state.onlyMine && currentUserId ? currentUserId : undefined,
    pendingSignature: state.pendingSignature || undefined,
    thresholdBand: state.thresholdBand || undefined,
    entryOrigin: state.entryOrigin || undefined,
    sort: state.sort,
    dir: state.dir,
  };
}

/** Serializa a URLSearchParams omitiendo los valores por defecto (URL limpia). */
export function gridStateToParams(state: LogbookGridState): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_GRID_STATE) as (keyof LogbookGridState)[]) {
    const value = state[key];
    const fallback = DEFAULT_GRID_STATE[key];
    if (value === fallback) continue;
    params.set(key, String(value));
  }
  return params;
}

/** Reconstruye el estado desde la URL (valores desconocidos caen al default). */
export function gridStateFromParams(params: URLSearchParams): LogbookGridState {
  const state: LogbookGridState = { ...DEFAULT_GRID_STATE };
  for (const key of [
    "q",
    "templateId",
    "orgNodeId",
    "stateKey",
    "shiftCode",
    "periodKey",
    "operationalDate",
    "effectiveFromDay",
    "effectiveToDay",
    "recordedFromDay",
    "recordedToDay",
  ] as const) {
    const raw = params.get(key);
    if (raw !== null) state[key] = raw;
  }
  for (const key of ["includeDescendants", "onlyMine", "pendingSignature"] as const) {
    const raw = params.get(key);
    if (raw !== null) state[key] = raw === "true";
  }

  const status = params.get("status");
  if (status === "DRAFT" || status === "SUBMITTED" || status === "VOID") state.status = status;
  const band = params.get("thresholdBand");
  if (band === "WARN" || band === "CRIT" || band === "ANY") state.thresholdBand = band;
  const origin = params.get("entryOrigin");
  if (origin === "ONLINE" || origin === "DEFERRED") state.entryOrigin = origin;
  const sort = params.get("sort");
  if (sort === "recordedAt" || sort === "effectiveAt" || sort === "entryNumber") state.sort = sort;
  const dir = params.get("dir");
  if (dir === "asc" || dir === "desc") state.dir = dir;
  return state;
}

/** ¿Hay filtros activos (distintos del default), sin contar el orden? */
export function hasActiveFilters(state: LogbookGridState): boolean {
  for (const key of Object.keys(DEFAULT_GRID_STATE) as (keyof LogbookGridState)[]) {
    if (key === "sort" || key === "dir" || key === "includeDescendants") continue;
    if (state[key] !== DEFAULT_GRID_STATE[key]) return true;
  }
  return false;
}
