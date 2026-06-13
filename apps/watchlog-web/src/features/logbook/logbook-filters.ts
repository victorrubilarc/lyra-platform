import { sortKeysFromParam, sortKeysToParam, type LogEntryListQuery, type LogEntrySortKey } from "@lyra/contracts";

/**
 * Estado de la grilla de Bitácoras que viaja en la URL (deep-link): filtros +
 * orden. La fuente de verdad de la pantalla es la URL — un enlace pegado en otro
 * navegador reproduce la misma vista (patrón Kibana/Splunk).
 */
export interface LogbookGridState {
  q: string;
  templateId: string;
  /** Equipo (objeto de referencia EAM). Vacío = todos. Se filtra desde la faceta. */
  equipmentId: string;
  /** Multi-nodo (2.8.1b-UX): varios nodos a la vez. Vacío = toda la estructura. */
  orgNodeIds: string[];
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
  /** Review-by-exception (2.8.1c): solo lo accionable (umbral WARN/CRIT OR firma pendiente). */
  exceptionsOnly: boolean;
  thresholdBand: "" | "WARN" | "CRIT" | "ANY";
  /** Origen del registro (2.7.0): "" = todos. */
  entryOrigin: "" | "ONLINE" | "DEFERRED";
  /** Multi-sort (2.8.1b): lista ordenada de claves indexadas (1..3). El header
   *  fija una sola; el gestor de orden arma la lista. Default = recordedAt desc. */
  sorts: LogEntrySortKey[];
}

/** Orden por defecto (fecha de captura, más reciente primero). */
export const DEFAULT_SORTS: LogEntrySortKey[] = [{ field: "recordedAt", dir: "desc" }];

export const DEFAULT_GRID_STATE: LogbookGridState = {
  q: "",
  templateId: "",
  equipmentId: "",
  orgNodeIds: [],
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
  exceptionsOnly: false,
  thresholdBand: "",
  entryOrigin: "",
  sorts: DEFAULT_SORTS,
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
    equipmentId: state.equipmentId || undefined,
    orgNodeIds: state.orgNodeIds.length ? state.orgNodeIds : undefined,
    includeDescendants: state.orgNodeIds.length ? state.includeDescendants : undefined,
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
    exceptionsOnly: state.exceptionsOnly || undefined,
    thresholdBand: state.thresholdBand || undefined,
    entryOrigin: state.entryOrigin || undefined,
    sorts: state.sorts.length ? state.sorts : DEFAULT_SORTS,
    // Lote del servidor (keyset). La grilla pagina ESTE lote en el cliente con su
    // propio paginador; "Cargar más" trae el siguiente lote cuando hay más.
    take: 100,
  };
}

/** ¿El orden multi-sort es el por defecto (recordedAt desc)? */
export function isDefaultSorts(sorts: LogEntrySortKey[]): boolean {
  return sorts.length === 1 && sorts[0]!.field === "recordedAt" && sorts[0]!.dir === "desc";
}

/** Serializa a URLSearchParams omitiendo los valores por defecto (URL limpia). */
export function gridStateToParams(state: LogbookGridState): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of Object.keys(DEFAULT_GRID_STATE) as (keyof LogbookGridState)[]) {
    if (key === "orgNodeIds" || key === "sorts") continue; // arrays → CSV, manejados aparte
    const value = state[key];
    const fallback = DEFAULT_GRID_STATE[key];
    if (value === fallback) continue;
    params.set(key, String(value));
  }
  if (state.orgNodeIds.length) params.set("orgNodeIds", state.orgNodeIds.join(","));
  // El orden va en la URL (es "qué datos", compartible). Columnas/densidad NO (presentación personal).
  if (!isDefaultSorts(state.sorts)) params.set("sorts", sortKeysToParam(state.sorts));
  return params;
}

/** Reconstruye el estado desde la URL (valores desconocidos caen al default). */
export function gridStateFromParams(params: URLSearchParams): LogbookGridState {
  const state: LogbookGridState = { ...DEFAULT_GRID_STATE };
  const nodes = params.get("orgNodeIds") ?? params.get("orgNodeId"); // back-compat deep-link
  if (nodes) state.orgNodeIds = nodes.split(",").map((s) => s.trim()).filter(Boolean);
  for (const key of [
    "q",
    "templateId",
    "equipmentId",
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
  for (const key of ["includeDescendants", "onlyMine", "pendingSignature", "exceptionsOnly"] as const) {
    const raw = params.get(key);
    if (raw !== null) state[key] = raw === "true";
  }

  const status = params.get("status");
  if (status === "DRAFT" || status === "SUBMITTED" || status === "VOID") state.status = status;
  const band = params.get("thresholdBand");
  if (band === "WARN" || band === "CRIT" || band === "ANY") state.thresholdBand = band;
  const origin = params.get("entryOrigin");
  if (origin === "ONLINE" || origin === "DEFERRED") state.entryOrigin = origin;
  // Multi-sort (2.8.1b) desde `sorts=campo:dir,…`; back-compat con `sort`+`dir` legacy.
  const sortsRaw = params.get("sorts");
  if (sortsRaw) {
    const parsed = sortKeysFromParam(sortsRaw);
    if (parsed.length) state.sorts = parsed;
  } else {
    const sort = params.get("sort");
    const dir = params.get("dir");
    if (sort === "recordedAt" || sort === "effectiveAt" || sort === "entryNumber") {
      state.sorts = [{ field: sort, dir: dir === "asc" ? "asc" : "desc" }];
    }
  }
  return state;
}

/** ¿Hay filtros activos (distintos del default), sin contar el orden? */
export function hasActiveFilters(state: LogbookGridState): boolean {
  if (state.orgNodeIds.length > 0) return true;
  for (const key of Object.keys(DEFAULT_GRID_STATE) as (keyof LogbookGridState)[]) {
    if (key === "sorts" || key === "includeDescendants" || key === "orgNodeIds") continue;
    if (state[key] !== DEFAULT_GRID_STATE[key]) return true;
  }
  return false;
}

/** Nº de filtros activos (para el badge de "Más filtros"). Cuenta cada criterio aplicado. */
export function activeFilterCount(state: LogbookGridState): number {
  let n = 0;
  if (state.orgNodeIds.length > 0) n += 1;
  for (const key of Object.keys(DEFAULT_GRID_STATE) as (keyof LogbookGridState)[]) {
    if (key === "sorts" || key === "includeDescendants" || key === "orgNodeIds") continue;
    if (state[key] !== DEFAULT_GRID_STATE[key]) n += 1;
  }
  return n;
}
