import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Clock, FileText, Play, RefreshCw, Route, Search, SkipForward, X } from "lucide-react";
import { Button, Card, Chip, EmptyState, GridPager, Input, Modal, Select, useToast } from "@lyra/ui";
import type { RoundOccurrenceDto } from "@lyra/contracts";
import { formatDate, formatDuration, formatTime } from "../../lib/format.js";
import {
  useMyRounds,
  useMyRoundsStats,
  useSkipOccurrence,
  useStartOccurrence,
} from "./schedules-queries.js";
import styles from "./SchedulesPage.module.css";
import my from "./MyRoundsPage.module.css";

type Bucket = "overdue" | "today" | "upcoming";
const BUCKET_ORDER: Bucket[] = ["overdue", "today", "upcoming"];
const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: "Vencidas",
  today: "Pendientes de hoy",
  upcoming: "Próximas",
};

/**
 * Horizonte = "qué tan adelante miro". Las VENCIDAS siempre se ven (son urgentes);
 * esto acota lo que viene. Un horizonte por HORAS deja ver solo lo inminente; "Hoy"
 * = resto del día; "Todas" = sin tope (incluye próximos días).
 */
const HORIZONS: { key: string; label: string; hours: number | null }[] = [
  { key: "1", label: "Próxima hora", hours: 1 },
  { key: "4", label: "Próximas 4 horas", hours: 4 },
  { key: "8", label: "Próximas 8 horas (turno)", hours: 8 },
  { key: "12", label: "Próximas 12 horas", hours: 12 },
  { key: "today", label: "Resto de hoy", hours: null },
  { key: "24", label: "Próximas 24 horas", hours: 24 },
  { key: "all", label: "Todas (próximos días)", hours: null },
];
function endOfTodayTs(): number {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}
// Hora en 24h ("14:00"): estándar operacional, más claro que 12h con a.m./p.m.
const HM: Intl.DateTimeFormatOptions = { timeStyle: undefined, hour: "2-digit", minute: "2-digit", hourCycle: "h23" };

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function bucketOf(o: RoundOccurrenceDto, now: Date): Bucket {
  if (o.overdue) return "overdue";
  return isSameLocalDay(new Date(o.scheduledFor), now) ? "today" : "upcoming";
}
function matchesSearch(o: RoundOccurrenceDto, q: string): boolean {
  if (!q) return true;
  const hay = `${o.scheduleName ?? ""} ${o.templateName ?? ""} ${o.equipmentTag ?? ""} ${o.orgNodeName ?? ""}`.toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((tok) => hay.includes(tok));
}

/**
 * "Mis rondas" (2.3.1): worklist del OPERADOR. Acotado en el backend a sus roles ∩
 * nodos accesibles ∩ rol responsable. La UI lo hace ENCONTRABLE: búsqueda, filtros por
 * equipo/área y agrupación por URGENCIA (Vencidas → Hoy → Próximas) para que el operador
 * vea de un vistazo qué hacer AHORA. Solo ejecución (iniciar/continuar/omitir).
 */
