import { useMemo, useState } from "react";
import { ClipboardList, Plus, Search } from "lucide-react";
import type { WorkOrderListQuery } from "@lyra/contracts";
import { Button, Card, EmptyState, GridPager, Input, Select, Spinner } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { useWorkOrderAreas, useWorkOrderSpecialties, useWorkOrderStats, useWorkOrderTypes, useWorkOrders } from "./work-orders-queries.js";
import { CreateWorkOrderModal } from "./CreateWorkOrderModal.js";
import { WorkOrderDetailDrawer } from "./WorkOrderDetailDrawer.js";
import { LIFECYCLE_META, ORIGIN_META, PRIORITY_META, criticalityColor, criticalityLabel } from "./work-orders-presentation.js";
import styles from "./work-orders.module.css";

type FlagKey = "" | "mine" | "unassignedOnly" | "requiresPtw";

export function WorkOrdersPage() {
  const { can } = usePermissions();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selId, setSelId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [lifecycle, setLifecycle] = useState<WorkOrderListQuery["lifecycle"] | "">("OPEN");
  const [typeId, setTypeId] = useState("");
  const [criticality, setCriticality] = useState("");
  const [priority, setPriority] = useState<WorkOrderListQuery["priority"] | "">("");
  const [areaId, setAreaId] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [flag, setFlag] = useState<FlagKey>("");
  const [sort, setSort] = useState<WorkOrderListQuery["sort"]>("recent");

  const query: WorkOrderListQuery = useMemo(
    () => ({
      search: search.trim() || undefined,
      lifecycle: lifecycle || undefined,
      typeId: typeId || undefined,
      criticality: criticality ? Number(criticality) : undefined,
      priority: priority || undefined,
      areaId: areaId || undefined,
      specialtyId: specialtyId || undefined,
      sort,
      ...(flag ? { [flag]: true } : {}),
      page,
      pageSize,
    }),
    [search, lifecycle, typeId, criticality, priority, areaId, specialtyId, sort, flag, page, pageSize],
  );

  const { data, isLoading } = useWorkOrders(query);
  const { data: stats } = useWorkOrderStats();
  const { data: types = [] } = useWorkOrderTypes();
  const { data: areas = [] } = useWorkOrderAreas();
  const { data: specialties = [] } = useWorkOrderSpecialties();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.h1}>Órdenes de trabajo</h1>
          <p className={styles.sub}>Solicitudes de trabajo y permisos de trabajo (PTW).</p>
        </div>
        <div className={styles.headerActions}>
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
        <Select value={areaId} onChange={(e) => { setAreaId(e.target.value); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todas las áreas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </Select>
        <Select value={specialtyId} onChange={(e) => { setSpecialtyId(e.target.value); setPage(1); }} className={styles.fixedSel}>
          <option value="">Todas las especialidades</option>
          {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
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
      </div>

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
                  <th>Folio</th><th>Título</th><th>Tipo</th><th>Crit.</th><th>Prioridad</th><th>Estado</th><th>Nodo</th><th>Responsable</th><th>Clasificación</th>
                </tr>
              </thead>
              <tbody>
                {items.map((w) => (
                  <tr key={w.id} className={styles.row} onClick={() => setSelId(w.id)}>
                    <td className={styles.mono}>{w.code}</td>
                    <td className={styles.titleCell}>{w.title}{w.requiresPtw && <span className={styles.ptwTag}>PTW</span>}</td>
                    <td>{w.typeName ?? "—"}</td>
                    <td><span className={styles.sevDot} style={{ background: criticalityColor(w.criticality) }} title={`Criticidad ${w.criticality}`} /> {w.criticality}</td>
                    <td><span className={styles.priText} style={{ color: PRIORITY_META[w.priority].color }}>{PRIORITY_META[w.priority].label}</span></td>
                    <td><span className={styles.lifeChip} style={{ color: LIFECYCLE_META[w.lifecycle].color }}>{LIFECYCLE_META[w.lifecycle].label}</span></td>
                    <td>{w.orgNodeName ?? "—"}</td>
                    <td>{w.ownerName ?? <span className={styles.muted}>sin asignar</span>}</td>
                    <td>
                      <div className={styles.tags}>
                        {w.areas.map((a) => <span key={`a-${a.id}`} className={styles.tagChip}>{a.name}</span>)}
                        {w.specialties.map((s) => <span key={`s-${s.id}`} className={styles.tagChip}>{s.name}</span>)}
                        {w.areas.length === 0 && w.specialties.length === 0 && <span className={styles.muted}>{ORIGIN_META[w.originType].label}</span>}
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

      <WorkOrderDetailDrawer workOrderId={selId} onClose={() => setSelId(null)} />
      <CreateWorkOrderModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); setSelId(id); }} />
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
