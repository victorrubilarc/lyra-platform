import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Play, Route, SkipForward } from "lucide-react";
import { Button, Card, Chip, EmptyState, Input, Modal, useToast } from "@lyra/ui";
import type { MyRoundsQuery, RoundOccurrenceDto } from "@lyra/contracts";
import { formatDateTime, formatDuration } from "../../lib/format.js";
import {
  useMyRounds,
  useMyRoundsStats,
  useSkipOccurrence,
  useStartOccurrence,
} from "./schedules-queries.js";
import styles from "./SchedulesPage.module.css";

type Filter = "today" | "shift" | "overdue" | "upcoming";

const FILTER_QUERY: Record<Filter, MyRoundsQuery> = {
  today: {},
  shift: { shiftOnly: true },
  overdue: { overdueOnly: true },
  upcoming: { includeUpcoming: true },
};

/**
 * "Mis rondas" (2.3.1): worklist del OPERADOR. Acotado en el backend a sus roles ∩
 * nodos accesibles ∩ rol responsable. Solo EJECUCIÓN (iniciar/continuar/omitir);
 * la administración de horarios vive en «Programación de rondas». Patrón My
 * Maintenance Tasks/Fiori · Start Center/Maximo · shift logbook/j5.
 */
export function MyRoundsPage() {
  const navigate = useNavigate();
  const toast = useToast();

  const [filter, setFilter] = useState<Filter>("today");
  const rounds = useMyRounds(FILTER_QUERY[filter]);
  const stats = useMyRoundsStats();

  const start = useStartOccurrence();
  const skip = useSkipOccurrence();

  const [skipping, setSkipping] = useState<RoundOccurrenceDto | null>(null);
  const [skipReason, setSkipReason] = useState("");

  async function onStart(occ: RoundOccurrenceDto) {
    try {
      const r = await start.mutateAsync({ id: occ.id });
      navigate(`/bitacoras/${r.logEntryId}/editar`);
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

  const list = rounds.data ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Mis rondas</h1>
          <p className={styles.subtitle}>Las rondas que te toca ejecutar en tu turno. Iníciala para abrir la bitácora.</p>
        </div>
      </header>

      {/* KPIs del worklist propio */}
      <div className={styles.kpis}>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{stats.data?.pending ?? "—"}</span><span className={styles.kpiLabel}>Pendientes</span></Card>
        <Card className={`${styles.kpi} ${styles.kpiOverdue}`}><span className={styles.kpiValue}>{stats.data?.overdue ?? "—"}</span><span className={styles.kpiLabel}>Vencidas</span></Card>
        <Card className={styles.kpi}><span className={styles.kpiValue}>{stats.data?.today ?? "—"}</span><span className={styles.kpiLabel}>De hoy</span></Card>
      </div>

      <Card className={styles.section}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}><Route size={18} /> Rondas para ejecutar</h2>
          <div className={styles.filters}>
            <Button variant={filter === "today" ? "primary" : "secondary"} onClick={() => setFilter("today")}>Pendientes</Button>
            <Button variant={filter === "shift" ? "primary" : "secondary"} onClick={() => setFilter("shift")}>Mi turno</Button>
            <Button variant={filter === "overdue" ? "primary" : "secondary"} onClick={() => setFilter("overdue")}>Vencidas</Button>
            <Button variant={filter === "upcoming" ? "primary" : "secondary"} onClick={() => setFilter("upcoming")}>Próximas</Button>
          </div>
        </div>
        {rounds.isLoading ? (
          <p className={styles.muted}>Cargando…</p>
        ) : list.length === 0 ? (
          <EmptyState title="Sin rondas" description="No tienes rondas para ejecutar con este filtro." />
        ) : (
          <ul className={styles.occList}>
            {list.map((o) => (
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
            ))}
          </ul>
        )}
      </Card>

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
