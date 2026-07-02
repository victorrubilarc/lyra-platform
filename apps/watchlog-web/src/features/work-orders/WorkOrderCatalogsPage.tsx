import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ClipboardCheck, Lock, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import type { SpecialtyDto, WorkOrderChecklistRuleDto, WorkOrderTypeDto } from "@lyra/contracts";
import { Button, Chip, EmptyState, GridPager, Input, Select, Spinner, Toggle, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import {
  useDeleteWorkOrderChecklistRule,
  useUpsertWorkOrderSpecialty,
  useUpsertWorkOrderType,
  useWorkOrderChecklistRules,
  useWorkOrderSpecialtiesAdmin,
  useWorkOrderTypesAdmin,
} from "./work-orders-queries.js";
import { WorkOrderTypeModal } from "./WorkOrderTypeModal.js";
import { WorkOrderTagModal } from "./WorkOrderTagModal.js";
import { WorkOrderChecklistRuleModal } from "./WorkOrderChecklistRuleModal.js";
import { criticalityLabel } from "./work-orders-presentation.js";
import styles from "./catalogs.module.css";

type ActiveFilter = "all" | "active" | "inactive";
type Row = { name: string; key: string; active: boolean; sortOrder: number };

/**
 * Mantenedor de catálogos de OT (Tipos + Áreas + Especialidades). Ruta propia
 * `/ordenes-trabajo/catalogos`, gateada por `workordercatalog:manage` (la UI solo
 * oculta/deshabilita; el gate real está en el backend).
 */
export function WorkOrderCatalogsPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<"types" | "specialties" | "checklists">("types");

  if (!can("workordercatalog:manage")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title="Sin acceso" description="No tienes permiso para administrar los catálogos de órdenes de trabajo." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link to="/ordenes-trabajo" className={styles.back}><ArrowLeft size={14} /> Volver a órdenes de trabajo</Link>
          <h1 className={styles.h1}><Tags size={22} /> Catálogos de órdenes de trabajo</h1>
          <p className={styles.sub}>Administra los tipos de OT y las especialidades (disciplinas) disponibles al crear una solicitud. La ubicación la define la estructura organizacional (nodo).</p>
        </div>
      </header>

      <div className={styles.tabs} role="tablist">
        <button role="tab" aria-selected={tab === "types"} className={tab === "types" ? styles.tabActive : styles.tab} onClick={() => setTab("types")}>Tipos</button>
        <button role="tab" aria-selected={tab === "specialties"} className={tab === "specialties" ? styles.tabActive : styles.tab} onClick={() => setTab("specialties")}>Especialidades</button>
        <button role="tab" aria-selected={tab === "checklists"} className={tab === "checklists" ? styles.tabActive : styles.tab} onClick={() => setTab("checklists")}>Reglas de checklist</button>
      </div>

      {tab === "types" ? <TypesTab /> : tab === "specialties" ? <SpecialtiesTab /> : <ChecklistRulesTab />}
    </div>
  );
}

function Filters({ search, onSearch, active, onActive, sort, onSort }: {
  search: string; onSearch: (v: string) => void;
  active: ActiveFilter; onActive: (v: ActiveFilter) => void;
  sort: "order" | "name"; onSort: (v: "order" | "name") => void;
}) {
  return (
    <div className={styles.filters}>
      <div className={styles.searchBox}>
        <Search size={15} className={styles.searchIcon} />
        <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Buscar por nombre o clave…" />
      </div>
      <Select value={active} onChange={(e) => onActive(e.target.value as ActiveFilter)} className={styles.fixedSel}>
        <option value="all">Todos</option>
        <option value="active">Activos</option>
        <option value="inactive">Inactivos</option>
      </Select>
      <Select value={sort} onChange={(e) => onSort(e.target.value as "order" | "name")} className={styles.fixedSelSm}>
        <option value="order">Orden</option>
        <option value="name">Nombre</option>
      </Select>
    </div>
  );
}

function useCatalogFilter<T extends Row>(rows: T[]) {
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ActiveFilter>("all");
  const [sort, setSort] = useState<"order" | "name">("order");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = rows.filter((r) =>
      (active === "all" || (active === "active" ? r.active : !r.active)) &&
      (!q || r.name.toLowerCase().includes(q) || r.key.toLowerCase().includes(q)),
    );
    out = [...out].sort((a, b) => sort === "name" ? a.name.localeCompare(b.name) : (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    return out;
  }, [rows, search, active, sort]);

  const total = filtered.length;
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const filterProps = { search, onSearch: (v: string) => { setSearch(v); setPage(0); }, active, onActive: (v: ActiveFilter) => { setActive(v); setPage(0); }, sort, onSort: setSort };
  const pagerProps = { page, pages: Math.max(1, Math.ceil(total / pageSize)), total, pageSize, onPage: setPage, onPageSize: (n: number) => { setPageSize(n); setPage(0); } };
  return { pageRows, total, filterProps, pagerProps };
}

