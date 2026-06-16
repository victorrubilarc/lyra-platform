import { useState } from "react";
import { AlertTriangle, CalendarClock, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button, Card, Chip, EmptyState, Table, useToast, type TableColumn } from "@lyra/ui";
import type { LogScheduleDto, OccurrenceQuery } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime, formatDuration } from "../../lib/format.js";
import {
  useDeleteSchedule,
  useGenerateSchedules,
  useOccurrences,
  useOccurrenceStats,
  useSchedules,
} from "./schedules-queries.js";
import { ScheduleDrawer } from "./ScheduleDrawer.js";
import styles from "./SchedulesPage.module.css";

const KIND_LABEL: Record<string, string> = {
  SHIFT: "Por turno",
  INTERVAL: "Intervalo",
  CALENDAR: "Calendario",
  NONE: "—",
};

type OccFilter = "all" | "overdue" | "today";

/**
 * Programación de rondas (PLANIFICADOR, 2.3.1): CRUD de horarios + monitoreo
 * read-only de las ocurrencias. La EJECUCIÓN (iniciar/omitir) vive en el worklist
 * del operador "Mis rondas" (/mis-rondas), gateado por `round:execute`.
 */
export function SchedulesPage() {
  const { can } = usePermissions();
  const manage = can("schedule:manage");
  const toast = useToast();

  const [filter, setFilter] = useState<OccFilter>("all");
  const q: OccurrenceQuery = filter === "overdue" ? { overdueOnly: true } : filter === "today" ? { todayOnly: true } : { status: "PENDING" };
  const occurrences = useOccurrences(q);
  const stats = useOccurrenceStats();
  const schedules = useSchedules();

  const generate = useGenerateSchedules();
  const removeSchedule = useDeleteSchedule();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<LogScheduleDto | null>(null);

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

  const scheduleColumns: TableColumn<LogScheduleDto>[] = [
    { key: "name", header: "Horario", render: (s) => <span className={styles.strong}>{s.name ?? s.templateName ?? "—"}</span> },
    { key: "template", header: "Plantilla", render: (s) => s.templateName ?? "—" },
    { key: "node", header: "Nodo", render: (s) => <>{s.orgNodeName ?? "—"}{s.equipmentTag ? <span className={styles.muted}> · {s.equipmentTag}</span> : null}</> },
    { key: "responsible", header: "Responsable", render: (s) => s.responsibleRoleName ? <Chip label={s.responsibleRoleName} variant="info" /> : <span className={styles.muted}>Todos del nodo</span> },
    { key: "kind", header: "Recurrencia", render: (s) => KIND_LABEL[s.recurrenceKind] ?? s.recurrenceKind },
    { key: "pending", header: "Pendientes", render: (s) => (
      <span>{s.pendingCount ?? 0}{(s.overdueCount ?? 0) > 0 ? <Chip label={`${s.overdueCount} vencidas`} variant="error" className={styles.chip} /> : null}</span>
    ) },
    { key: "active", header: "Estado", render: (s) => <Chip label={s.active ? "Activo" : "Pausado"} variant={s.active ? "success" : "default"} /> },
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

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Programación de rondas</h1>
          <p className={styles.subtitle}>Define los horarios de rondas (turno / intervalo / calendario). Los operadores las ejecutan desde «Mis rondas».</p>
        </div>
        <div className={styles.headerActions}>
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

      {/* KPIs */}
      <div className={styles.kpis}>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{stats.data?.pending ?? "—"}</span><span className={styles.kpiLabel}>Pendientes</span></Card>
        <Card className={`${styles.kpi} ${styles.kpiOverdue}`}><span className={styles.kpiValue}>{stats.data?.overdue ?? "—"}</span><span className={styles.kpiLabel}>Vencidas</span></Card>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{stats.data?.today ?? "—"}</span><span className={styles.kpiLabel}>De hoy</span></Card>
      </div>

      {/* Horarios */}
      <Card className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Horarios programados</h2>
        </div>
        {schedules.isLoading ? (
          <p className={styles.muted}>Cargando…</p>
        ) : (schedules.data ?? []).length === 0 ? (
          <EmptyState
            title="Sin horarios"
            description={manage ? "Cree un horario para que las rondas se abran automáticamente." : "No hay horarios de ronda configurados."}
          />
        ) : (
          <Table data={schedules.data ?? []} columns={scheduleColumns} rowKey={(s) => s.id} />
        )}
      </Card>

      {/* Monitoreo read-only de ocurrencias (la ejecución vive en "Mis rondas") */}
      <Card className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}><CalendarClock size={18} /> Ocurrencias {filter === "overdue" ? "vencidas" : filter === "today" ? "de hoy" : "pendientes"}</h2>
          <div className={styles.filters}>
            <Button variant={filter === "all" ? "primary" : "secondary"} onClick={() => setFilter("all")}>Pendientes</Button>
            <Button variant={filter === "today" ? "primary" : "secondary"} onClick={() => setFilter("today")}>Hoy</Button>
            <Button variant={filter === "overdue" ? "primary" : "secondary"} onClick={() => setFilter("overdue")}>Vencidas</Button>
          </div>
        </div>
        {occurrences.isLoading ? (
          <p className={styles.muted}>Cargando…</p>
        ) : (occurrences.data ?? []).length === 0 ? (
          <EmptyState title="Sin rondas" description="No hay ocurrencias para este filtro." />
        ) : (
          <ul className={styles.occList}>
            {(occurrences.data ?? []).map((o) => (
              <li key={o.id} className={`${styles.occ} ${o.overdue ? styles.occOverdue : ""}`}>
                <div className={styles.occMain}>
                  <div className={styles.occTitle}>
                    {o.scheduleName ?? o.templateName ?? "Ronda"}
                    {o.shiftCode ? <Chip label={`Turno ${o.shiftCode}`} variant="default" className={styles.chip} /> : null}
                    {o.equipmentTag ? <Chip label={o.equipmentTag} variant="default" className={styles.chip} /> : null}
                  </div>
                  <div className={styles.occMeta}>
                    <span>{o.orgNodeName}</span>
                    <span>· Programada: {formatDateTime(o.scheduledFor)}</span>
                    {o.overdue ? (
                      <span className={styles.overdueText}><AlertTriangle size={13} /> Vencida hace {formatDuration(Date.now() - new Date(o.dueAt).getTime())}</span>
                    ) : (
                      <span>· Vence: {formatDateTime(o.dueAt)}</span>
                    )}
                    {o.logEntryId ? <Chip label="En curso" variant="info" className={styles.chip} /> : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ScheduleDrawer open={drawerOpen} schedule={editing} onClose={() => setDrawerOpen(false)} />
    </div>
  );
}
