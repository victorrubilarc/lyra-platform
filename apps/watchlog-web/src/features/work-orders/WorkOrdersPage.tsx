import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, BarChart3, ClipboardList, Plus, Search, Tags, Users } from "lucide-react";
import type { WorkOrderListQuery } from "@lyra/contracts";
import { Button, Card, EmptyState, GridPager, Input, Select, Spinner } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate } from "../../lib/format.js";
import { DateRangePresets } from "../shared/DateRangePresets.js";
import { FilterChips, type FilterChip } from "../shared/FilterChips.js";
import { RefreshButton } from "../shared/RefreshButton.js";
import { useWorkOrderSpecialties, useWorkOrderStats, useWorkOrderTypes, useWorkOrders, WORK_ORDER_KEYS } from "./work-orders-queries.js";
import { CreateWorkOrderModal } from "./CreateWorkOrderModal.js";
import { LIFECYCLE_META, ORIGIN_META, PRIORITY_META, SLA_STATUS_META, criticalityColor, criticalityLabel } from "./work-orders-presentation.js";
import styles from "./work-orders.module.css";

type FlagKey = "" | "mine" | "unassignedOnly" | "requiresPtw";

/** Etiquetas del filtro de plazo (distinto del semáforo SLA_STATUS_META, que va por color). */
const SLA_FILTER_LABELS: Record<NonNullable<WorkOrderListQuery["slaStatus"]>, string> = {
  overdue: "Vencidas",
  atRisk: "Por vencer",
  stalled: "Estancadas",
};

