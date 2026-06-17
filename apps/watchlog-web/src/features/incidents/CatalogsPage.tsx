import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Lock, Pencil, Plus, Search, Tags } from "lucide-react";
import type { IncidentCategoryDto, IncidentTypeDto } from "@lyra/contracts";
import { Button, Chip, EmptyState, GridPager, Input, Select, Spinner, Toggle, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import {
  useIncidentCategoriesAdmin,
  useIncidentTypesAdmin,
  useUpsertIncidentCategory,
  useUpsertIncidentType,
} from "./incidents-queries.js";
import { IncidentTypeModal } from "./IncidentTypeModal.js";
import { IncidentCategoryModal } from "./IncidentCategoryModal.js";
import styles from "./catalogs.module.css";

type ActiveFilter = "all" | "active" | "inactive";

/**
 * Mantenedor de catálogos de incidencias (Tipos + Categorías). Ruta propia
 * `/incidencias/catalogos`, gateada por `incidentcatalog:manage` (la UI solo
 * oculta/deshabilita; el gate real está en el backend).
 */
export function CatalogsPage() {
  const { can } = usePermissions();
  const [tab, setTab] = useState<"types" | "categories">("types");

  if (!can("incidentcatalog:manage")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title="Sin acceso" description="No tienes permiso para administrar los catálogos de incidencias." />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link to="/incidencias" className={styles.back}><ArrowLeft size={14} /> Volver a incidencias</Link>
          <h1 className={styles.h1}><Tags size={22} /> Catálogos de incidencias</h1>
          <p className={styles.sub}>Administra los tipos y categorías disponibles al reportar incidencias.</p>
        </div>
      </header>

      <div className={styles.tabs} role="tablist">
        <button role="tab" aria-selected={tab === "types"} className={tab === "types" ? styles.tabActive : styles.tab} onClick={() => setTab("types")}>Tipos</button>
        <button role="tab" aria-selected={tab === "categories"} className={tab === "categories" ? styles.tabActive : styles.tab} onClick={() => setTab("categories")}>Categorías</button>
      </div>

      {tab === "types" ? <TypesTab /> : <CategoriesTab />}
    </div>
  );
}

/** Barra de filtros compartida (buscador + estado + orden), en UNA línea. */
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

function useCatalogFilter<T extends { name: string; key: string; active: boolean; sortOrder: number }>(rows: T[]) {
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
  return { filtered, pageRows, total, filterProps, pagerProps };
}

function TypesTab() {
  const toast = useToast();
  const { data: types = [], isLoading } = useIncidentTypesAdmin();
  const upsert = useUpsertIncidentType();
  const [editing, setEditing] = useState<IncidentTypeDto | null>(null);
  const [open, setOpen] = useState(false);

  const { pageRows, total, filterProps, pagerProps } = useCatalogFilter(types);
  const existingKeys = useMemo(() => types.map((t) => t.key.toLowerCase()), [types]);

  function toggleActive(t: IncidentTypeDto) {
    upsert.mutate(
      { dto: {
        key: t.key, name: t.name, description: t.description, color: t.color, defaultWorkflowId: t.defaultWorkflowId,
        requiresInvestigation: t.requiresInvestigation, requiresCapa: t.requiresCapa, reportableDefault: t.reportableDefault,
        sortOrder: t.sortOrder, active: !t.active,
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
                  <th>Tipo</th><th>Clave</th><th>Flujo por defecto</th><th>Comportamiento</th><th className={styles.num}>Orden</th><th>Estado</th><th></th>
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
                      <td>
                        <div className={styles.flagsCell}>
                          {t.requiresInvestigation && <Chip label="Investigación" variant="default" />}
                          {t.requiresCapa && <Chip label="CAPA" variant="default" />}
                          {t.reportableDefault && <Chip label="Reportable" variant="warning" />}
                          {!t.requiresInvestigation && !t.requiresCapa && !t.reportableDefault && <span className={styles.muted}>—</span>}
                        </div>
                      </td>
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

      <IncidentTypeModal open={open} onClose={() => setOpen(false)} type={editing} existingKeys={existingKeys} />
    </>
  );
}

function CategoriesTab() {
  const toast = useToast();
  const { data: categories = [], isLoading } = useIncidentCategoriesAdmin();
  const { data: types = [] } = useIncidentTypesAdmin();
  const upsert = useUpsertIncidentCategory();
  const [editing, setEditing] = useState<IncidentCategoryDto | null>(null);
  const [open, setOpen] = useState(false);

  const { pageRows, total, filterProps, pagerProps } = useCatalogFilter(categories);
  const existingKeys = useMemo(() => categories.map((c) => c.key.toLowerCase()), [categories]);
  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);

  function toggleActive(c: IncidentCategoryDto) {
    upsert.mutate(
      { dto: { key: c.key, name: c.name, description: c.description, typeId: c.typeId, sortOrder: c.sortOrder, active: !c.active } },
      { onSuccess: () => toast.success(c.active ? "Categoría desactivada" : "Categoría activada"), onError: (e) => toast.error((e as Error).message) },
    );
  }

  const pager = <GridPager {...pagerProps} />;

  return (
    <>
      <div className={styles.toolbar}>
        <Filters {...filterProps} />
        <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => { setEditing(null); setOpen(true); }}>Nueva categoría</Button>
      </div>

      {isLoading ? <div className={styles.center}><Spinner /></div>
        : total === 0 ? <EmptyState icon={<Tags size={32} />} title="Sin categorías" description="No hay categorías que coincidan con los filtros." />
        : (
          <>
            {pager}
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr>
                  <th>Categoría</th><th>Clave</th><th>Tipo</th><th className={styles.num}>Orden</th><th>Estado</th><th></th>
                </tr></thead>
                <tbody>
                  {pageRows.map((c) => (
                    <tr key={c.id} className={c.active ? undefined : styles.inactiveRow}>
                      <td>
                        {c.name}
                        {c.description && <div className={styles.cellDesc}>{c.description}</div>}
                      </td>
                      <td><span className={styles.mono}>{c.key}</span></td>
                      <td>{c.typeId ? (typeName.get(c.typeId) ?? <span className={styles.muted}>—</span>) : <Chip label="Transversal" variant="default" />}</td>
                      <td className={styles.num}>{c.sortOrder}</td>
                      <td>
                        <span className={styles.toggleCell}>
                          <Toggle checked={c.active} onChange={() => toggleActive(c)} size="sm" aria-label={c.active ? "Desactivar" : "Activar"} />
                          <span className={styles.muted}>{c.active ? "Activo" : "Inactivo"}</span>
                        </span>
                      </td>
                      <td className={styles.actionsCell}>
                        <Button variant="icon" aria-label="Editar" onClick={() => { setEditing(c); setOpen(true); }}><Pencil size={16} /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pager}
          </>
        )}

      <IncidentCategoryModal open={open} onClose={() => setOpen(false)} category={editing} types={types} existingKeys={existingKeys} />
    </>
  );
}
