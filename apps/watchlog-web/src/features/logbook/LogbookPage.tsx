import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlarmClock, BarChart3, BookOpenCheck, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Columns3, Download, FilterX, GitBranch, History, Lock, PenLine, RefreshCw, SlidersHorizontal, TriangleAlert } from "lucide-react";
import {
  Button,
  Checkbox,
  Chip,
  Combobox,
  Drawer,
  EmptyState,
  Input,
  MultiSelect,
  Select,
  Table,
  useToast,
  type ComboboxOption,
  type TableColumn,
  type TableColumnState,
  type TableSort,
} from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { useAuth } from "../../auth/use-auth.js";
import {
  evaluateSla,
  formatEntryFolio,
  LOG_ENTRY_SORT_FIELDS,
  type LogEntryListItem,
  type LogEntrySortField,
  type OrgNodeTree,
  type SavedViewDto,
  type SystemView,
} from "@lyra/contracts";
import { formatDateTime, formatDuration } from "../../lib/format.js";
import { ApiError } from "../../lib/api-client.js";
import { downloadBlob, fileStamp } from "../../lib/download.js";
import { useAccessibleOrgTree } from "../structure/structure-queries.js";
import { exportLogbookCsv, fetchMyShiftFilter } from "./logbook-api.js";
import { useLogbookFacets, useLogbookFilterTemplates, useLogbookList, useLogbookStats, useSavedViewMutations, useSavedViews } from "./logbook-queries.js";
import { formatSummaryValue } from "./logbook-cells.js";
import { FacetsPanel } from "./FacetsPanel.js";
import { PeekDrawer } from "./PeekDrawer.js";
import {
  activeFilterCount,
  DEFAULT_GRID_STATE,
  DEFAULT_SORTS,
  gridStateFromParams,
  gridStateToParams,
  hasActiveFilters,
  isoDay,
  toListQuery,
  type LogbookGridState,
} from "./logbook-filters.js";
import {
  DEFAULT_COLUMN_STATE,
  fromViewConfig,
  loadLastView,
  LOGBOOK_COLUMNS,
  saveLastView,
  toViewConfig,
  type LogbookDensity,
} from "./logbook-views.js";
import { useMyRoundsStats } from "../schedules/schedules-queries.js";
import { ColumnsDrawer, type ManagedColumnView } from "./ColumnsDrawer.js";
import { ViewBar } from "./ViewBar.js";
import { FlowModal } from "./FlowModal.js";
import styles from "./Logbook.module.css";

/** Comparación estable de configs (para el estado "modificada" de la vista). */
function canonicalConfig(c: ReturnType<typeof toViewConfig>): string {
  const sortObj = (o: Record<string, unknown>) =>
    Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return JSON.stringify({
    filters: sortObj(c.filters),
    sort: c.sort,
    columns: {
      order: c.columns.order,
      hidden: [...c.columns.hidden].sort(),
      pinnedLeft: c.columns.pinnedLeft,
      pinnedRight: c.columns.pinnedRight,
      widths: sortObj(c.columns.widths),
    },
    density: c.density,
  });
}

function isSortField(v: string): v is LogEntrySortField {
  return (LOG_ENTRY_SORT_FIELDS as readonly string[]).includes(v);
}

/** Aplana el árbol de estructura para el Combobox (sangría por nivel). */
function flattenTree(tree: OrgNodeTree[], depth = 0, out: ComboboxOption[] = []): ComboboxOption[] {
  for (const node of tree) {
    out.push({ value: node.id, label: `${"  ".repeat(depth)}${node.name}`, hint: node.code ?? undefined });
    flattenTree(node.children, depth + 1, out);
  }
  return out;
}


/** Números de página compactos con elipsis (1 … 4 5 [6] 7 8 … 20). */
function pageNumbers(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const from = Math.max(2, current - 1);
  const to = Math.min(total - 1, current + 1);
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
}

