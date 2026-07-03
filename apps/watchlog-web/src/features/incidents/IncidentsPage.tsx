import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, BarChart3, LayoutGrid, List, Plus, Search, Tags } from "lucide-react";
import type { IncidentListItem, IncidentListQuery } from "@lyra/contracts";
import { Button, Card, EmptyState, GridPager, Input, Select, Spinner } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate } from "../../lib/format.js";
import { useIncidentStats, useIncidentTypes, useIncidents } from "./incidents-queries.js";
import { CreateIncidentModal } from "./CreateIncidentModal.js";
import { IncidentDetailDrawer } from "./IncidentDetailDrawer.js";
import { LIFECYCLE_META, ORIGIN_META, PRIORITY_META, severityColor, severityLabel } from "./incidents-presentation.js";
import styles from "./incidents.module.css";

/** Orden estable de columnas del tablero para el flujo por defecto. */
const STATE_ORDER = ["reportada", "en_triage", "asignada", "en_progreso", "en_verificacion", "cerrada"];

export function IncidentsPage() {
  const { can } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<"list" | "board">("list");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  // `?open=<id>` auto-abre el drawer de una incidencia (deep-link desde una OT, S7b).
  const [selId, setSelId] = useState<string | null>(params.get("open"));
  const initialOrigin = params.get("fromEntry");
  const initialNode = params.get("fromNode");
  const [createOpen, setCreateOpen] = useState(!!initialOrigin);

  // Drill-down desde el dashboard (Fase 4.5): la lista se SIEMBRA desde el querystring.
  // Si llega un rango (createdFrom) sin lifecycle explícito, se muestran TODAS (no solo
  // abiertas) para coincidir con el conteo de la barra/segmento clicado.
  const FLAG_KEYS = ["mine", "unassignedOnly", "overdueOnly", "slaBreachedOnly", "reportableOnly", "reportOverdueOnly", "fromLogbookOnly"] as const;
  const initialFlag = FLAG_KEYS.find((k) => params.get(k) === "true") ?? "";
  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<IncidentListQuery["lifecycle"] | "">(
    (params.get("lifecycle") as IncidentListQuery["lifecycle"] | null) ?? (params.has("createdFrom") ? "" : "OPEN"),
  );
  const [typeId, setTypeId] = useState(params.get("typeId") ?? "");
  const [severity, setSeverity] = useState(params.get("severity") ?? "");
  const [priority, setPriority] = useState<IncidentListQuery["priority"] | "">((params.get("priority") as IncidentListQuery["priority"] | null) ?? "");
  const [flag, setFlag] = useState<"" | "mine" | "unassignedOnly" | "overdueOnly" | "slaBreachedOnly" | "reportableOnly" | "reportOverdueOnly" | "fromLogbookOnly">(initialFlag);
  const [sort, setSort] = useState<IncidentListQuery["sort"]>("recent");

  // Pase directo del drill-down (sin control visible): origen/equipo/nodo/rango.
  const passOriginType = (params.get("originType") as IncidentListQuery["originType"] | null) ?? undefined;
  const passEquipmentId = params.get("equipmentId") ?? undefined;
  const passOrgNodeIds = params.get("orgNodeIds")?.split(",").filter(Boolean);
  const passCreatedFrom = params.get("createdFrom") ?? undefined;
  const passCreatedTo = params.get("createdTo") ?? undefined;

  const query: IncidentListQuery = useMemo(() => ({
    search: search.trim() || undefined,
    lifecycle: lifecycle || undefined,
    typeId: typeId || undefined,
    severity: severity ? Number(severity) : undefined,
    priority: priority || undefined,
    originType: passOriginType,
    equipmentId: passEquipmentId,
    orgNodeIds: passOrgNodeIds && passOrgNodeIds.length ? passOrgNodeIds : undefined,
    createdFrom: passCreatedFrom ? new Date(passCreatedFrom) : undefined,
    createdTo: passCreatedTo ? new Date(passCreatedTo) : undefined,
    sort,
    ...(flag ? { [flag]: true } : {}),
    page: view === "list" ? page : 1,
    pageSize: view === "list" ? pageSize : 200,
  }), [search, lifecycle, typeId, severity, priority, passOriginType, passEquipmentId, passOrgNodeIds, passCreatedFrom, passCreatedTo, sort, flag, page, pageSize, view]);

  const { data, isLoading } = useIncidents(query);
  const { data: stats } = useIncidentStats();
  const { data: types = [] } = useIncidentTypes();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  function openDetail(id: string) {
    setSelId(id);
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.h1}>Incidencias</h1>
          <p className={styles.sub}>Gestión de incidencias operacionales y HSE.</p>
        </div>
        <div className={styles.headerActions}>
          <Link to="/incidencias/dashboard">
            <Button variant="secondary" leftIcon={<BarChart3 size={16} />}>Dashboard</Button>
          </Link>
          {can("incidentcatalog:manage") && (
            <Link to="/incidencias/catalogos">
              <Button variant="secondary" leftIcon={<Tags size={16} />}>Catálogos</Button>
            </Link>
          )}
          {can("incident:create") && (
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>Reportar incidencia</Button>
          )}
        </div>
      </header>

      {/* KPIs */}
      {stats && (
        <div className={styles.kpis}>
          <Kpi label="Abiertas" value={stats.open} color="#6366F1" onClick={() => { setLifecycle("OPEN"); setFlag(""); }} />
          <Kpi label="Críticas" value={stats.critical} color="#EF4444" onClick={() => { setLifecycle("OPEN"); setSeverity("5"); }} />
          <Kpi label="Plazo vencido" value={stats.overdue} color="#F97316" onClick={() => { setLifecycle("OPEN"); setFlag("overdueOnly"); }} />
          <Kpi label="Permanencia excedida" value={stats.slaBreached} color="#EAB308" onClick={() => { setLifecycle("OPEN"); setFlag("slaBreachedOnly"); }} />
          <Kpi label="Sin responsable" value={stats.unassigned} color="#EAB308" onClick={() => { setLifecycle("OPEN"); setFlag("unassignedOnly"); }} />
          <Kpi label="Desde bitácora" value={stats.fromLogbook} color="#06B6D4" onClick={() => { setLifecycle(""); setFlag("fromLogbookOnly"); }} />
          <Kpi label="Reportables" value={stats.reportable} color="#84CC16" onClick={() => { setLifecycle("OPEN"); setFlag("reportableOnly"); }} />
          <Kpi label="Reporte vencido" value={stats.reportOverdue} color="#EF4444" onClick={() => { setLifecycle("OPEN"); setFlag("reportOverdueOnly"); }} />
        </div>
      )}

      {/* Filtros en una línea */}
      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <Search size={15} className={styles.searchIcon} />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por folio, título o descripción…" />
        </div>
        <Select value={lifecycle} onChange={(e) => { setLifecycle(e.target.value as typeof lifecycle); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todos los estados</option>
          <option value="OPEN">Abiertas</option>
          <option value="CLOSED">Cerradas</option>
          <option value="CANCELED">Anuladas</option>
        </Select>
        <Select value={typeId} onChange={(e) => { setTypeId(e.target.value); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} className={styles.fixedSelSm}>
          <option value="">Severidad</option>
          {[5, 4, 3, 2, 1].map((s) => <option key={s} value={s}>{s} · {severityLabel(s)}</option>)}
        </Select>
        <Select value={priority} onChange={(e) => { setPriority(e.target.value as typeof priority); setPage(1); }} className={styles.fixedSelSm}>
          <option value="">Prioridad</option>
          {(Object.keys(PRIORITY_META) as Array<keyof typeof PRIORITY_META>).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </Select>
        <Select value={flag} onChange={(e) => { setFlag(e.target.value as typeof flag); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todas</option>
          <option value="mine">Mis incidencias</option>
          <option value="unassignedOnly">Sin responsable</option>
          <option value="overdueOnly">Plazo vencido</option>
          <option value="slaBreachedOnly">Permanencia excedida</option>
          <option value="reportableOnly">Reportables</option>
          <option value="reportOverdueOnly">Reporte vencido</option>
          <option value="fromLogbookOnly">Desde bitácora</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as IncidentListQuery["sort"])} className={styles.fixedSelSm}>
          <option value="recent">Recientes</option>
          <option value="severity">Severidad</option>
          <option value="priority">Prioridad</option>
          <option value="due">Vencimiento</option>
        </Select>
        <div className={styles.viewToggle}>
          <button className={view === "list" ? styles.vtActive : styles.vt} onClick={() => setView("list")} title="Lista"><List size={16} /></button>
          <button className={view === "board" ? styles.vtActive : styles.vt} onClick={() => setView("board")} title="Tablero"><LayoutGrid size={16} /></button>
        </div>
      </div>

      {isLoading ? (
        <div className={styles.center}><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<AlertTriangle />} title="Sin incidencias" description="No hay incidencias que coincidan con los filtros." />
      ) : view === "list" ? (
        <>
          <GridPager page={page - 1} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} onPage={(p) => setPage(p + 1)} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          <Card className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Folio</th><th>Título</th><th>Tipo</th><th>Sev.</th><th>Prioridad</th><th>Estado</th><th>Nodo</th><th>Responsable</th><th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className={styles.row} onClick={() => openDetail(i.id)}>
                    <td className={styles.mono}>{i.code}</td>
                    <td className={styles.titleCell}>{i.title}{i.resolutionOverdue && <span className={styles.overdueTag}>Plazo vencido</span>}{i.reportable && <span className={styles.reportTag}>Reportable</span>}{i.reportOverdue && <span className={styles.overdueTag}>Reporte vencido</span>}</td>
                    <td>{i.typeName}</td>
                    <td><span className={styles.sevDot} style={{ background: severityColor(i.severity) }} title={`Severidad ${i.severity}`} /> {i.severity}</td>
                    <td><span className={styles.priText} style={{ color: PRIORITY_META[i.priority].color }}>{PRIORITY_META[i.priority].label}</span></td>
                    <td><span className={styles.stateChip} style={{ color: i.currentStateColor ?? "#9AA3B8" }}>{i.currentStateName ?? LIFECYCLE_META[i.lifecycle].label}</span>{i.slaBreached && <span className={styles.overdueTag} title="Lleva demasiado tiempo en este estado">Permanencia</span>}</td>
                    <td>{i.orgNodeName ?? "—"}</td>
                    <td>{i.ownerName ?? <span className={styles.muted}>sin asignar</span>}</td>
                    <td>{ORIGIN_META[i.originType].label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <GridPager page={page - 1} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} onPage={(p) => setPage(p + 1)} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </>
      ) : (
        <Board items={items} onOpen={openDetail} />
      )}

      <IncidentDetailDrawer
        incidentId={selId}
        onClose={() => {
          setSelId(null);
          if (params.has("open")) { params.delete("open"); setParams(params, { replace: true }); }
        }}
      />
      <CreateIncidentModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          if (initialOrigin || initialNode) {
            params.delete("fromEntry");
            params.delete("fromNode");
            setParams(params, { replace: true });
          }
        }}
        onCreated={(id) => { setCreateOpen(false); openDetail(id); }}
        originLogEntryId={initialOrigin ?? undefined}
        presetNodeId={initialNode ?? undefined}
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

function Board({ items, onOpen }: { items: IncidentListItem[]; onOpen: (id: string) => void }) {
  const groups = useMemo(() => {
    const byState = new Map<string, { name: string; color: string | null; items: IncidentListItem[] }>();
    for (const i of items) {
      const key = i.currentStateKey ?? i.lifecycle;
      const g = byState.get(key) ?? { name: i.currentStateName ?? LIFECYCLE_META[i.lifecycle].label, color: i.currentStateColor, items: [] };
      g.items.push(i);
      byState.set(key, g);
    }
    return [...byState.entries()].sort((a, b) => {
      const ia = STATE_ORDER.indexOf(a[0]); const ib = STATE_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [items]);

  return (
    <div className={styles.board}>
      {groups.map(([key, g]) => (
        <div key={key} className={styles.column}>
          <div className={styles.colHead} style={{ borderColor: g.color ?? "#6366F1" }}>
            <span style={{ color: g.color ?? "#E7EAF3" }}>{g.name}</span>
            <span className={styles.colCount}>{g.items.length}</span>
          </div>
          <div className={styles.colBody}>
            {g.items.map((i) => (
              <div key={i.id} className={styles.kcard} style={{ borderLeftColor: severityColor(i.severity) }} onClick={() => onOpen(i.id)}>
                <div className={styles.kcardTop}>
                  <span className={styles.mono}>{i.code}</span>
                  <span className={styles.priText} style={{ color: PRIORITY_META[i.priority].color }}>{PRIORITY_META[i.priority].label}</span>
                </div>
                <div className={styles.kcardTitle}>{i.title}</div>
                <div className={styles.kcardMeta}>{i.orgNodeName ?? "—"}{i.dueAt ? ` · ${formatDate(i.dueAt)}` : ""}</div>
                <div className={styles.kcardFoot}>
                  <span className={i.ownerName ? "" : styles.muted}>{i.ownerName ? `👤 ${i.ownerName}` : "sin responsable"}</span>
                  {i.resolutionOverdue && <span className={styles.overdueTag}>Plazo vencido</span>}
                  {i.slaBreached && <span className={styles.overdueTag} title="Lleva demasiado tiempo en este estado">Permanencia</span>}
                  {i.reportOverdue && <span className={styles.overdueTag}>Reporte vencido</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
