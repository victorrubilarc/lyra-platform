import { useEffect, useMemo, useState } from "react";
import {
  BarChart3, BookOpen, CalendarClock, CalendarDays, Clock, FileText, ListChecks, Plus, RefreshCw, Repeat,
  Search, Trash2, X,
} from "lucide-react";
import {
  Button, Card, Chip, EmptyState, GridPager, Input, Select, Table, Toggle, Tooltip, useToast,
  type TableColumn, type TableSort,
} from "@lyra/ui";
import type { LogScheduleDto, OccurrenceQuery, RoundOccurrenceDto, UpdateLogScheduleRequest } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate, formatDuration, formatTime } from "../../lib/format.js";
import {
  useDeleteSchedule, useGenerateSchedules, useOccurrences, useSchedules, useUpdateSchedule,
} from "./schedules-queries.js";
import { ScheduleDrawer } from "./ScheduleDrawer.js";
import { TemplateFilterModal, type TemplateOption } from "./TemplateFilterModal.js";
import { MiniBars, type BarItem } from "./MiniBars.js";
import styles from "./SchedulesPage.module.css";
import bar from "./MyRoundsPage.module.css";

const WD = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HM: Intl.DateTimeFormatOptions = { timeStyle: undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
const DM: Intl.DateTimeFormatOptions = { dateStyle: undefined, day: "2-digit", month: "short" };
const KIND_LABEL: Record<string, string> = { SHIFT: "Por turno", INTERVAL: "Intervalo", CALENDAR: "Calendario" };
const KIND_ICON: Record<string, typeof Repeat> = { SHIFT: Repeat, INTERVAL: Clock, CALENDAR: CalendarDays };

function weekdaysLabel(days: number[]): string {
  const k = [...days].sort((a, b) => a - b).join(",");
  if (k === "1,2,3,4,5") return "Lun a Vie";
  if (k === "6,7") return "Fin de semana";
  return [...days].sort((a, b) => a - b).map((d) => WD[d]).join(", ");
}
function describeRecurrence(s: LogScheduleDto): string {
  const c = (s.recurrenceConfig ?? {}) as Record<string, unknown>;
  if (s.recurrenceKind === "SHIFT") {
    const codes = Array.isArray(c.shiftCodes) ? (c.shiftCodes as string[]) : [];
    return codes.length ? `Turnos ${codes.join(", ")}` : "Cada turno";
  }
  if (s.recurrenceKind === "INTERVAL") {
    const m = Number(c.everyMinutes) || 0;
    const every = m % 60 === 0 ? `${m / 60} h` : `${m} min`;
    return `Cada ${every}${c.anchorTime ? ` · desde ${c.anchorTime}` : ""}`;
  }
  if (s.recurrenceKind === "CALENDAR") {
    const times = Array.isArray(c.times) ? (c.times as string[]).join(", ") : "";
    const wd = Array.isArray(c.weekdays) && (c.weekdays as number[]).length ? ` · ${weekdaysLabel(c.weekdays as number[])}` : "";
    return `${times}${wd}` || "Días y horas fijas";
  }
  return "—";
}

function NextCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className={styles.muted}>—</span>;
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const past = d.getTime() < now.getTime();
  const day = same(d, now) ? "Hoy" : same(d, tomorrow) ? "Mañana" : formatDate(d, DM);
  return <span className={`${styles.next} ${past ? styles.nextPast : ""}`}>{day} {formatTime(d, HM)}</span>;
}

