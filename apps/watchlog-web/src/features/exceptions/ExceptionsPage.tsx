import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AlertTriangle, FilterX, Layers, Search } from "lucide-react";
import type { ExceptionListQuery, ExceptionStatus, ExceptionThresholdType, ExceptionTrigger } from "@lyra/contracts";
import { Button, EmptyState, GridPager, Input, Select, Spinner } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { RefreshButton } from "../shared/RefreshButton.js";
import { EXCEPTION_KEYS, useExceptions } from "./exceptions-queries.js";
import { ExceptionCard } from "./ExceptionCard.js";
import { ExceptionDetailDrawer } from "./ExceptionDetailDrawer.js";
import { ConvertExceptionModal } from "./ConvertExceptionModal.js";
import styles from "./exceptions.module.css";

/**
 * Bandeja GLOBAL de excepciones (Fase 4.1.1). Lista paginada con filtros para
 * triar las desviaciones de toda la operación (acotada por ABAC en el backend),
 * complementaria al panel por entrada. Gate: `module:incidents:view`.
 */
export function ExceptionsPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selId, setSelId] = useState<string | null>(params.get("open"));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [thresholdType, setThresholdType] = useState<ExceptionThresholdType | "">("");
  const [triggerKind, setTriggerKind] = useState<ExceptionTrigger | "">("");
  const [status, setStatus] = useState<ExceptionStatus | "" | "open">("open");
  const [scope, setScope] = useState<"" | "unlinked">("");
  const [sort, setSort] = useState<"recent" | "severity">("severity");

  const query: ExceptionListQuery = useMemo(() => ({
    search: search.trim() || undefined,
    thresholdType: thresholdType || undefined,
    triggerKind: triggerKind || undefined,
    openOnly: status === "open" ? true : undefined,
    status: status === "open" || status === "" ? undefined : status,
    unlinkedOnly: scope === "unlinked" ? true : undefined,
    sort,
    page,
    pageSize,
  }), [search, thresholdType, triggerKind, status, scope, sort, page, pageSize]);

  const { data, isLoading } = useExceptions(query);
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary;
  const canConvert = can("exception:triage") && can("incident:create");

  function resetPage() { setPage(1); }
  // Filtros de estado fáciles de resetear (sin drill-down por URL): un botón «Limpiar»
  // basta (no hace falta la fila de chips de OT/Incidencias). `status="open"` y
  // `sort="severity"` son la vista por defecto de la bandeja.
  const hasFilters = Boolean(search.trim() || thresholdType || triggerKind || scope || status !== "open");
  const clearFilters = () => { setSearch(""); setThresholdType(""); setTriggerKind(""); setScope(""); setStatus("open"); resetPage(); };
  function toggle(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  const selectedIds = [...selected].filter((id) => items.some((i) => i.id === id));

  const pager = (
    <GridPager
      page={page - 1}
      pages={Math.max(1, Math.ceil(total / pageSize))}
      total={total}
      pageSize={pageSize}
      onPage={(p) => setPage(p + 1)}
      onPageSize={(n) => { setPageSize(n); setPage(1); }}
    />
  );

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.h1}>Excepciones operacionales</h1>
          <p className={styles.sub}>Desviaciones detectadas en las bitácoras (umbrales, reglas y registros manuales) pendientes de triage.</p>
        </div>
        <div className={styles.headerActions}>
          <RefreshButton queryKey={EXCEPTION_KEYS.all} />
        </div>
      </header>

      {summary && (
        <div className={styles.kpis}>
          <Kpi label="Sin resolver" value={summary.open} color="#6366F1" onClick={() => { setStatus("open"); setThresholdType(""); resetPage(); }} />
          <Kpi label="Críticas" value={summary.critical} color="#EF4444" onClick={() => { setStatus("open"); setThresholdType("critical"); resetPage(); }} />
          <Kpi label="Advertencias" value={summary.warning} color="#F59E0B" onClick={() => { setStatus("open"); setThresholdType("warning"); resetPage(); }} />
          <Kpi label="Posibles inválidos" value={summary.invalid} color="#06B6D4" onClick={() => { setStatus("open"); setThresholdType("invalid"); resetPage(); }} />
          <Kpi label="Total (filtro)" value={summary.total} color="#9AA3B8" onClick={() => { setStatus(""); setThresholdType(""); resetPage(); }} />
        </div>
      )}

      {/* Filtros en UNA línea */}
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <Search size={15} className={styles.searchIcon} />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); resetPage(); }} placeholder="Buscar por campo, sección o detalle…" />
        </div>
        <Select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); resetPage(); }} className={styles.fixedSel}>
          <option value="open">Sin resolver</option>
          <option value="">Todos los estados</option>
          <option value="OPEN">Abiertas</option>
          <option value="ACKNOWLEDGED">Reconocidas</option>
          <option value="CONVERTED">Convertidas</option>
          <option value="CORRECTED">Corregidas</option>
          <option value="DISMISSED">Descartadas</option>
        </Select>
        <Select value={thresholdType} onChange={(e) => { setThresholdType(e.target.value as typeof thresholdType); resetPage(); }} className={styles.fixedSelSm}>
          <option value="">Severidad</option>
          <option value="critical">Crítica</option>
          <option value="warning">Advertencia</option>
          <option value="invalid">Posible inválido</option>
        </Select>
        <Select value={triggerKind} onChange={(e) => { setTriggerKind(e.target.value as typeof triggerKind); resetPage(); }} className={styles.fixedSel}>
          <option value="">Todo origen</option>
          <option value="THRESHOLD_CRIT">Umbral crítico</option>
          <option value="THRESHOLD_WARN">Umbral advertencia</option>
          <option value="RULE">Regla de negocio</option>
          <option value="MANUAL">Registro manual</option>
        </Select>
        <Select value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); resetPage(); }} className={styles.fixedSel}>
          <option value="">Todas</option>
          <option value="unlinked">Sin incidencia</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={styles.fixedSelSm}>
          <option value="severity">Severidad</option>
          <option value="recent">Recientes</option>
        </Select>
        {hasFilters && (
          <Button variant="secondary" leftIcon={<FilterX size={14} />} onClick={clearFilters}>Limpiar filtros</Button>
        )}
      </div>

      {canConvert && selectedIds.length > 1 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{selectedIds.length} seleccionadas</span>
          <Button variant="primary" leftIcon={<Layers size={15} />} onClick={() => setBulkOpen(true)}>Agrupar en una incidencia</Button>
          <Button variant="secondary" onClick={() => setSelected(new Set())}>Limpiar</Button>
        </div>
      )}

      {isLoading ? (
        <div className={styles.center}><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<AlertTriangle />} title="Sin excepciones" description="No hay excepciones que coincidan con los filtros." />
      ) : (
        <>
          {pager}
          <div className={styles.cards}>
            {items.map((exc) => (
              <ExceptionCard
                key={exc.id}
                exc={exc}
                onOpen={setSelId}
                showContext
                selectable={canConvert}
                selected={selected.has(exc.id)}
                onToggle={toggle}
              />
            ))}
          </div>
          {pager}
        </>
      )}

      <ExceptionDetailDrawer
        exceptionId={selId}
        onClose={() => { setSelId(null); if (params.get("open")) { params.delete("open"); setParams(params, { replace: true }); } }}
      />

      <ConvertExceptionModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        exceptionIds={selectedIds}
        anchorExceptionId={selectedIds[0] ?? null}
        onDone={() => { setBulkOpen(false); setSelected(new Set()); }}
      />
    </div>
  );
}

function Kpi({ label, value, color, onClick }: { label: string; value: number; color: string; onClick: () => void }) {
  return (
    <button className={styles.kpi} onClick={onClick} style={{ ["--kpi" as string]: color }}>
      <span className={styles.kpiValue}>{value}</span>
      <span className={styles.kpiLabel}>{label}</span>
    </button>
  );
}