export function WorkOrdersPage() {
  const { can } = usePermissions();
  const navigate = useNavigate();
  // Siembra de filtros desde la URL (drill-down desde el Dashboard de OT): el rango y la
  // dimensión clicada llegan por querystring y quedan reflejados en la barra de filtros.
  const [params] = useSearchParams();
  const FLAG_KEYS = ["mine", "unassignedOnly", "requiresPtw"] as const;
  const initialFlag = (FLAG_KEYS.find((k) => params.get(k) === "true") ?? "") as FlagKey;
  // Se llega desde el Dashboard de OT (?from=dashboard): mostramos un back-nav.
  const fromDashboard = params.get("from") === "dashboard";
  // Recordar la ÚLTIMA OT consultada: al volver del detalle se resalta su fila y se
  // hace scroll a ella, para saber "dónde estabas" (sobrevive el desmontaje de la lista).
  const [lastViewed, setLastViewed] = useState<string | null>(() => sessionStorage.getItem("wo:lastViewed"));
  const openDetail = (id: string) => {
    sessionStorage.setItem("wo:lastViewed", id);
    setLastViewed(id);
    navigate(`/ordenes-trabajo/${id}`);
  };
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [createOpen, setCreateOpen] = useState(false);

  const [search, setSearch] = useState("");
  // Sin filtro por defecto: desde S2 la solicitud NACE en borrador (DRAFT) y debe
  // verse recién creada; "OPEN" como default la ocultaría. Si llega un rango del
  // drill-down (createdFrom), no se fuerza lifecycle (se muestran todas).
  const [lifecycle, setLifecycle] = useState<WorkOrderListQuery["lifecycle"] | "">(
    (params.get("lifecycle") as WorkOrderListQuery["lifecycle"] | null) ?? "",
  );
  const [typeId, setTypeId] = useState(params.get("typeId") ?? "");
  const [criticality, setCriticality] = useState(params.get("criticality") ?? "");
  const [priority, setPriority] = useState<WorkOrderListQuery["priority"] | "">(
    (params.get("priority") as WorkOrderListQuery["priority"] | null) ?? "",
  );
  const [specialtyId, setSpecialtyId] = useState(params.get("specialtyId") ?? "");
  const [slaStatus, setSlaStatus] = useState<WorkOrderListQuery["slaStatus"] | "">(
    (params.get("slaStatus") as WorkOrderListQuery["slaStatus"] | null) ?? "",
  );
  const [flag, setFlag] = useState<FlagKey>(initialFlag);
  const [sort, setSort] = useState<WorkOrderListQuery["sort"]>("recent");
  // Filtros del drill-down, ahora en ESTADO (para poder limpiarlos). Sin control propio
  // en la barra: se muestran como chips removibles. El rango llega como ISO por URL.
  const [orgNodeIds, setOrgNodeIds] = useState<string[]>(() => params.get("orgNodeIds")?.split(",").filter(Boolean) ?? []);
  const [originType, setOriginType] = useState<WorkOrderListQuery["originType"] | "">((params.get("originType") as WorkOrderListQuery["originType"] | null) ?? "");
  const [equipmentId, setEquipmentId] = useState(params.get("equipmentId") ?? "");
  const [createdFrom, setCreatedFrom] = useState(params.get("createdFrom") ?? "");
  const [createdTo, setCreatedTo] = useState(params.get("createdTo") ?? "");

  const query: WorkOrderListQuery = useMemo(
    () => ({
      search: search.trim() || undefined,
      lifecycle: lifecycle || undefined,
      typeId: typeId || undefined,
      criticality: criticality ? Number(criticality) : undefined,
      priority: priority || undefined,
      specialtyId: specialtyId || undefined,
      slaStatus: slaStatus || undefined,
      // Filtros del drill-down (rango de creación, nodo, origen, equipo): en estado.
      originType: originType || undefined,
      equipmentId: equipmentId || undefined,
      orgNodeIds: orgNodeIds.length ? orgNodeIds : undefined,
      createdFrom: createdFrom ? new Date(createdFrom) : undefined,
      createdTo: createdTo ? new Date(createdTo) : undefined,
      sort,
      ...(flag ? { [flag]: true } : {}),
      page,
      pageSize,
    }),
    [search, lifecycle, typeId, criticality, priority, specialtyId, slaStatus, originType, equipmentId, orgNodeIds, createdFrom, createdTo, sort, flag, page, pageSize],
  );
  /** Aplica una faceta del vigía: acota a ABIERTAS + el estado SLA, y ordena por plazo. */
  const applySla = (s: NonNullable<WorkOrderListQuery["slaStatus"]>) => {
    setLifecycle("OPEN"); setSlaStatus(s); setFlag(""); setCriticality(""); setSort(s === "stalled" ? "recent" : "due"); setPage(1);
  };
  /** Reset TOTAL de filtros (chips «Limpiar filtros»). */
  const clearFilters = () => {
    setSearch(""); setLifecycle(""); setTypeId(""); setCriticality(""); setPriority(""); setSpecialtyId("");
    setSlaStatus(""); setFlag(""); setOrgNodeIds([]); setOriginType(""); setEquipmentId(""); setCreatedFrom(""); setCreatedTo(""); setPage(1);
  };

  const { data, isLoading } = useWorkOrders(query);
  const { data: stats } = useWorkOrderStats();
  const { data: types = [] } = useWorkOrderTypes();
  const { data: specialties = [] } = useWorkOrderSpecialties();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  // Chips de filtros activos (deja claro QUÉ se está filtrando + quitar uno a uno).
  const chips: FilterChip[] = [];
  if (search.trim()) chips.push({ key: "search", label: `Buscar: ${search.trim()}`, onRemove: () => { setSearch(""); setPage(1); } });
  if (lifecycle) chips.push({ key: "lifecycle", label: `Estado: ${LIFECYCLE_META[lifecycle].label}`, onRemove: () => { setLifecycle(""); setPage(1); } });
  if (typeId) chips.push({ key: "type", label: `Tipo: ${types.find((t) => t.id === typeId)?.name ?? typeId}`, onRemove: () => { setTypeId(""); setPage(1); } });
  if (criticality) chips.push({ key: "criticality", label: `Criticidad: ${criticality} · ${criticalityLabel(Number(criticality))}`, onRemove: () => { setCriticality(""); setPage(1); } });
  if (priority) chips.push({ key: "priority", label: `Prioridad: ${PRIORITY_META[priority].label}`, onRemove: () => { setPriority(""); setPage(1); } });
  if (specialtyId) chips.push({ key: "specialty", label: `Especialidad: ${specialties.find((s) => s.id === specialtyId)?.name ?? specialtyId}`, onRemove: () => { setSpecialtyId(""); setPage(1); } });
  if (slaStatus) chips.push({ key: "sla", label: `Plazo: ${SLA_FILTER_LABELS[slaStatus]}`, onRemove: () => { setSlaStatus(""); setPage(1); } });
  if (flag) chips.push({ key: "flag", label: { mine: "Mías", unassignedOnly: "Sin responsable", requiresPtw: "Requieren PTW" }[flag], onRemove: () => { setFlag(""); setPage(1); } });
  if (orgNodeIds.length) chips.push({ key: "nodes", label: orgNodeIds.length === 1 ? "Nodo (drill-down)" : `Nodos: ${orgNodeIds.length}`, onRemove: () => { setOrgNodeIds([]); setPage(1); } });
  if (originType) chips.push({ key: "origin", label: `Origen: ${ORIGIN_META[originType].label}`, onRemove: () => { setOriginType(""); setPage(1); } });
  if (equipmentId) chips.push({ key: "equipment", label: "Equipo (filtrado)", onRemove: () => { setEquipmentId(""); setPage(1); } });
  if (createdFrom || createdTo) chips.push({ key: "created", label: `Creación: ${createdFrom ? formatDate(createdFrom) : "…"} → ${createdTo ? formatDate(createdTo) : "…"}`, onRemove: () => { setCreatedFrom(""); setCreatedTo(""); setPage(1); } });

  return (
    <div className={styles.page}>
      {fromDashboard && (
        <Link to="/ordenes-trabajo/dashboard" className={styles.backLink}>
          <ArrowLeft size={14} /> Volver al dashboard
        </Link>
      )}
      <header className={styles.header}>
        <div>
          <h1 className={styles.h1}>Órdenes de trabajo</h1>
          <p className={styles.sub}>Solicitudes de trabajo y permisos de trabajo (PTW).</p>
        </div>
        <div className={styles.headerActions}>
          <RefreshButton queryKey={WORK_ORDER_KEYS.all} />
          <Link to="/ordenes-trabajo/dashboard">
            <Button variant="secondary" leftIcon={<BarChart3 size={16} />}>Dashboard</Button>
          </Link>
          {can("worker:manage") && (
            <Link to="/ordenes-trabajo/personas">
              <Button variant="secondary" leftIcon={<Users size={16} />}>Personas</Button>
            </Link>
          )}
          {can("workordercatalog:manage") && (
            <Link to="/ordenes-trabajo/catalogos">
              <Button variant="secondary" leftIcon={<Tags size={16} />}>Catálogos</Button>
            </Link>
          )}
          {can("workorder:create") && (
            <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => setCreateOpen(true)}>Nueva solicitud</Button>
          )}
        </div>
      </header>

      {stats && (
        <div className={styles.kpis}>
          <Kpi label="Borradores" value={stats.draft} color="#9AA3B8" onClick={() => { setLifecycle("DRAFT"); setFlag(""); setPage(1); }} />
          <Kpi label="Abiertas" value={stats.open} color="#6366F1" onClick={() => { setLifecycle("OPEN"); setFlag(""); setPage(1); }} />
          <Kpi label="Críticas" value={stats.critical} color="#EF4444" onClick={() => { setLifecycle("OPEN"); setCriticality("5"); setPage(1); }} />
          <Kpi label="Sin responsable" value={stats.unassigned} color="#EAB308" onClick={() => { setLifecycle("OPEN"); setFlag("unassignedOnly"); setPage(1); }} />
          <Kpi label="Con PTW" value={stats.ptw} color="#F97316" onClick={() => { setLifecycle(""); setFlag("requiresPtw"); setPage(1); }} />
          <Kpi label="Vencidas" value={stats.overdue} color="var(--color-error)" onClick={() => applySla("overdue")} />
          <Kpi label="Por vencer" value={stats.atRisk} color="var(--color-warning)" onClick={() => applySla("atRisk")} />
          <Kpi label="Estancadas" value={stats.stalled} color="var(--color-text-secondary)" onClick={() => applySla("stalled")} />
        </div>
      )}

      <div className={styles.filters}>
        <div className={styles.searchBox}>
          <Search size={15} className={styles.searchIcon} />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por folio, título o descripción…" />
        </div>
        <Select value={lifecycle} onChange={(e) => { setLifecycle(e.target.value as typeof lifecycle); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borradores</option>
          <option value="OPEN">Abiertas</option>
          <option value="CLOSED">Cerradas</option>
          <option value="CANCELED">Anuladas</option>
        </Select>
        <Select value={typeId} onChange={(e) => { setTypeId(e.target.value); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={criticality} onChange={(e) => { setCriticality(e.target.value); setPage(1); }} className={styles.fixedSelSm}>
          <option value="">Criticidad</option>
          {[5, 4, 3, 2, 1].map((c) => <option key={c} value={c}>{c} · {criticalityLabel(c)}</option>)}
        </Select>
        <Select value={priority} onChange={(e) => { setPriority(e.target.value as typeof priority); setPage(1); }} className={styles.fixedSelSm}>
          <option value="">Prioridad</option>
          {(Object.keys(PRIORITY_META) as Array<keyof typeof PRIORITY_META>).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
        </Select>
        <Select value={specialtyId} onChange={(e) => { setSpecialtyId(e.target.value); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todas las especialidades</option>
          {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={slaStatus} onChange={(e) => { setSlaStatus(e.target.value as typeof slaStatus); setPage(1); }} className={styles.fixedSel}>
          <option value="">Plazo (todos)</option>
          <option value="overdue">Vencidas</option>
          <option value="atRisk">Por vencer</option>
          <option value="stalled">Estancadas</option>
        </Select>
        <Select value={flag} onChange={(e) => { setFlag(e.target.value as FlagKey); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todas</option>
          <option value="mine">Mías</option>
          <option value="unassignedOnly">Sin responsable</option>
          <option value="requiresPtw">Requieren PTW</option>
        </Select>
        <Select value={sort} onChange={(e) => setSort(e.target.value as WorkOrderListQuery["sort"])} className={styles.fixedSelSm}>
          <option value="recent">Recientes</option>
          <option value="criticality">Criticidad</option>
          <option value="priority">Prioridad</option>
          <option value="due">Fecha límite</option>
        </Select>
        <DateRangePresets onApply={(from, to) => { setCreatedFrom(from); setCreatedTo(to); setPage(1); }} />
      </div>

      <FilterChips chips={chips} onClear={clearFilters} />

      {isLoading ? (
        <div className={styles.center}><Spinner /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={<ClipboardList />} title="Sin órdenes de trabajo" description="No hay solicitudes que coincidan con los filtros." />
      ) : (
        <>
          <GridPager page={page - 1} pages={pages} total={total} pageSize={pageSize} onPage={(p) => setPage(p + 1)} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
          <Card className={styles.tableCard}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th title="Semáforo de plazo"><span className={styles.srOnly}>SLA</span></th>
                  <th>Folio</th><th>Título</th><th>Tipo</th><th>Crit.</th><th>Prioridad</th><th>Estado</th><th>Nodo</th><th>Responsable</th><th>Especialidades</th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr
                    key={w.id}
                    className={w.id === lastViewed ? `${styles.row} ${styles.rowActive}` : styles.row}
                    onClick={() => openDetail(w.id)}
                    ref={w.id === lastViewed ? (el) => el?.scrollIntoView({ block: "center" }) : undefined}
                  >
                    <td>
                      <span
                        className={styles.slaDot}
                        style={{ background: SLA_STATUS_META[w.slaStatus].color }}
                        title={w.dueAt ? `${SLA_STATUS_META[w.slaStatus].label} · vence ${new Date(w.dueAt).toLocaleString()}` : SLA_STATUS_META[w.slaStatus].label}
                      />
                    </td>
                    <td className={styles.mono}>{w.code}</td>
                    <td className={styles.titleCell}>
                      {w.title}
                      {w.requiresPtw && <span className={styles.ptwTag}>PTW</span>}
                      {w.stalled && <span className={styles.stalledTag} title="Lleva demasiado tiempo en su estado actual">Estancada</span>}
                    </td>
                    <td>{w.typeName ?? "—"}</td>
                    <td><span className={styles.sevDot} style={{ background: criticalityColor(w.criticality) }} title={`Criticidad ${w.criticality}`} /> {w.criticality}</td>
                    <td><span className={styles.priText} style={{ color: PRIORITY_META[w.priority].color }}>{PRIORITY_META[w.priority].label}</span></td>
                    <td>
                      {w.currentStateName ? (
                        <span className={styles.lifeChip} style={{ color: w.currentStateColor ?? undefined }}>{w.currentStateName}</span>
                      ) : (
                        <span className={styles.lifeChip} style={{ color: LIFECYCLE_META[w.lifecycle].color }}>{LIFECYCLE_META[w.lifecycle].label}</span>
                      )}
                    </td>
                    <td>{w.orgNodeName ?? "—"}</td>
                    <td>{w.ownerName ?? <span className={styles.muted}>sin asignar</span>}</td>
                    <td>
                      <div className={styles.tags}>
                        {w.specialties.map((s) => <span key={`s-${s.id}`} className={styles.tagChip}>{s.name}</span>)}
                        {w.specialties.length === 0 && <span className={styles.muted}>{ORIGIN_META[w.originType].label}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <GridPager page={page - 1} pages={pages} total={total} pageSize={pageSize} onPage={(p) => setPage(p + 1)} onPageSize={(n) => { setPageSize(n); setPage(1); }} />
        </>
      )}

      <CreateWorkOrderModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); openDetail(id); }} />
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