export function MyRoundsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  // Filtros (todos client-side sobre el worklist propio que devuelve el backend).
  const [shiftOnly, setShiftOnly] = useState(false);
  const [horizon, setHorizon] = useState("today");
  const [search, setSearch] = useState("");
  const [nodo, setNodo] = useState<string | null>(null);
  const [equipo, setEquipo] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  // Tope superior (timestamp) de lo que se muestra según el horizonte. null = sin tope.
  // Si la ventana cruza la medianoche, hay que pedir también las próximas (días futuros).
  const horizonHours = HORIZONS.find((h) => h.key === horizon)?.hours ?? null;
  const upperBound =
    horizon === "all" ? null : horizon === "today" ? endOfTodayTs() : Date.now() + (horizonHours ?? 0) * 3_600_000;
  const needsUpcoming = horizon === "all" || (upperBound !== null && upperBound > endOfTodayTs());

  const rounds = useMyRounds({ shiftOnly, includeUpcoming: needsUpcoming });
  const stats = useMyRoundsStats();

  const start = useStartOccurrence();
  const skip = useSkipOccurrence();

  const [skipping, setSkipping] = useState<RoundOccurrenceDto | null>(null);
  const [skipReason, setSkipReason] = useState("");

  const all = useMemo(() => rounds.data ?? [], [rounds.data]);

  // Cascada de filtros: búsqueda → nodo → equipo. Las opciones de cada filtro se
  // calculan sobre el set ya acotado por los anteriores (sin auto-anularse).
  const afterSearch = useMemo(() => all.filter((o) => matchesSearch(o, search)), [all, search]);

  const nodos = useMemo(() => {
    const set = new Map<string, number>();
    for (const o of afterSearch) {
      const n = o.orgNodeName ?? "—";
      set.set(n, (set.get(n) ?? 0) + 1);
    }
    return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [afterSearch]);

  const afterNodo = useMemo(
    () => (nodo ? afterSearch.filter((o) => (o.orgNodeName ?? "—") === nodo) : afterSearch),
    [afterSearch, nodo],
  );

  const equipos = useMemo(() => {
    const set = new Map<string, number>();
    for (const o of afterNodo) {
      if (!o.equipmentTag) continue;
      set.set(o.equipmentTag, (set.get(o.equipmentTag) ?? 0) + 1);
    }
    return [...set.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [afterNodo]);

  const afterEquipo = useMemo(
    () => (equipo ? afterNodo.filter((o) => o.equipmentTag === equipo) : afterNodo),
    [afterNodo, equipo],
  );

  // Ventana de horizonte: las VENCIDAS siempre se ven; lo demás se acota al tope.
  const filtered = useMemo(
    () => (upperBound === null ? afterEquipo : afterEquipo.filter((o) => o.overdue || new Date(o.scheduledFor).getTime() <= upperBound)),
    [afterEquipo, upperBound],
  );

  // Agrupación por urgencia, cada grupo ordenado por vencimiento (lo más urgente arriba).
  const groups = useMemo(() => {
    const now = new Date();
    const by: Record<Bucket, RoundOccurrenceDto[]> = { overdue: [], today: [], upcoming: [] };
    for (const o of filtered) by[bucketOf(o, now)].push(o);
    for (const b of BUCKET_ORDER) by[b].sort((a, c) => new Date(a.dueAt).getTime() - new Date(c.dueAt).getTime());
    return by;
  }, [filtered]);

  // Lista PLANA en orden de urgencia (mantiene la agrupación vía encabezados en línea) +
  // paginación arriba/abajo: el operador conserva la agenda pero sin scroll infinito.
  const flatItems = useMemo(
    () => BUCKET_ORDER.flatMap((b) => groups[b].map((o) => ({ o, bucket: b }))),
    [groups],
  );
  const total = flatItems.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, pages - 1);
  const slice = flatItems.slice(pageSafe * pageSize, pageSafe * pageSize + pageSize);
  useEffect(() => { setPage(0); }, [search, nodo, equipo, shiftOnly, horizon, pageSize]);

  const anyFilter = !!search || !!nodo || !!equipo || shiftOnly || horizon !== "today";
  function clearFilters() {
    setSearch(""); setNodo(null); setEquipo(null); setShiftOnly(false); setHorizon("today");
  }

  async function onStart(occ: RoundOccurrenceDto) {
    try {
      const r = await start.mutateAsync({ id: occ.id });
      navigate(`/bitacoras/${r.logEntryId}/editar`, { state: { backTo: "/mis-rondas", backLabel: "Volver a Mis rondas" } });
    } catch (e) {
      toast.error(`No se pudo iniciar la ronda: ${(e as Error).message}`);
    }
  }

  async function confirmSkip() {
    if (!skipping || skipReason.trim().length < 5) return;
    try {
      await skip.mutateAsync({ id: skipping.id, reason: skipReason.trim() });
      toast.success("Ronda omitida");
      setSkipping(null);
      setSkipReason("");
    } catch (e) {
      toast.error(`No se pudo omitir: ${(e as Error).message}`);
    }
  }

  function renderOcc(o: RoundOccurrenceDto) {
    const now = new Date();
    const sched = new Date(o.scheduledFor);
    const dueMs = new Date(o.dueAt).getTime() - now.getTime();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayLabel = isSameLocalDay(sched, now)
      ? null
      : isSameLocalDay(sched, tomorrow)
        ? "Mañana"
        : formatDate(sched, { dateStyle: undefined, weekday: "short", day: "2-digit", month: "short" });

    let relIcon = <Clock size={12} />;
    let relText: string;
    let relCls = my.relNormal;
    if (o.overdue) {
      relIcon = <AlertTriangle size={12} />;
      relText = `Vencida hace ${formatDuration(-dueMs)}`;
      relCls = my.relOverdue;
    } else if (dueMs <= 3_600_000) {
      relText = `Vence en ${formatDuration(dueMs)}`;
      relCls = my.relSoon;
    } else {
      relText = `Vence ${formatTime(o.dueAt, HM)}`;
    }

    return (
      <li key={o.id} className={`${styles.occ} ${o.overdue ? styles.occOverdue : ""}`}>
        <div className={my.timeCell}>
          {dayLabel && <span className={my.dayLabel}>{dayLabel}</span>}
          <span className={my.timeBig}>{formatTime(o.scheduledFor, HM)}</span>
          <span className={`${my.timeRel} ${relCls}`}>{relIcon} {relText}</span>
        </div>
        <div className={my.rowBody}>
          <div className={styles.occTitle}>
            {o.equipmentTag ? <span className={my.tag}>{o.equipmentTag}</span> : null}
            <span className={my.roundName}>{o.scheduleName ?? o.templateName ?? "Ronda"}</span>
            {o.logEntryId ? <Chip label="En curso" variant="info" className={styles.chip} /> : null}
          </div>
          <div className={styles.occMeta}>
            <span>{o.orgNodeName}</span>
            {o.scheduleName && o.templateName ? <span className={my.metaTpl}><FileText size={12} /> {o.templateName}</span> : null}
            {o.shiftCode ? <span>· Turno {o.shiftCode}</span> : null}
          </div>
        </div>
        <div className={styles.occActions}>
          <Button onClick={() => onStart(o)} disabled={start.isPending}>
            <Play size={15} /> {o.logEntryId ? "Continuar" : "Iniciar"}
          </Button>
          {!o.logEntryId && (
            <Button variant="secondary" onClick={() => { setSkipping(o); setSkipReason(""); }}>
              <SkipForward size={15} /> Omitir
            </Button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Mis rondas</h1>
          <p className={styles.subtitle}>Las rondas que te toca ejecutar en tu turno. Iníciala para abrir la bitácora.</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => rounds.refetch()} disabled={rounds.isFetching}>
            <RefreshCw size={16} /> Actualizar
          </Button>
        </div>
      </header>

      {/* KPIs del worklist propio (resumen) */}
      <div className={styles.kpis}>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{stats.data?.pending ?? "—"}</span><span className={styles.kpiLabel}>Pendientes</span></Card>
        <Card className={`${styles.kpi} ${styles.kpiOverdue}`}><span className={styles.kpiValue}>{stats.data?.overdue ?? "—"}</span><span className={styles.kpiLabel}>Vencidas</span></Card>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{stats.data?.today ?? "—"}</span><span className={styles.kpiLabel}>De hoy</span></Card>
      </div>

      {/* Barra de filtros */}
      <Card className={my.toolbar}>
        <div className={my.searchWrap}>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar ronda, equipo o área…"
            aria-label="Buscar en mis rondas"
            rightSlot={
              search ? (
                <button type="button" className={my.searchClear} onClick={() => setSearch("")} aria-label="Limpiar búsqueda">
                  <X size={14} />
                </button>
              ) : (
                <Search size={16} aria-hidden="true" />
              )
            }
          />
        </div>

        <div className={my.toggles}>
          <Select
            className={my.horizonSelect}
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            aria-label="Horizonte de tiempo"
          >
            {HORIZONS.map((h) => <option key={h.key} value={h.key}>{h.label}</option>)}
          </Select>
          <button type="button" className={`${my.toggle} ${shiftOnly ? my.toggleOn : ""}`} onClick={() => setShiftOnly((v) => !v)}>
            Mi turno
          </button>
          {nodos.length > 1 && (
            <Select
              className={my.nodoSelect}
              value={nodo ?? ""}
              onChange={(e) => setNodo(e.target.value || null)}
              aria-label="Filtrar por área"
            >
              <option value="">Todas las áreas</option>
              {nodos.map(([n, c]) => <option key={n} value={n}>{n} ({c})</option>)}
            </Select>
          )}
          {anyFilter && (
            <button type="button" className={my.clear} onClick={clearFilters}>
              <X size={14} /> Limpiar
            </button>
          )}
        </div>
      </Card>

      {/* Filtro por equipo (cuando hay varios): chips táctiles */}
      {equipos.length > 1 && (
        <div className={my.chipRow}>
          <button type="button" className={`${my.equipChip} ${!equipo ? my.equipChipOn : ""}`} onClick={() => setEquipo(null)}>
            Todos <span className={my.equipCount}>{afterNodo.length}</span>
          </button>
          {equipos.map(([tag, count]) => (
            <button
              key={tag}
              type="button"
              className={`${my.equipChip} ${equipo === tag ? my.equipChipOn : ""}`}
              onClick={() => setEquipo((v) => (v === tag ? null : tag))}
            >
              {tag} <span className={my.equipCount}>{count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Agenda por urgencia (encabezados en línea) + paginación arriba y abajo */}
      {rounds.isLoading ? (
        <Card className={styles.section}><p className={styles.muted}>Cargando…</p></Card>
      ) : total === 0 ? (
        <Card className={styles.section}>
          <EmptyState
            icon={<Route size={28} />}
            title={anyFilter ? "Sin resultados" : "Sin rondas pendientes"}
            description={anyFilter ? "Ningún resultado con estos filtros." : "No tienes rondas para ejecutar ahora. ¡Buen trabajo!"}
            action={anyFilter ? <Button variant="secondary" onClick={clearFilters}>Limpiar filtros</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className={styles.section}>
          <GridPager page={pageSafe} pages={pages} total={total} pageSize={pageSize} unit="rondas" onPage={setPage} onPageSize={setPageSize} />
          <ul className={styles.occList}>
            {slice.map((item, i) => {
              const showHeader = i === 0 || slice[i - 1]?.bucket !== item.bucket;
              return (
                <Fragment key={item.o.id}>
                  {showHeader && (
                    <li className={my.groupRow}>
                      <div className={`${my.groupHead} ${my[`bucket_${item.bucket}`] ?? ""}`}>
                        <span className={my.groupDot} aria-hidden="true" />
                        <h2 className={my.groupTitle}>{BUCKET_LABEL[item.bucket]}</h2>
                        <span className={my.groupCount}>{groups[item.bucket].length}</span>
                      </div>
                    </li>
                  )}
                  {renderOcc(item.o)}
                </Fragment>
              );
            })}
          </ul>
          <GridPager page={pageSafe} pages={pages} total={total} pageSize={pageSize} unit="rondas" onPage={setPage} onPageSize={setPageSize} />
        </Card>
      )}

      <Modal
        open={!!skipping}
        onClose={() => setSkipping(null)}
        title="Omitir ronda"
        footer={
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button variant="secondary" onClick={() => setSkipping(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmSkip} disabled={skipReason.trim().length < 5 || skip.isPending}>Omitir</Button>
          </div>
        }
      >
        <p className={styles.muted}>Indique el motivo (queda auditado). La ronda no se realizará.</p>
        <Input value={skipReason} onChange={(e) => setSkipReason(e.target.value)} placeholder="Motivo de la omisión…" autoFocus />
      </Modal>
    </div>
  );
}