function TypesTab() {
  const toast = useToast();
  const { data: types = [], isLoading } = useWorkOrderTypesAdmin();
  const upsert = useUpsertWorkOrderType();
  const [editing, setEditing] = useState<WorkOrderTypeDto | null>(null);
  const [open, setOpen] = useState(false);

  const { pageRows, total, filterProps, pagerProps } = useCatalogFilter(types);
  const existingKeys = useMemo(() => types.map((t) => t.key.toLowerCase()), [types]);

  function toggleActive(t: WorkOrderTypeDto) {
    upsert.mutate(
      { dto: {
        key: t.key, name: t.name, description: t.description, color: t.color, defaultWorkflowId: t.defaultWorkflowId,
        requiresPtwDefault: t.requiresPtwDefault, criticalityDefault: t.criticalityDefault, sortOrder: t.sortOrder, active: !t.active,
      } },
      { onSuccess: () => toast.success(t.active ? "Tipo desactivado" : "Tipo activado"), onError: (e) => toast.error((e as Error).message) },
    );
  }

  const pager = <GridPager {...pagerProps} />;

  return (
    <>
      <div className={styles.toolbar}>
        <Filters {...filterProps} />
        <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>Nuevo tipo</Button>
      </div>

      {isLoading ? <div className={styles.center}><Spinner /></div>
        : total === 0 ? <EmptyState icon={<Tags size={32} />} title="Sin tipos" description="No hay tipos que coincidan con los filtros." />
        : (
          <>
            {pager}
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr>
                  <th>Tipo</th><th>Clave</th><th>Flujo por defecto</th><th>Criticidad</th><th>PTW</th><th className={styles.num}>Orden</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {pageRows.map((t) => (
                    <tr key={t.id} className={t.active ? undefined : styles.inactiveRow}>
                      <td>
                        <span className={styles.nameCell}>
                          <span className={styles.dot} style={{ background: t.color ?? "var(--color-text-muted)" }} />
                          {t.name}
                        </span>
                        {t.description && <div className={styles.cellDesc}>{t.description}</div>}
                      </td>
                      <td><span className={styles.mono}>{t.key}</span></td>
                      <td>{t.defaultWorkflowName ?? <span className={styles.muted}>Global</span>}</td>
                      <td>{t.criticalityDefault != null ? `${t.criticalityDefault} · ${criticalityLabel(t.criticalityDefault)}` : <span className={styles.muted}>—</span>}</td>
                      <td>{t.requiresPtwDefault ? <Chip label="PTW" variant="warning" /> : <span className={styles.muted}>—</span>}</td>
                      <td className={styles.num}>{t.sortOrder}</td>
                      <td>
                        <span className={styles.toggleCell}>
                          <Toggle checked={t.active} onChange={() => toggleActive(t)} size="sm" aria-label={t.active ? "Desactivar" : "Activar"} />
                          <span className={styles.muted}>{t.active ? "Activo" : "Inactivo"}</span>
                        </span>
                      </td>
                      <td className={styles.actionsCell}>
                        <Button variant="icon" aria-label="Editar" onClick={() => { setEditing(t); setOpen(true); }}><Pencil size={16} /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager}
          </>
        )}

      <WorkOrderTypeModal open={open} onClose={() => setOpen(false)} type={editing} existingKeys={existingKeys} />
    </>
  );
}

function SpecialtiesTab() {
  const toast = useToast();
  const { data: rows = [], isLoading } = useWorkOrderSpecialtiesAdmin();
  const upsert = useUpsertWorkOrderSpecialty();
  const [editing, setEditing] = useState<SpecialtyDto | null>(null);
  const [open, setOpen] = useState(false);

  const { pageRows, total, filterProps, pagerProps } = useCatalogFilter(rows);
  const existingKeys = useMemo(() => rows.map((r) => r.key.toLowerCase()), [rows]);

  function toggleActive(r: SpecialtyDto) {
    upsert.mutate(
      { dto: { key: r.key, name: r.name, description: r.description, color: r.color, sortOrder: r.sortOrder, active: !r.active } },
      { onSuccess: () => toast.success(r.active ? "Desactivada" : "Activada"), onError: (e) => toast.error((e as Error).message) },
    );
  }

  const pager = <GridPager {...pagerProps} />;

  return (
    <>
      <div className={styles.toolbar}>
        <Filters {...filterProps} />
        <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>Nueva especialidad</Button>
      </div>

      {isLoading ? <div className={styles.center}><Spinner /></div>
        : total === 0 ? <EmptyState icon={<Tags size={32} />} title="Sin especialidades" description="No hay elementos que coincidan con los filtros." />
        : (
          <>
            {pager}
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr>
                  <th>Especialidad</th><th>Clave</th><th className={styles.num}>Orden</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} className={r.active ? undefined : styles.inactiveRow}>
                      <td>
                        <span className={styles.nameCell}>
                          <span className={styles.dot} style={{ background: r.color ?? "var(--color-text-muted)" }} />
                          {r.name}
                        </span>
                        {r.description && <div className={styles.cellDesc}>{r.description}</div>}
                      </td>
                      <td><span className={styles.mono}>{r.key}</span></td>
                      <td className={styles.num}>{r.sortOrder}</td>
                      <td>
                        <span className={styles.toggleCell}>
                          <Toggle checked={r.active} onChange={() => toggleActive(r)} size="sm" aria-label={r.active ? "Desactivar" : "Activar"} />
                          <span className={styles.muted}>{r.active ? "Activo" : "Inactivo"}</span>
                        </span>
                      </td>
                      <td className={styles.actionsCell}>
                        <Button variant="icon" aria-label="Editar" onClick={() => { setEditing(r); setOpen(true); }}><Pencil size={16} /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager}
          </>
        )}

      <WorkOrderTagModal open={open} onClose={() => setOpen(false)} specialty={editing} existingKeys={existingKeys} />
    </>
  );
}

