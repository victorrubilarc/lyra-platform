import { useEffect, useMemo, useState } from "react";
import {
  BookOpen, CalendarClock, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Plus, RefreshCw,
  Repeat, Search, Trash2, X,
} from "lucide-react";
import { Button, Card, Chip, EmptyState, Input, Select, Table, Toggle, useToast, type TableColumn } from "@lyra/ui";
import type { LogScheduleDto, OccurrenceQuery, RoundOccurrenceDto, UpdateLogScheduleRequest } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate, formatTime } from "../../lib/format.js";
import { TemplateFilterModal, type TemplateOption } from "./TemplateFilterModal.js";
import {
  useDeleteSchedule,
  useGenerateSchedules,
  useOccurrences,
  useOccurrenceStats,
  useSchedules,
  useUpdateSchedule,
} from "./schedules-queries.js";
import { ScheduleDrawer } from "./ScheduleDrawer.js";
import styles from "./SchedulesPage.module.css";
import bar from "./MyRoundsPage.module.css";

const WD = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const HM: Intl.DateTimeFormatOptions = { timeStyle: undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function weekdaysLabel(days: number[]): string {
  const k = [...days].sort((a, b) => a - b).join(",");
  if (k === "1,2,3,4,5") return "Lun a Vie";
  if (k === "6,7") return "Fin de semana";
  return [...days].sort((a, b) => a - b).map((d) => WD[d]).join(", ");
}

/** Frecuencia en lenguaje humano (lo que el planificador necesita reconocer de un vistazo). */
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

/** Próxima ronda relativa al día (Hoy / Mañana / fecha), con realce si está atrasada. */
function NextCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className={styles.muted}>—</span>;
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const past = d.getTime() < now.getTime();
  const day = sameDay(d, now) ? "Hoy" : sameDay(d, tomorrow) ? "Mañana" : formatDate(d, { dateStyle: undefined, day: "2-digit", month: "short" });
  return <span className={`${styles.next} ${past ? styles.nextPast : ""}`}>{day} {formatTime(d, HM)}</span>;
}

type OccFilter = "all" | "overdue" | "today";

/**
 * Programación de rondas (PLANIFICADOR): list report estilo SAP PM (IP10/IP24) /
 * IBM Maximo (PM) / Fiori "Manage Maintenance Plans" — filter bar (búsqueda + estado
 * + recurrencia + área), KPIs de salud, frecuencia legible, "próxima ronda" (next call
 * date) y pausar/activar en línea. La EJECUCIÓN vive en "Mis rondas" (operador).
 */
