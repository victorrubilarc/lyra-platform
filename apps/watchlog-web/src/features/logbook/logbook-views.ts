import {
  LOG_ENTRY_SORT_FIELDS,
  type LogEntrySortField,
  type LogEntrySortKey,
  type SavedViewConfig,
  type SavedViewDensity,
  type SavedViewFilters,
} from "@lyra/contracts";
import type { TableColumnState } from "@lyra/ui";
import { DEFAULT_GRID_STATE, DEFAULT_SORTS, type LogbookGridState } from "./logbook-filters.js";

/**
 * Registro de columnas gestionables de la grilla de Bitácoras (Fase 2.8.1b). El
 * gestor de columnas y las vistas guardadas operan sobre estas claves. `locked` =
 * la columna no se oculta ni reordena (p. ej. la de acciones). `sortField` = la
 * columna es ordenable server-side (solo las indexadas; el resto NO, ver Fase 7).
 */
export interface ManagedColumn {
  key: string;
  labelKey: string;
  locked?: boolean;
  sortField?: LogEntrySortField;
}

export const LOGBOOK_COLUMNS: ManagedColumn[] = [
  { key: "entryNumber", labelKey: "logbook.list.folio", sortField: "entryNumber" },
  { key: "template", labelKey: "logbook.list.template" },
  { key: "node", labelKey: "logbook.list.node" },
  { key: "equipment", labelKey: "logbook.list.equipment" },
  { key: "summary", labelKey: "logbook.list.summary" },
  { key: "state", labelKey: "logbook.list.state" },
  { key: "delay", labelKey: "logbook.list.delay" },
  { key: "status", labelKey: "logbook.list.status" },
  { key: "shift", labelKey: "logbook.list.shift" },
  { key: "effectiveAt", labelKey: "logbook.list.effectiveAt", sortField: "effectiveAt" },
  { key: "recordedAt", labelKey: "logbook.list.recordedAt", sortField: "recordedAt" },
  { key: "author", labelKey: "logbook.list.author" },
  { key: "indicators", labelKey: "logbook.list.indicators" },
  { key: "actions", labelKey: "logbook.list.actionsCol", locked: true },
];

export const LOGBOOK_COLUMN_KEYS = LOGBOOK_COLUMNS.map((c) => c.key);

/** Columnas ocultas por defecto (densidad de info sin saturar; el usuario las activa). */
const DEFAULT_HIDDEN = ["shift", "author", "indicators", "delay"];

export const DEFAULT_COLUMN_STATE: Required<TableColumnState> = {
  order: LOGBOOK_COLUMN_KEYS,
  hidden: DEFAULT_HIDDEN,
  pinnedLeft: [],
  pinnedRight: [],
  widths: {},
};

export type LogbookDensity = SavedViewDensity;

function isSortField(v: string): v is LogEntrySortField {
  return (LOG_ENTRY_SORT_FIELDS as readonly string[]).includes(v);
}

/** Sanea claves de orden de una vista guardada a las columnas indexadas vigentes. */
export function sanitizeSorts(sort: { field: string; dir: "asc" | "desc" }[]): LogEntrySortKey[] {
  const seen = new Set<string>();
  const out: LogEntrySortKey[] = [];
  for (const k of sort) {
    if (isSortField(k.field) && !seen.has(k.field)) {
      out.push({ field: k.field, dir: k.dir });
      seen.add(k.field);
    }
  }
  return out.length ? out.slice(0, 3) : DEFAULT_SORTS;
}

/** Estado de grilla (filtros + orden) + presentación → config persistible de la vista. */
export function toViewConfig(
  state: LogbookGridState,
  columnState: TableColumnState,
  density: LogbookDensity,
): SavedViewConfig {
  const { sorts, ...filters } = state;
  return {
    filters: filters as unknown as SavedViewFilters,
    sort: sorts,
    columns: {
      order: columnState.order ?? DEFAULT_COLUMN_STATE.order,
      hidden: columnState.hidden ?? [],
      pinnedLeft: columnState.pinnedLeft ?? [],
      pinnedRight: columnState.pinnedRight ?? [],
      widths: columnState.widths ?? {},
    },
    density,
  };
}

/** Config de una vista → estado de grilla + presentación (saneado, con defaults). */
export function fromViewConfig(config: SavedViewConfig): {
  state: LogbookGridState;
  columnState: Required<TableColumnState>;
  density: LogbookDensity;
} {
  const f = config.filters as Partial<LogbookGridState>;
  const state: LogbookGridState = {
    ...DEFAULT_GRID_STATE,
    ...f,
    // Los arreglos vienen del JSON; aseguramos su forma.
    orgNodeIds: Array.isArray(f.orgNodeIds) ? f.orgNodeIds : [],
    sorts: sanitizeSorts(config.sort),
  };
  const c = config.columns;
  const columnState: Required<TableColumnState> = {
    order: c.order?.length ? c.order : DEFAULT_COLUMN_STATE.order,
    hidden: c.hidden ?? [],
    pinnedLeft: c.pinnedLeft ?? [],
    pinnedRight: c.pinnedRight ?? [],
    widths: c.widths ?? {},
  };
  return { state, columnState, density: config.density };
}

// --- Última vista (efímero en localStorage, por usuario-dispositivo) ----------
// La URL recuerda "qué datos" (filtros + orden, compartible). La presentación
// (columnas + densidad + vista activa) es personal y NO viaja en la URL.

interface LastViewMemo {
  viewId: string | null;
  columnState: Required<TableColumnState>;
  density: LogbookDensity;
}

const lastViewKey = (userId: string) => `logbook:lastview:${userId}`;

export function loadLastView(userId: string): LastViewMemo | null {
  try {
    const raw = localStorage.getItem(lastViewKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LastViewMemo>;
    if (!parsed.columnState || !parsed.density) return null;
    return {
      viewId: parsed.viewId ?? null,
      columnState: { ...DEFAULT_COLUMN_STATE, ...parsed.columnState },
      density: parsed.density,
    };
  } catch {
    return null;
  }
}

export function saveLastView(userId: string, memo: LastViewMemo): void {
  try {
    localStorage.setItem(lastViewKey(userId), JSON.stringify(memo));
  } catch {
    /* almacenamiento lleno / no disponible: la última vista es un lujo, no crítico */
  }
}