/** Reglas de checklist (Capa A): plantilla + aplicabilidad. Gobierna la Puerta 2. */
function ChecklistRulesTab() {
  const toast = useToast();
  const { data: rules = [], isLoading } = useWorkOrderChecklistRules();
  const del = useDeleteWorkOrderChecklistRule();
  const [editing, setEditing] = useState<WorkOrderChecklistRuleDto | null>(null);
  const [open, setOpen] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.templateName ?? "").toLowerCase().includes(q));
  }, [rules, search]);
  const total = filtered.length;
  const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);
  const pager = <GridPager page={page} pages={Math.max(1, Math.ceil(total / pageSize))} total={total} pageSize={pageSize} onPage={setPage} onPageSize={(n) => { setPageSize(n); setPage(0); }} />;

  function removeRule(r: WorkOrderChecklistRuleDto) {
    if (!window.confirm(`¿Eliminar la regla "${r.name}"? Las OT ya materializadas conservan su checklist.`)) return;
    del.mutate(r.id, { onSuccess: () => toast.success("Regla eliminada"), onError: (e) => toast.error((e as Error).message) });
  }

  return (
    <>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <div className={styles.searchBox}>
            <Search size={15} className={styles.searchIcon} />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} placeholder="Buscar por nombre o plantilla…" />
          </div>
        </div>
        <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>Nueva regla</Button>
      </div>

      {isLoading ? <div className={styles.center}><Spinner /></div>
        : total === 0 ? <EmptyState icon={<ClipboardCheck size={32} />} title="Sin reglas de checklist" description="Crea una regla para sugerir checklists (permisos de trabajo) automáticamente al preparar una OT." />
        : (
          <>
            {pager}
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr>
                  <th>Regla</th><th>Plantilla</th><th>Aplica a</th><th>Obligatorio</th><th className={styles.num}>Orden</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr key={r.id} className={r.active ? undefined : styles.inactiveRow}>
                      <td><span className={styles.nameCell}>{r.name}</span></td>
                      <td>{r.templateName ?? <span className={styles.muted}>—</span>}</td>
                      <td>
                        {r.appliesToTypeNames.length > 0 ? r.appliesToTypeNames.join(", ") : <span className={styles.muted}>Todos los tipos</span>}
                        {r.minCriticality != null && <div className={styles.cellDesc}>Criticidad ≥ {r.minCriticality}</div>}
                        {r.specialtyName && <div className={styles.cellDesc}>Especialidad: {r.specialtyName}</div>}
                        {r.requiresPtw != null && <div className={styles.cellDesc}>{r.requiresPtw ? "Solo PTW" : "Solo sin PTW"}</div>}
                      </td>
                      <td>{r.mandatory ? <Chip label="Obligatorio" variant="warning" /> : <span className={styles.muted}>Opcional</span>}</td>
                      <td className={styles.num}>{r.sortOrder}</td>
                      <td><span className={styles.muted}>{r.active ? "Activa" : "Inactiva"}</span></td>
                      <td className={styles.actionsCell}>
                        <Button variant="icon" aria-label="Editar" onClick={() => { setEditing(r); setOpen(true); }}><Pencil size={16} /></Button>
                        <Button variant="icon" aria-label="Eliminar" onClick={() => removeRule(r)}><Trash2 size={16} /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager}
          </>
        )}

      <WorkOrderChecklistRuleModal open={open} onClose={() => setOpen(false)} rule={editing} />
    </>
  );
}