export function SchedulesPage() {
  const { can } = usePermissions();
  const manage = can("schedule:manage");
  const toast = useToast();

  const schedules = useSchedules();
  const stats = useOccurrenceStats();
  const generate = useGenerateSchedules();
  const removeSchedule = useDeleteSchedule();
  const update = useUpdateSchedule();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<LogScheduleDto | null>(null);

  // Filter bar (client-side sobre la lista de horarios).
  const [search, setSearch] = useState("");
  const [estado, setEstado] = useState<"all" | "active" | "paused">("all");
  const [kind, setKind] = useState<string>("all");
  const [area, setArea] = useState<string>("");
  const [tplFilter, setTplFilter] = useState<Set<string>>(new Set());
  const [tplModalOpen, setTplModalOpen] = useState(false);

  // Monitoreo de ocurrencias (plegable; solo se carga al expandir) — grilla paginable.
  const [showOcc, setShowOcc] = useState(false);
  const [occFilter, setOccFilter] = useState<OccFilter>("all");
  const [occSearch, setOccSearch] = useState("");
  const [occPage, setOccPage] = useState(0);
  const [occPageSize, setOccPageSize] = useState(25);
  const occQuery: OccurrenceQuery = occFilter === "overdue" ? { overdueOnly: true } : occFilter === "today" ? { todayOnly: true } : { status: "PENDING" };
  const occurrences = useOccurrences(occQuery, showOcc);

  const allSchedules = useMemo(() => schedules.data ?? [], [schedules.data]);
  const areas = useMemo(() => {
    const set = new Set<string>();
    for (const s of allSchedules) if (s.orgNodeName) set.add(s.orgNodeName);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allSchedules]);

  // Bitácoras DISPONIBLES = las presentes en los horarios visibles (ya acotados por ABAC
  // nodo×plantilla en el backend). El value help solo ofrece estas.
  const templateOptions = useMemo<TemplateOption[]>(() => {
    const m = new Map<string, { name: string; count: number }>();
    for (const s of allSchedules) {
      const cur = m.get(s.templateId);
      if (cur) cur.count += 1;
      else m.set(s.templateId, { name: s.templateName ?? "—", count: 1 });
    }
    return [...m.entries()].map(([id, v]) => ({ id, name: v.name, count: v.count })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allSchedules]);

  const filtered = useMemo(() => {
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

  const kpi = useMemo(() => ({
    active: allSchedules.filter((s) => s.active).length,
    paused: allSchedules.filter((s) => !s.active).length,
  }), [allSchedules]);

  const anyFilter = !!search || estado !== "all" || kind !== "all" || !!area || tplFilter.size > 0;
  function clearFilters() { setSearch(""); setEstado("all"); setKind("all"); setArea(""); setTplFilter(new Set()); }

  // --- Grilla de ocurrencias (búsqueda + paginación client-side sobre lo cargado) ---
  const occAll = useMemo(() => occurrences.data ?? [], [occurrences.data]);
  const occFiltered = useMemo(() => {
    const q = occSearch.trim().toLowerCase();
    if (!q) return occAll;
    return occAll.filter((o) => {
      const hay = `${o.scheduleName ?? ""} ${o.templateName ?? ""} ${o.equipmentTag ?? ""} ${o.orgNodeName ?? ""}`.toLowerCase();
      return q.split(/\s+/).every((t) => hay.includes(t));
    });
  }, [occAll, occSearch]);
  useEffect(() => { setOccPage(0); }, [occSearch, occFilter, occPageSize, showOcc]);
  const occTotal = occFiltered.length;
  const occPages = Math.max(1, Math.ceil(occTotal / occPageSize));
  const occPageSafe = Math.min(occPage, occPages - 1);
  const occSlice = occFiltered.slice(occPageSafe * occPageSize, occPageSafe * occPageSize + occPageSize);

  async function onGenerate() {
    try {
      const r = await generate.mutateAsync(undefined);
      toast.success(`Generación lista (${r.generated} nuevas)`);
    } catch (e) {
      toast.error(`No se pudo generar: ${(e as Error).message}`);
    }
  }

  async function onDelete(s: LogScheduleDto) {
    if (!window.confirm(`¿Eliminar el horario "${s.name ?? s.templateName ?? s.id}"? Las rondas pendientes se cancelan.`)) return;
    try {
      await removeSchedule.mutateAsync(s.id);
      toast.success("Horario eliminado");
    } catch (e) {
      toast.error(`No se pudo eliminar: ${(e as Error).message}`);
    }
  }

  async function onToggleActive(s: LogScheduleDto) {
    const dto: UpdateLogScheduleRequest = {
      name: s.name,
      equipmentId: s.equipmentId,
      responsibleRoleId: s.responsibleRoleId,
      recurrenceKind: s.recurrenceKind,
      recurrenceConfig: s.recurrenceConfig,
      dueWindowMinutes: s.dueWindowMinutes,
      horizonDays: s.horizonDays,
      active: !s.active,
    };
    try {
      await update.mutateAsync({ id: s.id, dto });
      toast.success(s.active ? "Horario pausado" : "Horario activado");
    } catch (e) {
      toast.error(`No se pudo cambiar el estado: ${(e as Error).message}`);
    }
  }

  const KIND_ICON: Record<string, typeof Repeat> = { SHIFT: Repeat, INTERVAL: Clock, CALENDAR: CalendarDays };

  const scheduleColumns: TableColumn<LogScheduleDto>[] = [
    { key: "name", header: "Horario", render: (s) => <span className={styles.strong}>{s.name ?? s.templateName ?? "—"}</span> },
    { key: "template", header: "Plantilla", render: (s) => s.templateName ?? "—" },
    { key: "node", header: "Nodo", render: (s) => <>{s.orgNodeName ?? "—"}{s.equipmentTag ? <span className={styles.muted}> · {s.equipmentTag}</span> : null}</> },
    { key: "responsible", header: "Responsable", render: (s) => s.responsibleRoleName ? <Chip label={s.responsibleRoleName} variant="info" /> : <span className={styles.muted}>Todos del nodo</span> },
    {
      key: "freq", header: "Frecuencia", render: (s) => {
        const Icon = KIND_ICON[s.recurrenceKind] ?? Repeat;
        return <span className={styles.freq}><span className={styles.freqIcon}><Icon size={14} /></span>{describeRecurrence(s)}</span>;
      },
    },
    { key: "next", header: "Próxima ronda", render: (s) => <NextCell iso={s.nextOccurrenceAt} /> },
    {
      key: "pending", header: "Pendientes", render: (s) => (
        <span>{s.pendingCount ?? 0}{(s.overdueCount ?? 0) > 0 ? <Chip label={`${s.overdueCount} vencidas`} variant="error" className={styles.chip} /> : null}</span>
      ),
    },
    {
      key: "active", header: "Estado", render: (s) => (
        manage
          ? <span className={styles.freq}><Toggle checked={s.active} onChange={() => onToggleActive(s)} /><span className={styles.muted}>{s.active ? "Activo" : "Pausado"}</span></span>
          : <Chip label={s.active ? "Activo" : "Pausado"} variant={s.active ? "success" : "default"} />
      ),
    },
    ...(manage ? [{
      key: "actions",
      header: "",
      render: (s: LogScheduleDto) => (
        <div className={styles.rowActions}>
          <Button variant="secondary" onClick={() => { setEditing(s); setDrawerOpen(true); }}>Editar</Button>
          <Button variant="icon" aria-label="Eliminar" onClick={() => onDelete(s)}><Trash2 size={16} /></Button>
        </div>
      ),
    }] : []),
  ];

  const dm: Intl.DateTimeFormatOptions = { dateStyle: undefined, day: "2-digit", month: "short" };
  const occColumns: TableColumn<RoundOccurrenceDto>[] = [
    { key: "when", header: "Programada", render: (o) => <span className={styles.next}>{formatDate(o.scheduledFor, dm)} {formatTime(o.scheduledFor, HM)}</span> },
    { key: "round", header: "Ronda", render: (o) => <span className={styles.strong}>{o.scheduleName ?? o.templateName ?? "Ronda"}</span> },
    { key: "equip", header: "Equipo", render: (o) => o.equipmentTag ?? "—" },
    { key: "node", header: "Nodo", render: (o) => o.orgNodeName ?? "—" },
    { key: "shift", header: "Turno", render: (o) => o.shiftCode ?? "—" },
    { key: "status", header: "Estado", render: (o) => o.overdue ? <Chip label="Vencida" variant="error" /> : o.logEntryId ? <Chip label="En curso" variant="info" /> : <Chip label="Pendiente" variant="default" /> },
    { key: "due", header: "Vence", render: (o) => <span className={`${styles.next} ${o.overdue ? styles.nextPast : ""}`}>{formatDate(o.dueAt, dm)} {formatTime(o.dueAt, HM)}</span> },
  ];
  const occFrom = occTotal === 0 ? 0 : occPageSafe * occPageSize + 1;
  const occTo = Math.min(occTotal, (occPageSafe + 1) * occPageSize);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Programación de rondas</h1>
          <p className={styles.subtitle}>Define los horarios de rondas (turno / intervalo / calendario). Los operadores las ejecutan desde «Mis rondas».</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => schedules.refetch()} disabled={schedules.isFetching}>
            <RefreshCw size={16} /> Actualizar
          </Button>
          {manage && (
            <Button variant="secondary" onClick={onGenerate} disabled={generate.isPending}>
              <RefreshCw size={16} /> Generar
            </Button>
          )}
          {manage && (
            <Button onClick={() => { setEditing(null); setDrawerOpen(true); }}>
              <Plus size={16} /> Nuevo horario
            </Button>
          )}
        </div>
      </header>

      {/* KPIs de salud */}
      <div className={styles.kpis4}>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{kpi.active}</span><span className={styles.kpiLabel}>Horarios activos</span></Card>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{kpi.paused}</span><span className={styles.kpiLabel}>Pausados</span></Card>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{stats.data?.pending ?? "—"}</span><span className={styles.kpiLabel}>Rondas pendientes</span></Card>
        <Card className={`${styles.kpi} ${styles.kpiOverdue}`}><span className={styles.kpiValue}>{stats.data?.overdue ?? "—"}</span><span className={styles.kpiLabel}>Rondas vencidas</span></Card>
      </div>

      {/* Filter bar */}
      <Card className={bar.toolbar}>
        <div className={bar.searchWrap}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar horario, plantilla, área, equipo o responsable…"
            aria-label="Buscar horarios"
            rightSlot={search ? (
              <button type="button" className={bar.searchClear} onClick={() => setSearch("")} aria-label="Limpiar búsqueda"><X size={14} /></button>
            ) : <Search size={16} aria-hidden="true" />}
          />
        </div>
        <div className={bar.toggles}>
          <Select className={bar.nodoSelect} value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)} aria-label="Estado">
            <option value="all">Todos los estados</option>
            <option value="active">Solo activos</option>
            <option value="paused">Solo pausados</option>
          </Select>
          <Select className={bar.nodoSelect} value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Recurrencia">
            <option value="all">Toda recurrencia</option>
            <option value="SHIFT">Por turno</option>
            <option value="INTERVAL">Intervalo</option>
            <option value="CALENDAR">Calendario</option>
          </Select>
          {areas.length > 1 && (
            <Select className={bar.nodoSelect} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Área">
              <option value="">Todas las áreas</option>
              {areas.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          )}
          {templateOptions.length > 1 && (
            <button type="button" className={`${bar.toggle} ${tplFilter.size > 0 ? bar.toggleOn : ""}`} onClick={() => setTplModalOpen(true)}>
              <BookOpen size={15} /> Bitácoras{tplFilter.size > 0 ? ` · ${tplFilter.size}` : ""}
            </button>
          )}
          {anyFilter && (
            <button type="button" className={bar.clear} onClick={clearFilters}><X size={14} /> Limpiar</button>
          )}
        </div>
      </Card>

      {/* Chips de bitácoras seleccionadas (se muestran luego de elegirlas) */}
      {tplFilter.size > 0 && (
        <div className={styles.tplChips}>
          {[...tplFilter].map((id) => {
            const opt = templateOptions.find((o) => o.id === id);
            return (
              <span key={id} className={styles.tplChip}>
                <BookOpen size={13} /> {opt?.name ?? id}
                <button type="button" className={styles.tplChipX} aria-label={`Quitar ${opt?.name ?? ""}`} onClick={() => setTplFilter((p) => { const n = new Set(p); n.delete(id); return n; })}>
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Tabla de horarios */}
      <Card className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}><CalendarClock size={18} /> Horarios {anyFilter ? `(${filtered.length} de ${allSchedules.length})` : `(${allSchedules.length})`}</h2>
        </div>
        {schedules.isLoading ? (
          <p className={styles.muted}>Cargando…</p>
        ) : allSchedules.length === 0 ? (
          <EmptyState
            icon={<CalendarClock size={28} />}
            title="Sin horarios"
            description={manage ? "Cree un horario para que las rondas se abran automáticamente." : "No hay horarios de ronda configurados."}
          />
        ) : filtered.length === 0 ? (
          <EmptyState title="Sin resultados" description="Ningún horario con estos filtros." action={<Button variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>} />
        ) : (
          <Table data={filtered} columns={scheduleColumns} rowKey={(s) => s.id} />
        )}
      </Card>

      {/* Monitoreo de ocurrencias (plegable; la ejecución vive en "Mis rondas") */}
      <Card className={styles.section}>
        <button type="button" className={styles.collapseToggle} onClick={() => setShowOcc((v) => !v)} aria-expanded={showOcc}>
          {showOcc ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <CalendarClock size={18} /> Ocurrencias generadas (monitoreo)
          <span className={styles.collapseCount}>{showOcc ? "" : "ver"}</span>
        </button>
        {showOcc && (
          <>
            <div className={styles.occToolbar}>
              <div className={styles.filters}>
                <Button variant={occFilter === "all" ? "primary" : "secondary"} onClick={() => setOccFilter("all")}>Pendientes</Button>
                <Button variant={occFilter === "today" ? "primary" : "secondary"} onClick={() => setOccFilter("today")}>Hoy</Button>
                <Button variant={occFilter === "overdue" ? "primary" : "secondary"} onClick={() => setOccFilter("overdue")}>Vencidas</Button>
              </div>
              <div className={styles.occSearch}>
                <Input
                  value={occSearch}
                  onChange={(e) => setOccSearch(e.target.value)}
                  placeholder="Buscar ronda, equipo o nodo…"
                  aria-label="Buscar ocurrencias"
                  rightSlot={occSearch ? (
                    <button type="button" className={bar.searchClear} onClick={() => setOccSearch("")} aria-label="Limpiar"><X size={14} /></button>
                  ) : <Search size={16} aria-hidden="true" />}
                />
              </div>
            </div>
            {occurrences.isLoading ? (
              <p className={styles.muted}>Cargando…</p>
            ) : occTotal === 0 ? (
              <EmptyState title="Sin rondas" description={occSearch ? "Ninguna ocurrencia coincide con la búsqueda." : "No hay ocurrencias para este filtro."} />
            ) : (
              <>
                <Table data={occSlice} columns={occColumns} rowKey={(o) => o.id} />
                <div className={styles.pager}>
                  <span className={styles.pagerRange}>{occFrom}–{occTo} de {occTotal}</span>
                  <div className={styles.pagerBtns}>
                    <Button variant="icon" aria-label="Anterior" disabled={occPageSafe === 0} onClick={() => setOccPage(occPageSafe - 1)}><ChevronLeft size={16} /></Button>
                    <span className={styles.pagerPage}>{occPageSafe + 1} / {occPages}</span>
                    <Button variant="icon" aria-label="Siguiente" disabled={occPageSafe >= occPages - 1} onClick={() => setOccPage(occPageSafe + 1)}><ChevronRight size={16} /></Button>
                  </div>
                  <Select className={bar.nodoSelect} value={String(occPageSize)} onChange={(e) => setOccPageSize(Number(e.target.value))} aria-label="Por página">
                    <option value="25">25 por página</option>
                    <option value="50">50 por página</option>
                    <option value="100">100 por página</option>
                  </Select>
                </div>
              </>
            )}
          </>
        )}
      </Card>

      <ScheduleDrawer open={drawerOpen} schedule={editing} onClose={() => setDrawerOpen(false)} />
      <TemplateFilterModal
        open={tplModalOpen}
        options={templateOptions}
        selected={tplFilter}
        onApply={setTplFilter}
        onClose={() => setTplModalOpen(false)}
      />
    </div>
  );
}