/** Chip del estado del flujo con el COLOR de la versión congelada. */
function StateChip({ row }: { row: LogEntryListItem }) {
  if (!row.currentStateKey) return <span className={styles.cellSub}>—</span>;
  const color = row.currentStateColor ?? "var(--color-accent, #6366f1)";
  return (
    <span
      className={styles.stateChip}
      style={{ color, borderColor: `color-mix(in srgb, ${color} 45%, transparent)`, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <span className={styles.stateDot} />
      {row.currentStateName ?? row.currentStateKey}
    </span>
  );
}

/**
 * Indicador de ATRASO (Workflow SLA): si el registro está en curso (DRAFT) y el tiempo en
 * su estado actual superó (rojo) o se acerca (ámbar) al SLA de permanencia. Mismo veredicto
 * que el diagrama (`evaluateSla`). Duraciones con lib/format (regional). `compact` = solo el
 * ícono + antigüedad (celda de estado); completo = "En {estado} hace {X} · SLA {Y}" (columna).
 */
function DelayBadge({ row, compact }: { row: LogEntryListItem; compact?: boolean }) {
  const { t } = useTranslation();
  if (row.status !== "DRAFT" || !row.currentStateSince) return compact ? null : <span className={styles.cellSub}>—</span>;
  const sla = evaluateSla(new Date(row.currentStateSince).getTime(), row.currentStateMaxStayMinutes, Date.now());
  if (sla.status === "ok") return compact ? null : <span className={styles.cellSub}>—</span>;
  const breached = sla.status === "breached";
  const slaText = row.currentStateMaxStayMinutes ? formatDuration(row.currentStateMaxStayMinutes * 60000) : "";
  const full = breached
    ? t("logbook.delay.breached", { state: row.currentStateName ?? "", d: formatDuration(sla.elapsedMs), sla: slaText })
    : t("logbook.delay.atRisk", { state: row.currentStateName ?? "", d: formatDuration(sla.elapsedMs), sla: slaText });
  return (
    <span
      className={`${styles.delayBadge} ${breached ? styles.delayBreached : styles.delayAtRisk}`}
      title={full}
    >
      {breached ? <TriangleAlert size={12} /> : <AlarmClock size={12} />}
      {compact ? formatDuration(sla.elapsedMs) : full}
    </span>
  );
}

/**
 * Celda "Resumen" (2.8.1a): línea compuesta con los valores de negocio que la plantilla
 * marcó como candidatos (`gridFieldKeys`, pool acotado a 6). Hace reconocible el registro
 * sin abrirlo. Se muestran TODOS los candidatos con valor (el diseñador marca el pool; la
 * elección/orden por usuario llega en 2.8.1b). Resalta la banda ISA-18.2 (WARN/CRIT).
 */
function SummaryCell({ row }: { row: LogEntryListItem }) {
  const values = row.summaryValues;
  if (values.length === 0) return <span className={styles.cellSub}>—</span>;
  return (
    <div className={styles.summaryLine}>
      {values.map((sv) => (
        <span
          key={sv.fieldKey}
          className={
            sv.thresholdBand === "CRIT"
              ? `${styles.summaryItem} ${styles.summaryCrit}`
              : sv.thresholdBand === "WARN"
                ? `${styles.summaryItem} ${styles.summaryWarn}`
                : styles.summaryItem
          }
          title={`${sv.label}: ${formatSummaryValue(sv)}`}
        >
          <span className={styles.summaryLabel}>{sv.label}</span>
          <strong>{formatSummaryValue(sv)}</strong>
        </span>
      ))}
    </div>
  );
}

/** Indicadores de review-by-exception de una fila. */
function Indicators({ row }: { row: LogEntryListItem }) {
  const { t } = useTranslation();
  const ind = row.indicators;
  return (
    <span className={styles.indicators}>
      {row.entryOrigin === "DEFERRED" && (
        <span className={`${styles.indicator} ${styles.indicatorWarn}`} title={row.deferredReason ?? t("logbook.list.deferredHint")}>
          <History size={12} /> {t("logbook.origin.DEFERRED")}
        </span>
      )}
      <span className={styles.indicator} title={t("logbook.list.sectionsHint")}>
        {ind.sectionsCompleted}/{ind.sectionsTotal}
      </span>
      {ind.pendingSignatures > 0 && (
        <span className={`${styles.indicator} ${styles.indicatorWarn}`} title={t("logbook.list.pendingSignaturesHint")}>
          <PenLine size={12} /> {ind.pendingSignatures}
        </span>
      )}
      {ind.sectionsLocked > 0 && (
        <span className={styles.indicator} title={t("logbook.list.lockedHint")}>
          <Lock size={12} /> {ind.sectionsLocked}
        </span>
      )}
      {ind.transitionsCount > 0 && (
        <span className={styles.indicator} title={t("logbook.list.transitionsHint")}>
          <GitBranch size={12} /> {ind.transitionsCount}
        </span>
      )}
      {ind.worstThresholdBand && (
        <span
          className={`${styles.indicator} ${ind.worstThresholdBand === "CRIT" ? styles.indicatorCrit : styles.indicatorWarn}`}
          title={t("logbook.list.thresholdHint")}
        >
          <TriangleAlert size={12} /> {t(`logbook.band.${ind.worstThresholdBand}`)}
        </span>
      )}
    </span>
  );
}

export function LogbookPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const { can } = usePermissions();
  // Badge de rondas vencidas (2.3.1): atajo al worklist PROPIO ("Mis rondas") sin
  // salir de Bitácoras. Es preocupación del OPERADOR (sus rondas), no del planificador.
  const roundStats = useMyRoundsStats(can("round:execute"));
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [searchParams, setSearchParams] = useSearchParams();

  // La URL es la fuente de verdad de los FILTROS/ORDEN de la grilla (deep-link).
  const [state, setState] = useState<LogbookGridState>(() => gridStateFromParams(searchParams));
  const [qInput, setQInput] = useState(state.q);
  const [exporting, setExporting] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [facetsOpen, setFacetsOpen] = useState(false);
  const [peekRow, setPeekRow] = useState<LogEntryListItem | null>(null);
  const [flowEntryId, setFlowEntryId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Presentación (columnas + densidad): personal, NO viaja en la URL. Se restaura
  // de la última vista (localStorage) o cae a los defaults.
  const memo = useMemo(() => (userId ? loadLastView(userId) : null), [userId]);
  const [columnState, setColumnState] = useState<Required<TableColumnState>>(() => memo?.columnState ?? { ...DEFAULT_COLUMN_STATE });
  const [density, setDensity] = useState<LogbookDensity>(() => memo?.density ?? "comfortable");
  const [activeViewId, setActiveViewId] = useState<string | null>(() => memo?.viewId ?? null);

  // Vistas guardadas (preferencia personal del usuario para el módulo Bitácoras).
  const savedViews = useSavedViews("LOGBOOK");
  const viewMutations = useSavedViewMutations("LOGBOOK");
  const views = savedViews.data ?? [];
  const initializedRef = useRef(false);

  // Debounce de la búsqueda (400 ms).
  useEffect(() => {
    const handle = setTimeout(() => setState((s) => (s.q === qInput ? s : { ...s, q: qInput })), 400);
    return () => clearTimeout(handle);
  }, [qInput]);

  // Refleja el estado en la URL (replace: no ensucia el historial con cada tecla).
  useEffect(() => {
    setSearchParams(gridStateToParams(state), { replace: true });
  }, [state, setSearchParams]);

  const query = useMemo(() => toListQuery(state, userId), [state, userId]);
  const list = useLogbookList(query);
  const stats = useLogbookStats(query);
  const facets = useLogbookFacets(query, facetsOpen);

  // Al cambiar filtros/orden, vuelve a la página 1.
  useEffect(() => {
    setPage(1);
  }, [query]);
  const { data: tree } = useAccessibleOrgTree();
  const { data: templates } = useLogbookFilterTemplates();

  const rows = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const nodeOptions = useMemo(() => (tree ? flattenTree(tree) : []), [tree]);
  const templateOptions = useMemo<ComboboxOption[]>(
    () => (templates ?? []).map((tp) => ({ value: tp.id, label: tp.name })),
    [templates],
  );
  // Estados del flujo presentes en el set cargado (las facetas exactas llegan en 2.6.2).
  const stateOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) {
      if (row.currentStateKey) seen.set(row.currentStateKey, row.currentStateName ?? row.currentStateKey);
    }
    if (state.stateKey && !seen.has(state.stateKey)) seen.set(state.stateKey, state.stateKey);
    return [...seen.entries()];
  }, [rows, state.stateKey]);

  const patch = (partial: Partial<LogbookGridState>) => setState((s) => ({ ...s, ...partial }));
  const clearFilters = () => {
    setQInput("");
    setState((s) => ({ ...DEFAULT_GRID_STATE, sorts: s.sorts }));
  };

  // --- Vistas guardadas: estado activo, dirty y aplicación ---
  const currentConfig = useMemo(() => toViewConfig(state, columnState, density), [state, columnState, density]);
  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  // Ambos lados nacen de toViewConfig (estado completo) ⇒ comparación apples-to-apples.
  const dirty = activeView ? canonicalConfig(currentConfig) !== canonicalConfig(activeView.config) : false;

  // Persiste la "última vista" (presentación personal) por usuario-dispositivo.
  useEffect(() => {
    if (userId) saveLastView(userId, { viewId: activeViewId, columnState, density });
  }, [userId, activeViewId, columnState, density]);

  // Primera carga sin deep-link ni memoria: aplica la vista DEFAULT si existe.
  useEffect(() => {
    if (initializedRef.current || savedViews.isLoading) return;
    initializedRef.current = true;
    if (memo || hasActiveFilters(state)) return; // respeta deep-link / última sesión
    const def = views.find((v) => v.isDefault);
    if (def) applyView(def);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedViews.isLoading]);

  function applyView(view: SavedViewDto) {
    const { state: s, columnState: cs, density: d } = fromViewConfig(view.config);
    setState(s);
    setQInput(s.q);
    setColumnState(cs);
    setDensity(d);
    setActiveViewId(view.id);
  }
  async function applySystem(view: SystemView) {
    // Las vistas de sistema solo fijan FILTROS; la presentación es personal (se conserva).
    const next: LogbookGridState = { ...DEFAULT_GRID_STATE, sorts: DEFAULT_SORTS };
    for (const [k, v] of Object.entries(view.filters)) {
      if (k === "__preset" && v === "effective24h") {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - 1);
        next.effectiveFromDay = isoDay(from);
        next.effectiveToDay = isoDay(to);
      } else if (k === "__preset" && v === "myShift") {
        // "Mi turno": el backend resuelve el turno/día vigentes + autor.
        try {
          const f = await fetchMyShiftFilter();
          next.onlyMine = true;
          next.operationalDate = f.operationalDate;
          if (f.shiftCode) next.shiftCode = f.shiftCode;
        } catch {
          next.onlyMine = true; // degradación: al menos "mías"
        }
      } else if (k in next) {
        // Asignación tolerante (los valores provienen del contrato de la vista de sistema).
        (next as unknown as Record<string, unknown>)[k] = v;
      }
    }
    setState(next);
    setQInput(next.q);
    setActiveViewId(view.id);
  }

  // Clic en un valor de faceta = toggle del filtro correspondiente (URL/SavedView).
  function toggleFacet(dim: "status" | "state" | "template" | "equipment" | "band", value: string) {
    switch (dim) {
      case "status":
        return patch({ status: state.status === value ? "" : (value as LogbookGridState["status"]) });
      case "state":
        return patch({ stateKey: state.stateKey === value ? "" : value });
      case "template":
        return patch({ templateId: state.templateId === value ? "" : value });
      case "equipment":
        return patch({ equipmentId: state.equipmentId === value ? "" : value });
      case "band":
        return patch({ thresholdBand: state.thresholdBand === value ? "" : (value as LogbookGridState["thresholdBand"]) });
    }
  }
  function applyDefault() {
    setState({ ...DEFAULT_GRID_STATE });
    setQInput("");
    setActiveViewId(null);
  }
  async function handleSaveAs(name: string, isDefault: boolean) {
    try {
      const created = await viewMutations.create.mutateAsync({ module: "LOGBOOK", name, config: currentConfig, isDefault });
      setActiveViewId(created.id);
      toast.success(t("logbook.views.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }
  async function handleUpdateActive() {
    if (!activeView) return;
    try {
      await viewMutations.update.mutateAsync({ id: activeView.id, body: { config: currentConfig } });
      toast.success(t("logbook.views.updated"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }
  async function handleToggleDefault(view: SavedViewDto) {
    try {
      await viewMutations.update.mutateAsync({ id: view.id, body: { isDefault: !view.isDefault } });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }
  async function handleDeleteView(view: SavedViewDto) {
    try {
      await viewMutations.remove.mutateAsync(view.id);
      if (activeViewId === view.id) setActiveViewId(null);
      toast.success(t("logbook.views.deleted"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }
  const viewBusy = viewMutations.create.isPending || viewMutations.update.isPending || viewMutations.remove.isPending;

  // Multi-sort para el Table (key = sortField de las columnas indexadas).
  const tableSorts: TableSort[] = state.sorts.map((s) => ({ key: s.field, direction: s.dir }));

  // Columnas de VALOR por plantilla (2.8.1b): solo con UNA plantilla filtrada las claves
  // son homogéneas ⇒ se ofrecen los campos candidatos como columnas individuales. Con 0 o
  // ≥2 plantillas cae a la línea "Resumen" (patrón Fiori smart columns).
  const singleTemplate = Boolean(state.templateId);
  const valueFields = useMemo<{ key: string; label: string }[]>(() => {
    if (!singleTemplate) return [];
    const seen = new Map<string, string>();
    for (const r of rows) for (const sv of r.summaryValues) if (!seen.has(sv.fieldKey)) seen.set(sv.fieldKey, sv.label);
    return [...seen.entries()].map(([fieldKey, label]) => ({ key: `val:${fieldKey}`, label }));
  }, [singleTemplate, rows]);

  // Columnas gestionables que ve el panel "Columnas" (base i18n + valor de la plantilla).
  const managedColumns = useMemo<ManagedColumnView[]>(
    () => [
      ...LOGBOOK_COLUMNS.map((c) => ({ key: c.key, label: t(c.labelKey), locked: c.locked, sortField: c.sortField })),
      ...valueFields,
    ],
    [t, valueFields],
  );

  // Estado de columnas EFECTIVO: las columnas de valor aún no fijadas se muestran por
  // defecto (se materializan al primer cambio en el panel). NO afecta el "dirty" (que
  // compara el estado PERSISTIDO con la vista).
  const effectiveColumnState = useMemo<Required<TableColumnState>>(() => {
    if (valueFields.length === 0) return columnState;
    const known = new Set([...columnState.order, ...columnState.hidden]);
    const appended = valueFields.map((v) => v.key).filter((k) => !known.has(k));
    return appended.length ? { ...columnState, order: [...columnState.order, ...appended] } : columnState;
  }, [columnState, valueFields]);

  const refreshing = list.isRefetching || stats.isRefetching;
  const doRefresh = () => {
    void list.refetch();
    void stats.refetch();
  };
  const filterCount = activeFilterCount(state);

  // Paginador DISCRETO (arriba y abajo). Pagina en el cliente el lote keyset cargado;
  // "siguiente" en la última página trae el lote siguiente del servidor si lo hay.
  const serverTotal = stats.data?.total ?? rows.length;
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pages);
  const startIndex = (safePage - 1) * pageSize;
  const visibleRows = rows.slice(startIndex, startIndex + pageSize);
  const rangeFrom = rows.length === 0 ? 0 : startIndex + 1;
  const rangeTo = Math.min(startIndex + pageSize, rows.length);
  const goNext = () => {
    if (safePage < pages) setPage(safePage + 1);
    else if (list.hasNextPage) {
      void list.fetchNextPage();
      setPage(safePage + 1);
    }
  };
  const nextDisabled = safePage >= pages && !list.hasNextPage;

  const paginationBar =
    rows.length > 0 ? (
      <div className={styles.pageBar}>
        <span className={styles.pageInfo}>{t("logbook.list.showingRange", { from: rangeFrom, to: rangeTo, total: serverTotal })}</span>
        <div className={styles.pager}>
          <select
            className={styles.pageSizeSelect}
            value={pageSize}
            aria-label={t("logbook.list.perPage")}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
          >
            {[10, 25, 50].map((s) => (
              <option key={s} value={s}>
                {t("logbook.list.perPageN", { count: s })}
              </option>
            ))}
          </select>
          <button type="button" className={styles.pagerBtn} disabled={safePage <= 1} onClick={() => setPage(1)} aria-label={t("logbook.list.first")}>
            <ChevronsLeft size={16} />
          </button>
          <button type="button" className={styles.pagerBtn} disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} aria-label={t("common.previous")}>
            <ChevronLeft size={16} />
          </button>
          {pageNumbers(safePage, pages).map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className={styles.pagerEllipsis}>
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                className={n === safePage ? `${styles.pagerBtn} ${styles.pagerBtnActive}` : styles.pagerBtn}
                aria-current={n === safePage ? "page" : undefined}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ),
          )}
          <button type="button" className={styles.pagerBtn} disabled={nextDisabled} onClick={goNext} aria-label={t("common.next")}>
            {list.isFetchingNextPage ? "…" : <ChevronRight size={16} />}
          </button>
          <button type="button" className={styles.pagerBtn} disabled={safePage >= pages} onClick={() => setPage(pages)} aria-label={t("logbook.list.last")}>
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>
    ) : null;

  function presetEffectiveDays(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    patch({ effectiveFromDay: isoDay(from), effectiveToDay: isoDay(to), operationalDate: "" });
  }

  async function doExport() {
    setExporting(true);
    try {
      const blob = await exportLogbookCsv(query);
      downloadBlob(`bitacoras-${fileStamp()}.csv`, blob);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setExporting(false);
    }
  }

  if (!can("logentry:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={30} />} title={t("logbook.noAccess")} description={t("logbook.noAccessDesc")} />
      </div>
    );
  }

  const columns: TableColumn<LogEntryListItem>[] = [
    {
      key: "entryNumber",
      header: t("logbook.list.folio"),
      sortable: true,
      width: 110,
      render: (r) => <span className={styles.folio}>{formatEntryFolio(r.entryNumber)}</span>,
    },
    {
      key: "template",
      header: t("logbook.list.template"),
      render: (r) => (
        <div>
          <div className={styles.cellMain}>{r.templateName}</div>
          <div className={styles.cellSub}>v{r.templateVersionNumber}</div>
        </div>
      ),
    },
    {
      key: "node",
      header: t("logbook.list.node"),
      render: (r) => (
        <div title={r.orgNodePath ?? undefined}>
          <div className={styles.cellMain}>{r.orgNodeName}</div>
        </div>
      ),
    },
    {
      // Equipo (objeto de referencia EAM): tag estable (asset num) + nombre.
      key: "equipment",
      header: t("logbook.list.equipment"),
      render: (r) =>
        r.equipmentName || r.equipmentTag ? (
          <div title={r.equipmentName ?? undefined}>
            {r.equipmentTag && <div className={styles.cellMain}>{r.equipmentTag}</div>}
            {r.equipmentName && <div className={r.equipmentTag ? styles.cellSub : styles.cellMain}>{r.equipmentName}</div>}
          </div>
        ) : (
          <span className={styles.cellSub}>—</span>
        ),
    },
    {
      // Resumen de contenido (2.8.1a): valores de negocio para reconocer el registro.
      key: "summary",
      header: t("logbook.list.summary"),
      width: 340, // ancho por defecto; redimensionable (el contenido sigue el ancho)
      render: (r) => <SummaryCell row={r} />,
    },
    {
      key: "state",
      header: t("logbook.list.state"),
      render: (r) => (
        <div className={styles.stateCell}>
          <StateChip row={r} />
          <DelayBadge row={r} compact />
        </div>
      ),
    },
    {
      // Atraso (Workflow SLA): texto completo "En {estado} hace {X} · SLA {Y}". Oculta por
      // defecto (el badge compacto en la celda de estado ya da la señal); el usuario la activa.
      key: "delay",
      header: t("logbook.list.delay"),
      width: 220,
      render: (r) => <DelayBadge row={r} />,
    },
    {
      key: "status",
      header: t("logbook.list.status"),
      width: 110,
      render: (r) => (
        <Chip
          variant={r.status === "SUBMITTED" ? "success" : r.status === "VOID" ? "default" : "warning"}
          label={t(`logbook.status.${r.status}`)}
        />
      ),
    },
    {
      key: "shift",
      header: t("logbook.list.shift"),
      width: 120,
      render: (r) => (
        <div>
          <div className={styles.cellMain}>{r.shiftCode ?? "—"}</div>
          {r.operationalDate && <div className={styles.cellSub}>{r.operationalDate}</div>}
        </div>
      ),
    },
    {
      key: "effectiveAt",
      header: t("logbook.list.effectiveAt"),
      sortable: true,
      width: 140,
      render: (r) => <span className={styles.mono}>{formatDateTime(r.effectiveAt)}</span>,
    },
    {
      key: "recordedAt",
      header: t("logbook.list.recordedAt"),
      sortable: true,
      width: 140,
      render: (r) => <span className={styles.mono}>{formatDateTime(r.recordedAt)}</span>,
    },
    {
      key: "author",
      header: t("logbook.list.author"),
      render: (r) => <span>{r.createdByName ?? "—"}</span>,
    },
    { key: "indicators", header: t("logbook.list.indicators"), render: (r) => <Indicators row={r} /> },
    {
      // Acción: abrir para EDITAR (llenado/avance de flujo). Solo en registros aún
      // en curso (DRAFT) y si el usuario puede llenar; el clic en la fila sigue
      // abriendo el visor de lectura. El backend reaplica la autorización por sección.
      key: "actions",
      header: "",
      width: 104,
      align: "right",
      render: (r) => (
        <div className={styles.rowActions}>
          {r.currentStateName && (
            <Button
              variant="icon"
              aria-label={t("logbook.peek.viewFlow")}
              title={t("logbook.peek.viewFlow")}
              onClick={(e) => {
                e.stopPropagation();
                setFlowEntryId(r.id);
              }}
            >
              <GitBranch size={15} />
            </Button>
          )}
          {can("logentry:fill") && r.status === "DRAFT" && (
            <Button
              variant="icon"
              aria-label={t("logbook.list.editEntry")}
              title={t("logbook.list.editEntry")}
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/bitacoras/${r.id}/editar`);
              }}
            >
              <PenLine size={15} />
            </Button>
          )}
        </div>
      ),
    },
  ];

  // Columnas de VALOR (una por campo candidato de la plantilla filtrada). El render
  // busca el valor de ese campo en `summaryValues` y aplica el formato regional + banda.
  const valueColumns: TableColumn<LogEntryListItem>[] = valueFields.map((vf) => {
    const fieldKey = vf.key.slice(4); // quita "val:"
    return {
      key: vf.key,
      header: vf.label,
      width: 220, // ancho por defecto; el usuario lo redimensiona (el texto reflowea)
      render: (r: LogEntryListItem) => {
        const sv = r.summaryValues.find((x) => x.fieldKey === fieldKey);
        if (!sv) return <span className={styles.cellSub}>—</span>;
        const text = formatSummaryValue(sv);
        // Texto largo (TEXTAREA) acotado a 3 líneas con ellipsis, respetando el ancho de
        // la columna ⇒ al redimensionar reflowea. Valor completo en el tooltip.
        const band = sv.thresholdBand === "CRIT" ? styles.valCrit : sv.thresholdBand === "WARN" ? styles.valWarn : "";
        return (
          <div className={`${styles.valueCell} ${band}`} title={text}>
            {text}
          </div>
        );
      },
    };
  });
  const allColumns = [...columns, ...valueColumns];

  const activeChips: { key: string; label: string; clear: () => void }[] = [];
  if (state.q) activeChips.push({ key: "q", label: `${t("logbook.filters.search")}: ${state.q}`, clear: () => { setQInput(""); patch({ q: "" }); } });
  if (state.templateId) {
    const name = templateOptions.find((o) => o.value === state.templateId)?.label ?? state.templateId;
    activeChips.push({ key: "template", label: `${t("logbook.list.template")}: ${name}`, clear: () => patch({ templateId: "" }) });
  }
  if (state.orgNodeIds.length > 0) {
    const names = state.orgNodeIds.map((id) => nodeOptions.find((o) => o.value === id)?.label.trim() ?? id);
    const label = names.length === 1 ? names[0] : t("logbook.filters.nodesCount", { count: names.length });
    activeChips.push({ key: "node", label: `${t("logbook.list.node")}: ${label}`, clear: () => patch({ orgNodeIds: [] }) });
  }
  if (state.status) activeChips.push({ key: "status", label: t(`logbook.status.${state.status}`), clear: () => patch({ status: "" }) });
  if (state.stateKey) {
    const name = stateOptions.find(([k]) => k === state.stateKey)?.[1] ?? state.stateKey;
    activeChips.push({ key: "stateKey", label: `${t("logbook.list.state")}: ${name}`, clear: () => patch({ stateKey: "" }) });
  }
  if (state.shiftCode) activeChips.push({ key: "shift", label: `${t("logbook.list.shift")}: ${state.shiftCode}`, clear: () => patch({ shiftCode: "" }) });
  if (state.periodKey) activeChips.push({ key: "period", label: `${t("logbook.filters.period")}: ${state.periodKey}`, clear: () => patch({ periodKey: "" }) });
  if (state.operationalDate) activeChips.push({ key: "opDate", label: `${t("logbook.filters.operationalDate")}: ${state.operationalDate}`, clear: () => patch({ operationalDate: "" }) });
  if (state.effectiveFromDay || state.effectiveToDay) {
    activeChips.push({
      key: "effective",
      label: `${t("logbook.list.effectiveAt")}: ${state.effectiveFromDay || "…"} → ${state.effectiveToDay || "…"}`,
      clear: () => patch({ effectiveFromDay: "", effectiveToDay: "" }),
    });
  }
  if (state.recordedFromDay || state.recordedToDay) {
    activeChips.push({
      key: "recorded",
      label: `${t("logbook.list.recordedAt")}: ${state.recordedFromDay || "…"} → ${state.recordedToDay || "…"}`,
      clear: () => patch({ recordedFromDay: "", recordedToDay: "" }),
    });
  }
  if (state.equipmentId) {
    const label = facets.data?.equipment.find((b) => b.value === state.equipmentId)?.label ?? state.equipmentId;
    activeChips.push({ key: "equipment", label: `${t("logbook.list.equipment")}: ${label}`, clear: () => patch({ equipmentId: "" }) });
  }
  if (state.onlyMine) activeChips.push({ key: "mine", label: t("logbook.filters.onlyMine"), clear: () => patch({ onlyMine: false }) });
  if (state.pendingSignature) activeChips.push({ key: "pending", label: t("logbook.filters.pendingSignature"), clear: () => patch({ pendingSignature: false }) });
  if (state.exceptionsOnly) activeChips.push({ key: "exceptions", label: t("logbook.filters.exceptionsOnly"), clear: () => patch({ exceptionsOnly: false }) });
  if (state.delayedOnly) activeChips.push({ key: "delayed", label: t("logbook.filters.delayedOnly"), clear: () => patch({ delayedOnly: false }) });
  if (state.thresholdBand) activeChips.push({ key: "band", label: t(`logbook.bandFilter.${state.thresholdBand}`), clear: () => patch({ thresholdBand: "" }) });
  if (state.entryOrigin) activeChips.push({ key: "origin", label: t(`logbook.origin.${state.entryOrigin}`), clear: () => patch({ entryOrigin: "" }) });

  return (
    <div className={styles.page} data-fill-height>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {t("logbook.list.title")} <span className={styles.accent}>{t("logbook.list.titleAccent")}</span>
          </h1>
          <p className={styles.subtitle}>{t("logbook.list.subtitle")}</p>
          {can("round:execute") && (roundStats.data?.overdue ?? 0) > 0 && (
            <button type="button" className={styles.roundsAlert} onClick={() => navigate("/mis-rondas")}>
              <AlarmClock size={14} /> {roundStats.data!.overdue} ronda{roundStats.data!.overdue === 1 ? "" : "s"} vencida{roundStats.data!.overdue === 1 ? "" : "s"} — ver mis rondas
            </button>
          )}
        </div>
        <div className={styles.headerActions}>
          <ViewBar
            views={views}
            activeViewId={activeViewId}
            dirty={dirty}
            busy={viewBusy}
            onApplyView={applyView}
            onApplySystem={applySystem}
            onApplyDefault={applyDefault}
            onSaveAs={handleSaveAs}
            onUpdateActive={handleUpdateActive}
            onToggleDefault={handleToggleDefault}
            onDelete={handleDeleteView}
          />
          <Button
            variant="secondary"
            leftIcon={<BarChart3 size={16} />}
            onClick={() => setFacetsOpen((o) => !o)}
            aria-pressed={facetsOpen}
          >
            {t("logbook.facets.button")}
          </Button>
          <Button variant="secondary" leftIcon={<Columns3 size={16} />} onClick={() => setColumnsOpen(true)}>
            {t("logbook.columns.button")}
          </Button>
          <Button
            variant="icon"
            aria-label={t("logbook.list.refresh")}
            title={t("logbook.list.refresh")}
            onClick={doRefresh}
          >
            <RefreshCw size={16} className={refreshing ? styles.spin : undefined} />
          </Button>
          <Button variant="primary" leftIcon={<Download size={16} />} loading={exporting} onClick={doExport}>
            {t("common.export")}
          </Button>
        </div>
      </div>

      <ColumnsDrawer
        open={columnsOpen}
        onClose={() => setColumnsOpen(false)}
        columns={managedColumns}
        columnState={effectiveColumnState}
        onColumnStateChange={setColumnState}
        density={density}
        onDensityChange={setDensity}
        sorts={state.sorts}
        onSortsChange={(s) => patch({ sorts: s })}
      />

      {/* KPIs del set filtrado (clic = filtro rápido, review by exception) */}
      <div className={styles.kpis}>
        <button type="button" className={styles.kpi} disabled>
          <span className={styles.kpiValue}>{stats.data?.total ?? "—"}</span>
          <span className={styles.kpiLabel}>{t("logbook.kpi.total")}</span>
        </button>
        <button
          type="button"
          className={`${styles.kpi} ${state.status === "DRAFT" ? styles.kpiActive : ""}`}
          onClick={() => patch({ status: state.status === "DRAFT" ? "" : "DRAFT" })}
        >
          <span className={styles.kpiValue}>{stats.data?.byStatus.DRAFT ?? "—"}</span>
          <span className={styles.kpiLabel}>{t("logbook.kpi.inProgress")}</span>
        </button>
        <button
          type="button"
          className={`${styles.kpi} ${styles.kpiOk} ${state.status === "SUBMITTED" ? styles.kpiActive : ""}`}
          onClick={() => patch({ status: state.status === "SUBMITTED" ? "" : "SUBMITTED" })}
        >
          <span className={styles.kpiValue}>{stats.data?.byStatus.SUBMITTED ?? "—"}</span>
          <span className={styles.kpiLabel}>{t("logbook.kpi.submitted")}</span>
        </button>
        <button
          type="button"
          className={`${styles.kpi} ${styles.kpiWarn} ${state.pendingSignature ? styles.kpiActive : ""}`}
          onClick={() => patch({ pendingSignature: !state.pendingSignature })}
        >
          <span className={styles.kpiValue}>{stats.data?.pendingSignatures ?? "—"}</span>
          <span className={styles.kpiLabel}>{t("logbook.kpi.pendingSignatures")}</span>
        </button>
        <button
          type="button"
          className={`${styles.kpi} ${styles.kpiCrit} ${state.thresholdBand === "ANY" ? styles.kpiActive : ""}`}
          onClick={() => patch({ thresholdBand: state.thresholdBand === "ANY" ? "" : "ANY" })}
        >
          <span className={styles.kpiValue}>
            {stats.data ? stats.data.withCrit + stats.data.withWarn : "—"}
          </span>
          <span className={styles.kpiLabel}>{t("logbook.kpi.exceptions")}</span>
        </button>
        <button
          type="button"
          className={`${styles.kpi} ${styles.kpiCrit} ${state.delayedOnly ? styles.kpiActive : ""}`}
          onClick={() => patch({ delayedOnly: !state.delayedOnly })}
        >
          <span className={styles.kpiValue}>{stats.data?.delayed ?? "—"}</span>
          <span className={styles.kpiLabel}>{t("logbook.kpi.delayed")}</span>
        </button>
      </div>

      {/* Barra de filtros PRIMARIA (los de mayor uso) + acceso a "Más filtros" */}
      <div className={styles.filterBar}>
        <label className={`${styles.filterField} ${styles.filterFieldWide}`}>
          <span className={styles.filterLabel}>{t("logbook.filters.search")}</span>
          <Input value={qInput} placeholder={t("logbook.filters.searchPlaceholder")} onChange={(e) => setQInput(e.target.value)} />
        </label>
        <label className={`${styles.filterField} ${styles.filterFieldWide}`}>
          <span className={styles.filterLabel}>{t("logbook.list.node")}</span>
          <MultiSelect
            options={nodeOptions}
            value={state.orgNodeIds}
            onChange={(v) => patch({ orgNodeIds: v })}
            placeholder={t("logbook.filters.allNodes")}
          />
        </label>
        <label className={`${styles.filterField} ${styles.filterFieldWide}`}>
          <span className={styles.filterLabel}>{t("logbook.list.template")}</span>
          <Combobox
            options={templateOptions}
            value={state.templateId || null}
            onChange={(v) => patch({ templateId: v })}
            clearable
            placeholder={t("logbook.filters.allTemplates")}
          />
        </label>
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>{t("logbook.list.status")}</span>
          <Select value={state.status} onChange={(e) => patch({ status: e.target.value as LogbookGridState["status"] })}>
            <option value="">{t("logbook.filters.all")}</option>
            <option value="DRAFT">{t("logbook.status.DRAFT")}</option>
            <option value="SUBMITTED">{t("logbook.status.SUBMITTED")}</option>
            <option value="VOID">{t("logbook.status.VOID")}</option>
          </Select>
        </label>
        <div className={styles.filterBarActions}>
          <Button variant="secondary" leftIcon={<SlidersHorizontal size={16} />} onClick={() => setFiltersOpen(true)}>
            {t("logbook.filters.more")}
            {filterCount > 0 && <span className={styles.filterBadge}>{filterCount}</span>}
          </Button>
          <div className={styles.presets}>
            <button type="button" className={styles.presetBtn} onClick={() => patch({ operationalDate: isoDay(new Date()), effectiveFromDay: "", effectiveToDay: "" })}>
              {t("logbook.presets.today")}
            </button>
            <button type="button" className={styles.presetBtn} onClick={() => presetEffectiveDays(1)}>24h</button>
            <button type="button" className={styles.presetBtn} onClick={() => presetEffectiveDays(7)}>7d</button>
            <button type="button" className={styles.presetBtn} onClick={() => presetEffectiveDays(30)}>30d</button>
          </div>
        </div>
      </div>

      {/* Filtros AVANZADOS en un panel lateral (se aplican en vivo; el backend manda) */}
      <Drawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title={t("logbook.filters.more")}
        footer={
          <div className={styles.drawerFooter}>
            <Button variant="secondary" leftIcon={<FilterX size={14} />} onClick={clearFilters}>
              {t("logbook.filters.clear")}
            </Button>
            <Button variant="primary" onClick={() => setFiltersOpen(false)}>
              {t("logbook.filters.applyClose")}
            </Button>
          </div>
        }
      >
        <div className={styles.drawerFilters}>
          {stateOptions.length > 0 && (
            <label className={styles.filterField}>
              <span className={styles.filterLabel}>{t("logbook.list.state")}</span>
              <Select value={state.stateKey} onChange={(e) => patch({ stateKey: e.target.value })}>
                <option value="">{t("logbook.filters.all")}</option>
                {stateOptions.map(([key, name]) => (
                  <option key={key} value={key}>
                    {name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t("logbook.filters.shift")}</span>
            <Input value={state.shiftCode} placeholder={t("logbook.filters.shiftPlaceholder")} onChange={(e) => patch({ shiftCode: e.target.value })} />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t("logbook.filters.operationalDate")}</span>
            <Input type="date" value={state.operationalDate} onChange={(e) => patch({ operationalDate: e.target.value })} />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t("logbook.filters.effectiveFrom")}</span>
            <Input type="date" value={state.effectiveFromDay} max={state.effectiveToDay || undefined} onChange={(e) => patch({ effectiveFromDay: e.target.value })} />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t("logbook.filters.effectiveTo")}</span>
            <Input type="date" value={state.effectiveToDay} min={state.effectiveFromDay || undefined} onChange={(e) => patch({ effectiveToDay: e.target.value })} />
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t("logbook.filters.band")}</span>
            <Select value={state.thresholdBand} onChange={(e) => patch({ thresholdBand: e.target.value as LogbookGridState["thresholdBand"] })}>
              <option value="">{t("logbook.filters.all")}</option>
              <option value="ANY">{t("logbook.bandFilter.ANY")}</option>
              <option value="WARN">{t("logbook.bandFilter.WARN")}</option>
              <option value="CRIT">{t("logbook.bandFilter.CRIT")}</option>
            </Select>
          </label>
          <label className={styles.filterField}>
            <span className={styles.filterLabel}>{t("logbook.filters.origin")}</span>
            <Select value={state.entryOrigin} onChange={(e) => patch({ entryOrigin: e.target.value as LogbookGridState["entryOrigin"] })}>
              <option value="">{t("logbook.filters.all")}</option>
              <option value="ONLINE">{t("logbook.origin.ONLINE")}</option>
              <option value="DEFERRED">{t("logbook.origin.DEFERRED")}</option>
            </Select>
          </label>
          <div className={styles.filterChecks}>
            {state.orgNodeIds.length > 0 && (
              <Checkbox
                checked={state.includeDescendants}
                onChange={(v) => patch({ includeDescendants: v })}
                label={t("logbook.filters.includeDescendants")}
              />
            )}
            <Checkbox checked={state.onlyMine} onChange={(v) => patch({ onlyMine: v })} label={t("logbook.filters.onlyMine")} />
            <Checkbox
              checked={state.pendingSignature}
              onChange={(v) => patch({ pendingSignature: v })}
              label={t("logbook.filters.pendingSignature")}
            />
            <Checkbox
              checked={state.exceptionsOnly}
              onChange={(v) => patch({ exceptionsOnly: v })}
              label={t("logbook.filters.exceptionsOnly")}
            />
            <Checkbox
              checked={state.delayedOnly}
              onChange={(v) => patch({ delayedOnly: v })}
              label={t("logbook.filters.delayedOnly")}
            />
          </div>
        </div>
      </Drawer>

      {/* Chips de filtros activos (removibles) */}
      {activeChips.length > 0 && (
        <div className={styles.activeChips}>
          {activeChips.map((chip) => (
            <Chip key={chip.key} label={chip.label} variant="info" onRemove={chip.clear} />
          ))}
          <Button variant="secondary" leftIcon={<FilterX size={14} />} onClick={clearFilters}>
            {t("logbook.filters.clear")}
          </Button>
        </div>
      )}

      <div className={facetsOpen ? `${styles.gridShell} ${styles.gridWithFacets}` : styles.gridShell}>
        {facetsOpen && (
          <FacetsPanel
            facets={facets.data}
            loading={facets.isLoading}
            state={state}
            onToggle={toggleFacet}
            onToggleDelayed={() => patch({ delayedOnly: !state.delayedOnly })}
          />
        )}
        <div className={styles.gridWrap}>
          {paginationBar}
          <Table
            className={styles.tableScroll}
            columns={allColumns}
            data={visibleRows}
            rowKey={(r) => r.id}
            loading={list.isLoading}
            density={density}
            columnState={effectiveColumnState}
            sorts={tableSorts}
            onSort={(key, direction) => {
              // Click en la cabecera = orden ÚNICO por esa columna indexada (reemplaza).
              // El multi-sort se arma en el gestor de columnas (panel "Columnas").
              if (isSortField(key)) patch({ sorts: [{ field: key, dir: direction }] });
            }}
            onColumnResize={(key, width) =>
              setColumnState((cs) => ({ ...cs, widths: { ...cs.widths, [key]: width } }))
            }
            rowClassName={(r) =>
              // Realce por excepción (review-by-exception): tinte sutil por la peor banda.
              r.indicators.worstThresholdBand === "CRIT"
                ? styles.rowCrit
                : r.indicators.worstThresholdBand === "WARN"
                  ? styles.rowWarn
                  : undefined
            }
            onRowClick={(r) => setPeekRow(r)}
            emptyState={
              <EmptyState
                icon={<BookOpenCheck size={32} />}
                title={t("logbook.list.empty")}
                description={hasActiveFilters(state) ? t("logbook.list.emptyFiltered") : t("logbook.list.emptyDesc")}
              />
            }
          />
          {rows.length > 0 && paginationBar}
          {list.isError && (
            <EmptyState icon={<TriangleAlert size={30} />} title={t("logbook.list.loadError")} />
          )}
        </div>
      </div>

      <PeekDrawer
        row={peekRow}
        onClose={() => setPeekRow(null)}
        onOpenFull={(id) => navigate(`/bitacoras/${id}`)}
        onEdit={(id) => navigate(`/bitacoras/${id}/editar`)}
        onViewFlow={(id) => setFlowEntryId(id)}
        canEdit={can("logentry:fill")}
      />

      {/* Visor ligero del flujo (solo el recorrido, sin ir a la ficha completa) */}
      <FlowModal
        entryId={flowEntryId}
        onClose={() => setFlowEntryId(null)}
        onOpenFull={(id) => {
          setFlowEntryId(null);
          navigate(`/bitacoras/${id}`);
        }}
      />
    </div>
  );
}