// Accesores de orden (controlado; el padre ordena, el Table muestra el indicador).
const SCHED_SORT: Record<string, (s: LogScheduleDto) => string | number> = {
  name: (s) => (s.name ?? s.templateName ?? "").toLowerCase(),
  template: (s) => (s.templateName ?? "").toLowerCase(),
  node: (s) => (s.orgNodeName ?? "").toLowerCase(),
  responsible: (s) => (s.responsibleRoleName ?? "~").toLowerCase(),
  freq: (s) => s.recurrenceKind,
  plazo: (s) => s.dueWindowMinutes,
  next: (s) => (s.nextOccurrenceAt ? new Date(s.nextOccurrenceAt).getTime() : Number.MAX_SAFE_INTEGER),
  pending: (s) => s.pendingCount ?? 0,
  active: (s) => (s.active ? 1 : 0),
};
const OCC_SORT: Record<string, (o: RoundOccurrenceDto) => string | number> = {
  when: (o) => new Date(o.scheduledFor).getTime(),
  round: (o) => (o.scheduleName ?? o.templateName ?? "").toLowerCase(),
  template: (o) => (o.templateName ?? "").toLowerCase(),
  equip: (o) => (o.equipmentTag ?? "~").toLowerCase(),
  node: (o) => (o.orgNodeName ?? "").toLowerCase(),
  shift: (o) => o.shiftCode ?? "~",
  status: (o) => (o.overdue ? 0 : o.logEntryId ? 1 : 2),
  entry: (o) => o.entryNumber ?? Number.MAX_SAFE_INTEGER,
  due: (o) => new Date(o.dueAt).getTime(),
};
function sortRows<T>(rows: T[], acc: Record<string, (r: T) => string | number>, sort: TableSort): T[] {
  const fn = acc[sort.key];
  if (!fn) return rows;
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = fn(a), vb = fn(b);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

type Tab = "horarios" | "ocurrencias" | "resumen";
type OccFilter = "all" | "overdue" | "today";

/**
 * Programación de rondas (PLANIFICADOR): overview page estilo SAP PM (IP10/IP24) /
 * Maximo (PM) / Fiori "Manage Maintenance Plans". Jerarquía: KPIs (sensibles al filtro) →
 * barra de filtros que gobierna TODA la pantalla → pestañas (Horarios · Ocurrencias ·
 * Resumen). Grillas con orden + paginación. La ejecución vive en "Mis rondas" (operador).
 */
export function SchedulesPage() {
  const { can } = usePermissions();
  const manage = can("schedule:manage");
  const toast = useToast();

  const schedules = useSchedules();
  const generate = useGenerateSchedules();
  const removeSchedule = useDeleteSchedule();
  const update = useUpdateSchedule();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<LogScheduleDto | null>(null);

  // Filtros que gobiernan TODA la pantalla (horarios, ocurrencias y resumen).
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"all" | "active" | "paused">("all");
  const [kind, setKind] = useState<string>("all");
  const [area, setArea] = useState<string>("");
  const [equipo, setEquipo] = useState<string>("");
  const [tplFilter, setTplFilter] = useState<Set<string>>(new Set());
  const [tplModalOpen, setTplModalOpen] = useState(false);

  const [tab, setTab] = useState<Tab>("horarios");
  const [schedSort, setSchedSort] = useState<TableSort>({ key: "next", direction: "asc" });
  const [occSort, setOccSort] = useState<TableSort>({ key: "due", direction: "asc" });
  const [occFilter, setOccFilter] = useState<OccFilter>("all");
  const [schedPage, setSchedPage] = useState(0);
  const [schedSize, setSchedSize] = useState(25);
  const [occPage, setOccPage] = useState(0);
  const [occSize, setOccSize] = useState(25);

  const occQuery: OccurrenceQuery = occFilter === "overdue" ? { overdueOnly: true } : occFilter === "today" ? { todayOnly: true } : { status: "PENDING" };
  const occurrences = useOccurrences(occQuery, tab === "ocurrencias");

  const allSchedules = useMemo(() => schedules.data ?? [], [schedules.data]);
  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSchedules) if (s.orgNodeName) set.add(s.orgNodeName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allSchedules]);
  const templateOptions = useMemo<TemplateOption[]>(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const s of allSchedules) {
      const cur = m.get(s.templateId);
      if (cur) cur.count += 1; else m.set(s.templateId, { name: s.templateName ?? "—", count: 1 });
    }
    return [...m.entries()].map(([id, v]) => ({ id, name: v.name, count: v.count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSchedules]);

  // Base = todos los filtros EXCEPTO equipo (para que las opciones de equipo cascadeen).
  const baseFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allSchedules.filter((s) => {
      if (estado === "active" && !s.active) return false;
      if (estado === "paused" && s.active) return false;
      if (kind !== "all" && s.recurrenceKind !== kind) return false;
      if (area && s.orgNodeName !== area) return false;
      if (tplFilter.size > 0 && !tplFilter.has(s.templateId)) return false;
      if (q) {
        const hay = `${s.name ?? ""} ${s.templateName ?? ""} ${s.orgNodeName ?? ""} ${s.equipmentTag ?? ""} ${s.responsibleRoleName ?? ""}`.toLowerCase();
        if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
      }
      return true;
    });
  }, [allSchedules, search, estado, kind, area, tplFilter]);

  // Equipos disponibles EN CONTEXTO con su nodo (cascadea con el área y demás filtros).
  const equipoOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of baseFiltered) if (s.equipmentTag) m.set(s.equipmentTag, s.orgNodeName ?? "—");
    return [...m.entries()].map(([tag, node]) => ({ tag, node })).sort((a, b) => a.tag.localeCompare(b.tag));
  }, [baseFiltered]);

  const filtered = useMemo(
    () => (equipo ? baseFiltered.filter((s) => s.equipmentTag === equipo) : baseFiltered),
    [baseFiltered, equipo],
  );

  const filteredIds = useMemo(() => new Set(filtered.map((s) => s.id)), [filtered]);

  // KPIs SENSIBLES AL FILTRO (de los horarios visibles; los conteos ya vienen por horario).
  const kpi = useMemo(() => ({
    active: filtered.filter((s) => s.active).length,
    paused: filtered.filter((s) => !s.active).length,
    pending: filtered.reduce((a, s) => a + (s.pendingCount ?? 0), 0),
    overdue: filtered.reduce((a, s) => a + (s.overdueCount ?? 0), 0),
  }), [filtered]);

  // Ocurrencias visibles = las del filtro de estado (query) ∩ horarios que pasan los filtros.
  const occVisible = useMemo(
    () => (occurrences.data ?? []).filter((o) => filteredIds.has(o.scheduleId)),
    [occurrences.data, filteredIds],
  );

  // Datos para el Resumen (de los horarios filtrados).
  const charts = useMemo(() => {
    const byArea = new Map<string, number>();
    const byKind = new Map<string, number>();
    for (const s of filtered) {
      byArea.set(s.orgNodeName ?? "—", (byArea.get(s.orgNodeName ?? "—") ?? 0) + (s.pendingCount ?? 0));
      byKind.set(s.recurrenceKind, (byKind.get(s.recurrenceKind) ?? 0) + 1);
    }
    const areaBars: BarItem[] = [...byArea.entries()].map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value).slice(0, 8);
    const kindBars: BarItem[] = ["SHIFT", "INTERVAL", "CALENDAR"].filter((k) => byKind.has(k))
      .map((k) => ({ label: KIND_LABEL[k] ?? k, value: byKind.get(k) ?? 0 }));
    const compliance: BarItem[] = [
      { label: "Al día", value: Math.max(0, kpi.pending - kpi.overdue), tone: "success" },
      { label: "Vencidas", value: kpi.overdue, tone: "error" },
    ];
    return { areaBars, kindBars, compliance };
  }, [filtered, kpi.pending, kpi.overdue]);

  const anyFilter = !!search || estado !== "all" || kind !== "all" || !!area || !!equipo || tplFilter.size > 0;
  function clearFilters() { setSearch(""); setEstado("all"); setKind("all"); setArea(""); setEquipo(""); setTplFilter(new Set()); }

  // Orden (controlado) + paginación (propia, arriba y abajo) de cada grilla.
  const schedSorted = useMemo(() => sortRows(filtered, SCHED_SORT, schedSort), [filtered, schedSort]);
  const schedPages = Math.max(1, Math.ceil(schedSorted.length / schedSize));
  const schedPageSafe = Math.min(schedPage, schedPages - 1);
  const schedSlice = schedSorted.slice(schedPageSafe * schedSize, schedPageSafe * schedSize + schedSize);
  useEffect(() => { setSchedPage(0); }, [filtered, schedSort, schedSize]);

  const occSorted = useMemo(() => sortRows(occVisible, OCC_SORT, occSort), [occVisible, occSort]);
  const occPages = Math.max(1, Math.ceil(occSorted.length / occSize));
  const occPageSafe = Math.min(occPage, occPages - 1);
  const occSlice = occSorted.slice(occPageSafe * occSize, occPageSafe * occSize + occSize);
  useEffect(() => { setOccPage(0); }, [occVisible, occSort, occSize, occFilter]);

  async function onGenerate() {
    try { const r = await generate.mutateAsync(undefined); toast.success(`Generación lista (${r.generated} nuevas)`); }
    catch (e) { toast.error(`No se pudo generar: ${(e as Error).message}`); }
  }
  async function onDelete(s: LogScheduleDto) {
    if (!window.confirm(`¿Eliminar el horario "${s.name ?? s.templateName ?? s.id}"? Las rondas pendientes se cancelan.`)) return;
    try { await removeSchedule.mutateAsync(s.id); toast.success("Horario eliminado"); }
    catch (e) { toast.error(`No se pudo eliminar: ${(e as Error).message}`); }
  }
  async function onToggleActive(s: LogScheduleDto) {
    const dto: UpdateLogScheduleRequest = {
      name: s.name, equipmentId: s.equipmentId, responsibleRoleId: s.responsibleRoleId,
      recurrenceKind: s.recurrenceKind, recurrenceConfig: s.recurrenceConfig,
      dueWindowMinutes: s.dueWindowMinutes, horizonDays: s.horizonDays, active: !s.active,
    };
    try { await update.mutateAsync({ id: s.id, dto }); toast.success(s.active ? "Horario pausado" : "Horario activado"); }
    catch (e) { toast.error(`No se pudo cambiar el estado: ${(e as Error).message}`); }
  }

  const scheduleColumns: TableColumn<LogScheduleDto>[] = [
    { key: "name", header: "Horario", sortable: true, render: (s) => <span className={styles.strong}>{s.name ?? s.templateName ?? "—"}</span> },
    { key: "template", header: "Plantilla", sortable: true, render: (s) => s.templateName ?? "—" },
    { key: "node", header: "Nodo", sortable: true, render: (s) => <>{s.orgNodeName ?? "—"}{s.equipmentTag ? <span className={styles.muted}> · {s.equipmentTag}</span> : null}</> },
    { key: "responsible", header: "Responsable", sortable: true, render: (s) => s.responsibleRoleName ? <Chip label={s.responsibleRoleName} variant="info" /> : <span className={styles.muted}>Todos del nodo</span> },
    { key: "freq", header: "Frecuencia", sortable: true, render: (s) => { const Icon = KIND_ICON[s.recurrenceKind] ?? Repeat; return <span className={styles.freq}><span className={styles.freqIcon}><Icon size={14} /></span>{describeRecurrence(s)}</span>; } },
    { key: "plazo", header: "Plazo", sortable: true, align: "right", render: (s) => <span className={styles.muted}>{formatDuration(s.dueWindowMinutes * 60000)}</span> },
    { key: "next", header: "Próxima ronda", sortable: true, render: (s) => <NextCell iso={s.nextOccurrenceAt} /> },
    { key: "pending", header: "Pendientes", sortable: true, align: "right", render: (s) => <span>{s.pendingCount ?? 0}{(s.overdueCount ?? 0) > 0 ? <Chip label={`${s.overdueCount} venc.`} variant="error" className={styles.chip} /> : null}</span> },
    { key: "active", header: "Estado", sortable: true, render: (s) => manage
        ? <span className={styles.freq}><Toggle checked={s.active} onChange={() => onToggleActive(s)} /><span className={styles.muted}>{s.active ? "Activo" : "Pausado"}</span></span>
        : <Chip label={s.active ? "Activo" : "Pausado"} variant={s.active ? "success" : "default"} /> },
    ...(manage ? [{
      key: "actions", header: "", render: (s: LogScheduleDto) => (
        <div className={styles.rowActions}>
          <Button variant="secondary" onClick={() => { setEditing(s); setDrawerOpen(true); }}>Editar</Button>
          <Button variant="icon" aria-label="Eliminar" onClick={() => onDelete(s)}><Trash2 size={16} /></Button>
        </div>
      ),
    }] : []),
  ];

  const occColumns: TableColumn<RoundOccurrenceDto>[] = [
    { key: "when", header: "Programada", sortable: true, render: (o) => <span className={styles.next}>{formatDate(o.scheduledFor, DM)} {formatTime(o.scheduledFor, HM)}</span> },
    { key: "round", header: "Ronda", sortable: true, render: (o) => <span className={styles.strong}>{o.scheduleName ?? o.templateName ?? "Ronda"}</span> },
    { key: "template", header: "Plantilla", sortable: true, render: (o) => <span className={styles.muted}>{o.templateName ?? "—"}</span> },
    { key: "equip", header: "Equipo", sortable: true, render: (o) => o.equipmentTag ?? "—" },
    { key: "node", header: "Nodo", sortable: true, render: (o) => o.orgNodeName ?? "—" },
    { key: "shift", header: "Turno", sortable: true, render: (o) => o.shiftCode ?? "—" },
    { key: "status", header: "Estado", sortable: true, render: (o) => o.overdue ? <Chip label="Vencida" variant="error" /> : o.logEntryId ? <Chip label="En curso" variant="info" /> : <Chip label="Pendiente" variant="default" /> },
    { key: "entry", header: "Entrada", sortable: true, render: (o) => o.entryNumber != null ? <span className={styles.freq}><FileText size={13} /> N.º {o.entryNumber}</span> : <span className={styles.muted}>—</span> },
    { key: "due", header: "Vence", sortable: true, align: "right", render: (o) => <span className={`${styles.next} ${o.overdue ? styles.nextPast : ""}`}>{formatDate(o.dueAt, DM)} {formatTime(o.dueAt, HM)}</span> },
  ];

  const schedEmpty = (
    <EmptyState
      icon={<CalendarClock size={28} />}
      title={anyFilter ? "Sin resultados" : "Sin horarios"}
      description={anyFilter ? "Ningún horario con estos filtros." : manage ? "Cree un horario para que las rondas se abran automáticamente." : "No hay horarios de ronda configurados."}
      action={anyFilter ? <Button variant="secondary" onClick={clearFilters}>Limpiar filtros</Button> : undefined}
    />
  );

  const TABS: { id: Tab; label: string; icon: typeof ListChecks; badge?: number }[] = [
    { id: "horarios", label: "Horarios", icon: ListChecks, badge: filtered.length },
    { id: "ocurrencias", label: "Ocurrencias", icon: CalendarClock },
    { id: "resumen", label: "Resumen", icon: BarChart3 },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Programación de rondas</h1>
          <p className={styles.subtitle}>Define los horarios de rondas (turno / intervalo / calendario). Los operadores las ejecutan desde «Mis rondas».</p>
        </div>
        <div className={styles.headerActions}>
          <Tooltip label="Recargar los horarios desde el servidor">
            <Button variant="secondary" onClick={() => schedules.refetch()} disabled={schedules.isFetching}><RefreshCw size={16} /> Actualizar</Button>
          </Tooltip>
          {manage && (
            <Tooltip label="Crear un horario de ronda (plantilla · nodo · frecuencia)">
              <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}><Plus size={16} /> Nuevo horario</Button>
            </Tooltip>
          )}
        </div>
      </header>

      {/* KPIs (sensibles al filtro) */}
      <div className={styles.kpis4}>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{kpi.active}</span><span className={styles.kpiLabel}>Horarios activos</span></Card>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{kpi.paused}</span><span className={styles.kpiLabel}>Pausados</span></Card>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{kpi.pending}</span><span className={styles.kpiLabel}>Rondas pendientes</span></Card>
        <Card className={`${styles.kpi} ${styles.kpiOverdue}`}><span className={styles.kpiValue}>{kpi.overdue}</span><span className={styles.kpiLabel}>Rondas vencidas</span></Card>
      </div>

      {/* Barra de filtros (gobierna toda la pantalla) */}
      <Card className={styles.filterBar}>
        <div className={styles.filterSearch}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar horario, plantilla, área, equipo o responsable…"
            aria-label="Buscar"
            rightSlot={search ? (
              <button type="button" className={bar.searchClear} onClick={() => setSearch("")} aria-label="Limpiar búsqueda"><X size={14} /></button>
            ) : <Search size={16} aria-hidden="true" />}
          />
        </div>
        <Select className={styles.filterSelect} value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} aria-label="Estado">
          <option value="all">Todos los estados</option>
          <option value="active">Solo activos</option>
          <option value="paused">Solo pausados</option>
        </Select>
        <Select className={styles.filterSelect} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Recurrencia">
          <option value="all">Toda recurrencia</option>
          <option value="SHIFT">Por turno</option>
          <option value="INTERVAL">Intervalo</option>
          <option value="CALENDAR">Calendario</option>
        </Select>
        {areas.length > 1 && (
          <Select className={styles.filterSelect} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </Select>
        )}
        {equipoOptions.length > 0 && (
          <Select className={styles.filterSelect} value={equipo} onChange={(e) => setEquipo(e.target.value)} aria-label="Equipo">
            <option value="">Todos los equipos</option>
            {equipoOptions.map((e) => <option key={e.tag} value={e.tag}>{e.tag} · {e.node}</option>)}
          </Select>
        )}
        {templateOptions.length > 1 && (
          <button type="button" className={`${styles.filterBtn} ${tplFilter.size > 0 ? styles.filterBtnOn : ""}`} onClick={() => setTplModalOpen(true)}>
            <BookOpen size={16} /> Bitácoras{tplFilter.size > 0 ? ` · ${tplFilter.size}` : ""}
          </button>
        )}
        {anyFilter && <button type="button" className={styles.clearBtn} onClick={clearFilters}><X size={14} /> Limpiar</button>}
      </Card>

      {tplFilter.size > 0 && (
        <div className={styles.tplChips}>
          {[...tplFilter].map((id) => {
            const opt = templateOptions.find((o) => o.id === id);
            return (
              <span key={id} className={styles.tplChip}>
                <BookOpen size={13} /> {opt?.name ?? id}
                <button type="button" className={styles.tplChipX} aria-label={`Quitar ${opt?.name ?? ""}`} onClick={() => setTplFilter((p) => { const n = new Set(p); n.delete(id); return n; })}><X size={12} /></button>
              </span>
            );
          })}
        </div>
      )}

      {/* Pestañas */}
      <div className={styles.tabs} role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`${styles.tab} ${tab === t.id ? styles.tabOn : ""}`} onClick={() => setTab(t.id)}>
              <Icon size={16} /> {t.label}
              {t.badge !== undefined && <span className={styles.tabBadge}>{t.badge}</span>}
            </button>
          );
        })}
      </div>

      {tab === "horarios" && (
        <Card className={styles.section}>
          {schedSorted.length > 0 && (
            <GridPager page={schedPageSafe} pages={schedPages} total={schedSorted.length} pageSize={schedSize} unit="horarios" onPage={setSchedPage} onPageSize={setSchedSize} />
          )}
          <Table
            data={schedSlice}
            columns={scheduleColumns}
            rowKey={(s) => s.id}
            loading={schedules.isLoading}
            sort={schedSort}
            onSort={(key, direction) => setSchedSort({ key, direction })}
            emptyState={schedEmpty}
          />
          {schedSorted.length > 0 && (
            <GridPager page={schedPageSafe} pages={schedPages} total={schedSorted.length} pageSize={schedSize} unit="horarios" onPage={setSchedPage} onPageSize={setSchedSize} />
          )}
        </Card>
      )}

      {tab === "ocurrencias" && (
        <Card className={styles.section}>
          <div className={styles.occHead}>
            <div className={styles.filters}>
              <Button variant={occFilter === "all" ? "primary" : "secondary"} onClick={() => setOccFilter("all")}>Pendientes</Button>
              <Button variant={occFilter === "today" ? "primary" : "secondary"} onClick={() => setOccFilter("today")}>Hoy</Button>
              <Button variant={occFilter === "overdue" ? "primary" : "secondary"} onClick={() => setOccFilter("overdue")}>Vencidas</Button>
            </div>
            {manage && (
              <Tooltip label="Prepara (materializa) las próximas rondas ahora. Normalmente se generan solas al abrir la pantalla.">
                <Button variant="secondary" onClick={onGenerate} disabled={generate.isPending}><RefreshCw size={16} /> Generar rondas</Button>
              </Tooltip>
            )}
          </div>
          {occSorted.length > 0 && (
            <GridPager page={occPageSafe} pages={occPages} total={occSorted.length} pageSize={occSize} unit="rondas" onPage={setOccPage} onPageSize={setOccSize} />
          )}
          <Table
            data={occSlice}
            columns={occColumns}
            rowKey={(o) => o.id}
            loading={occurrences.isLoading}
            sort={occSort}
            onSort={(key, direction) => setOccSort({ key, direction })}
            emptyState={<EmptyState icon={<CalendarClock size={28} />} title="Sin ocurrencias" description={anyFilter ? "Ninguna ocurrencia de los horarios filtrados." : "No hay ocurrencias para este filtro."} />}
          />
          {occSorted.length > 0 && (
            <GridPager page={occPageSafe} pages={occPages} total={occSorted.length} pageSize={occSize} unit="rondas" onPage={setOccPage} onPageSize={setOccSize} />
          )}
        </Card>
      )}

      {tab === "resumen" && (
        <div className={styles.charts}>
          <Card className={styles.chartCard}>
            <h3 className={styles.chartTitle}><CalendarClock size={16} /> Rondas pendientes por área</h3>
            <MiniBars items={charts.areaBars} empty="Sin horarios visibles." />
          </Card>
          <Card className={styles.chartCard}>
            <h3 className={styles.chartTitle}><Repeat size={16} /> Horarios por recurrencia</h3>
            <MiniBars items={charts.kindBars} empty="Sin horarios visibles." />
          </Card>
          <Card className={styles.chartCard}>
            <h3 className={styles.chartTitle}><BarChart3 size={16} /> Cumplimiento de rondas</h3>
            <MiniBars items={charts.compliance} empty="Sin rondas." />
            <p className={styles.chartNote}>{kpi.pending} pendientes · {kpi.overdue} vencidas{kpi.pending > 0 ? ` · ${Math.round((kpi.overdue / kpi.pending) * 100)}% atrasadas` : ""}</p>
          </Card>
        </div>
      )}

      <ScheduleDrawer open={drawerOpen} schedule={editing} onClose={() => setDrawerOpen(false)} />
      <TemplateFilterModal open={tplModalOpen} options={templateOptions} selected={tplFilter} onApply={setTplFilter} onClose={() => setTplModalOpen(false)} />
    </div>
  );
}
