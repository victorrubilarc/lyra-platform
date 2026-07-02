import { Fragment, useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, History, ListChecks, Lock, Pencil, Plus, ShieldAlert, ShieldCheck, Sparkles, TrendingUp, Trash2, Wand2 } from "lucide-react";
import {
  activityDeviationLabel,
  activityEndDeviationDays,
  effectiveProgressPct,
  planReadyToFreeze,
  summarizeActivities,
  type CreateWorkActivityRequest,
  type RecordWorkActivityProgressRequest,
  type WorkActivityDto,
  type WorkActivityStatus,
  type WorkOrderDetail,
} from "@lyra/contracts";
import { Button, Input, Modal, Select, Stepper, Textarea, useToast, type Step } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate, formatDateTime } from "../../lib/format.js";
import { ACTIVITY_STATUS_META, PRIORITY_META } from "./work-orders-presentation.js";
import {
  useCreateWorkOrderActivitiesBatch,
  useCreateWorkOrderActivity,
  useRecordWorkOrderActivityProgress,
  useRemoveWorkOrderActivity,
  useReorderWorkOrderActivities,
  useUpdateWorkOrderActivity,
  useWorkOrderActivities,
  useWorkOrderActivityUpdates,
  useWorkOrderAssignableUsers,
  useWorkOrderChecklists,
  useWorkOrderSpecialties,
} from "./work-orders-queries.js";
import styles from "./work-orders.module.css";

/** Convierte un valor de <input type="datetime-local"> a ISO, o null si vacío. */
function isoOrNull(v: string): string | null {
  return v ? new Date(v).toISOString() : null;
}
/** ISO → valor para <input type="datetime-local"> (yyyy-MM-ddThh:mm en hora local). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Pestaña PLAN de una OT (Puerta 3, S4). La vista principal es SIEMPRE la GRILLA con
 * todas las actividades configuradas y su información a la vista (estilo EAM: SAP PM /
 * Maximo operations). Agregar/editar se hace en un MODAL: «Agregar actividad» (formulario)
 * o «Asistente guiado» (Stepper que arma varias de una). Una vez autorizado el plan
 * (baseline congelada) todo pasa a solo lectura + seguimiento de desviación. El bloqueo de
 * la Puerta 3 se EXPLICA (falta ≥1 actividad).
 */
export function WorkOrderPlanBlock({ wo, isLive }: { wo: WorkOrderDetail; isLive: boolean }) {
  const { can } = usePermissions();
  const manage = can("workorder:activity:manage");
  const { data: activities = [], isLoading } = useWorkOrderActivities(wo.id);
  const { data: checklists = [] } = useWorkOrderChecklists(wo.id);
  const frozen = !!wo.planFrozenAt;
  // Verificaciones de EJECUCIÓN por actividad (Slice B): indicador de solo lectura de qué
  // bloquea el DONE de cada tarea (la gestión vive en la pestaña «Verificaciones»).
  const execByActivity = useMemo(() => {
    const map = new Map<string, { total: number; pending: number }>();
    for (const c of checklists) {
      if (c.moment !== "EXECUTION" || !c.workActivityId) continue;
      const e = map.get(c.workActivityId) ?? { total: 0, pending: 0 };
      e.total += 1;
      if (c.mandatory && c.status !== "APPROVED") e.pending += 1;
      map.set(c.workActivityId, e);
    }
    return map;
  }, [checklists]);
  const summary = useMemo(() => summarizeActivities(activities), [activities]);
  const canEdit = isLive && manage && !frozen;
  // Tras autorizar el plan (baseline congelada) el plan es inmutable, pero la
  // EJECUCIÓN se registra encima: se puede marcar avance por actividad.
  const canProgress = isLive && manage && frozen;

  // `null` = sin modal; "new" = agregar (formulario); una actividad = editar.
  const [editing, setEditing] = useState<WorkActivityDto | "new" | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [progressing, setProgressing] = useState<WorkActivityDto | null>(null);

  return (
    <>
      <div className={styles.sectionTitle}><ListChecks size={15} /> Plan de actividades</div>

      {/* Cabecera de etapa: dónde estás + próxima acción + guard explicado */}
      <PlanStageBanner wo={wo} activities={activities} frozen={frozen} />

      {/* Resumen del plan (chips) */}
      {activities.length > 0 && (
        <div className={styles.planSummary}>
          <span className={styles.planChip}>{summary.total} actividad{summary.total === 1 ? "" : "es"}</span>
          <span className={styles.planChip}>{summary.done} completada{summary.done === 1 ? "" : "s"}</span>
          {summary.blocking > 0 && <span className={styles.planChipWarn}>{summary.blocking} obligatoria{summary.blocking === 1 ? "" : "s"} abierta{summary.blocking === 1 ? "" : "s"}</span>}
          <span className={styles.planChip}>Avance {summary.progressPct}%</span>
        </div>
      )}

      {/* Acciones: agregar (form) o asistente (guiado) — ambas en modal. */}
      {canEdit && activities.length > 0 && (
        <div className={styles.actions}>
          <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setEditing("new")}>Agregar actividad</Button>
          <Button variant="secondary" leftIcon={<Wand2 size={15} />} onClick={() => setWizardOpen(true)}>Asistente guiado</Button>
        </div>
      )}

      {isLoading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : (
        <ActivityGrid
          wo={wo}
          activities={activities}
          execByActivity={execByActivity}
          canEdit={canEdit}
          canProgress={canProgress}
          frozen={frozen}
          onEdit={(a) => setEditing(a)}
          onProgress={(a) => setProgressing(a)}
          onAdd={() => setEditing("new")}
          onWizard={() => setWizardOpen(true)}
        />
      )}

      {editing && (
        <ActivityModal wo={wo} activity={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />
      )}
      {progressing && (
        <ProgressModal wo={wo} activity={progressing} onClose={() => setProgressing(null)} />
      )}
      {wizardOpen && (
        <Modal open onClose={() => setWizardOpen(false)} size="xl" title="Asistente de plan de actividades">
          <PlanWizard wo={wo} onDone={() => setWizardOpen(false)} />
        </Modal>
      )}
    </>
  );
}

/** Banner de etapa: explica dónde está la OT en el plan y la próxima acción esperada. */
function PlanStageBanner({ wo, activities, frozen }: { wo: WorkOrderDetail; activities: WorkActivityDto[]; frozen: boolean }) {
  if (frozen) {
    const inExecution = wo.currentStateKey === "en_ejecucion" || wo.currentStateKey === "en_revision_cierre";
    const summary = summarizeActivities(activities);
    return (
      <p className={styles.planBannerOk}>
        <Lock size={15} />
        {inExecution
          ? `Plan autorizado — registra el avance de cada actividad (${summary.done}/${summary.total} completadas · ${summary.progressPct}%). Las obligatorias deben cerrarse para poder cerrar la OT.`
          : `Plan autorizado — baseline congelada el ${formatDate(wo.planFrozenAt!)}. La ejecución se compara contra esta línea base.`}
      </p>
    );
  }
  const inPlanning = wo.currentStateKey === "en_planificacion";
  const ready = planReadyToFreeze(activities);
  if (inPlanning) {
    return (
      <p className={ready ? styles.planBanner : styles.planBannerWarn}>
        {ready ? <Sparkles size={15} /> : <ShieldAlert size={15} />}
        {ready
          ? "Plan listo. Próxima acción: «Autorizar plan» (pestaña Resumen) para congelar la baseline."
          : "Agrega al menos una actividad para poder autorizar el plan."}
      </p>
    );
  }
  return (
    <p className={styles.planBanner}>
      <CalendarClock size={15} /> Define aquí el plan de trabajo. Se autoriza (y congela la baseline) al llegar a la etapa de planificación.
    </p>
  );
}

// === Grilla de actividades (tabla enterprise) ==================================

function ActivityGrid({
  wo,
  activities,
  execByActivity,
  canEdit,
  canProgress,
  frozen,
  onEdit,
  onProgress,
  onAdd,
  onWizard,
}: {
  wo: WorkOrderDetail;
  activities: WorkActivityDto[];
  execByActivity: Map<string, { total: number; pending: number }>;
  canEdit: boolean;
  canProgress: boolean;
  frozen: boolean;
  onEdit: (a: WorkActivityDto) => void;
  onProgress: (a: WorkActivityDto) => void;
  onAdd: () => void;
  onWizard: () => void;
}) {
  const toast = useToast();
  const remove = useRemoveWorkOrderActivity(wo.id);
  const reorder = useReorderWorkOrderActivities(wo.id);
  const err = (e: unknown) => toast.error((e as Error).message);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= activities.length) return;
    const ids = activities.map((a) => a.id);
    const tmp = ids[index]!;
    ids[index] = ids[target]!;
    ids[target] = tmp;
    reorder.mutate({ orderedIds: ids }, { onError: err });
  };

  // Estado vacío profesional (no volcar el asistente): explica y ofrece las 2 vías.
  if (activities.length === 0) {
    return (
      <div className={styles.planEmpty}>
        <ListChecks size={26} />
        <p className={styles.planEmptyTitle}>Aún no hay actividades en el plan</p>
        <p className={styles.muted}>Define las tareas del trabajo: agrégalas una a una o usa el asistente guiado para armarlas de una vez.</p>
        {canEdit && (
          <div className={styles.actions}>
            <Button variant="primary" leftIcon={<Plus size={15} />} onClick={onAdd}>Agregar actividad</Button>
            <Button variant="secondary" leftIcon={<Wand2 size={15} />} onClick={onWizard}>Asistente guiado</Button>
          </div>
        )}
      </div>
    );
  }

  const anyHistory = activities.some((a) => a.updatesCount > 0);
  const showActions = canEdit || canProgress || anyHistory;
  // # + Actividad + Responsable + Especialidad + Prioridad + Plan + Estado (+ Avance si frozen) (+ Acciones)
  const totalCols = 7 + (frozen ? 1 : 0) + (showActions ? 1 : 0);

  return (
    <div className={styles.tableCard}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th style={{ width: 36 }}>#</th>
            <th>Actividad</th>
            <th>Responsable</th>
            <th>Especialidad</th>
            <th>Prioridad</th>
            <th>Plan</th>
            <th>Estado</th>
            {frozen && <th style={{ width: 150 }}>Avance</th>}
            {showActions && <th style={{ width: 170, textAlign: "right" }}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {activities.map((a, i) => {
            const meta = ACTIVITY_STATUS_META[a.status];
            const dev = activityEndDeviationDays(a);
            const expanded = expandedId === a.id;
            return (
              <Fragment key={a.id}>
                <tr>
                  <td className={styles.mono}>{i + 1}</td>
                  <td className={styles.titleCell}>
                    <div className={styles.planCellTitle}>
                      {a.title}
                      {a.mandatory && <span className={styles.clMandatory}>Obligatoria</span>}
                    </div>
                    {a.description && <div className={styles.planCellSub}>{a.description}</div>}
                    {(() => {
                      const ex = execByActivity.get(a.id);
                      if (!ex || ex.total === 0) return null;
                      return ex.pending > 0 ? (
                        <div className={styles.planCellSub} style={{ color: "var(--color-warning)" }}>
                          <ShieldAlert size={12} /> {ex.pending} verificación(es) de ejecución pendiente(s) — ver «Verificaciones»
                        </div>
                      ) : (
                        <div className={styles.planCellSub} style={{ color: "var(--color-success)" }}>
                          <ShieldCheck size={12} /> Verificaciones de ejecución aprobadas
                        </div>
                      );
                    })()}
                  </td>
                  <td>{a.responsibleName ?? <span className={styles.muted}>—</span>}</td>
                  <td>{a.specialtyName ?? <span className={styles.muted}>—</span>}</td>
                  <td>{a.priority ? <span style={{ color: PRIORITY_META[a.priority].color, fontWeight: 600 }}>{PRIORITY_META[a.priority].label}</span> : <span className={styles.muted}>—</span>}</td>
                  <td>
                    {a.plannedStart ? (
                      <>{formatDate(a.plannedStart)}{a.plannedEnd ? ` → ${formatDate(a.plannedEnd)}` : ""}</>
                    ) : (
                      <span className={styles.muted}>—</span>
                    )}
                    {frozen && dev != null && dev !== 0 && (
                      <span className={dev > 0 ? styles.devLate : styles.devEarly}> · {dev > 0 ? `+${dev}d` : `${dev}d`}</span>
                    )}
                  </td>
                  <td><span className={styles.lifeChip} style={{ color: meta.color }}>{meta.label}</span></td>
                  {frozen && (
                    <td>
                      <div className={styles.progressCell}>
                        <div className={styles.progressBarTrack}>
                          <div className={styles.progressBarFill} style={{ width: `${a.progressPct}%`, background: meta.color }} />
                        </div>
                        <div className={styles.progressMeta}>
                          <span className={styles.progressPct}>{a.progressPct}%</span>
                          {a.lastProgressAt && <span className={styles.progressLastAt}>· {formatDate(a.lastProgressAt)}</span>}
                        </div>
                      </div>
                    </td>
                  )}
                  {showActions && (
                    <td>
                      <div className={styles.rowActions}>
                        {canProgress && (
                          <Button
                            variant="icon"
                            leftIcon={<TrendingUp size={14} />}
                            disabled={a.status === "CANCELED"}
                            onClick={() => onProgress(a)}
                            aria-label="Registrar avance"
                            title={a.status === "CANCELED" ? "Actividad cancelada" : "Registrar avance"}
                          />
                        )}
                        {a.updatesCount > 0 && (
                          <Button
                            variant="icon"
                            leftIcon={<History size={14} />}
                            onClick={() => setExpandedId(expanded ? null : a.id)}
                            aria-label="Ver historial de avance"
                            title={`Historial de avance (${a.updatesCount})`}
                          />
                        )}
                        {canEdit && (
                          <>
                            <Button variant="icon" leftIcon={<ChevronUp size={14} />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir" title="Subir" />
                            <Button variant="icon" leftIcon={<ChevronDown size={14} />} disabled={i === activities.length - 1} onClick={() => move(i, 1)} aria-label="Bajar" title="Bajar" />
                            <Button variant="icon" leftIcon={<Pencil size={14} />} onClick={() => onEdit(a)} aria-label="Editar" title="Editar" />
                            <Button variant="icon" leftIcon={<Trash2 size={14} />} onClick={() => remove.mutate(a.id, { onError: err })} aria-label="Eliminar" title="Eliminar" />
                          </>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
                {expanded && (
                  <tr className={styles.historyRow}>
                    <td colSpan={totalCols}>
                      <ActivityHistory workOrderId={wo.id} activity={a} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// === Historial de avance (append-only) de una actividad ========================

function ActivityHistory({ workOrderId, activity }: { workOrderId: string; activity: WorkActivityDto }) {
  const { data: updates = [], isLoading } = useWorkOrderActivityUpdates(workOrderId, activity.id);
  return (
    <div>
      <p className={styles.historyTitle}>Historial de avance — {activity.title}</p>
      {isLoading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : updates.length === 0 ? (
        <p className={styles.historyEmpty}>Sin registros de avance.</p>
      ) : (
        <ul className={styles.historyList}>
          {updates.map((u) => {
            const statusMeta = u.status ? ACTIVITY_STATUS_META[u.status] : null;
            return (
              <li key={u.id} className={styles.historyItem}>
                <div className={styles.historyItemHead}>
                  {statusMeta && <span className={styles.lifeChip} style={{ color: statusMeta.color }}>{statusMeta.label}</span>}
                  {u.progressPct != null && <span className={styles.progressPct}>{u.progressPct}%</span>}
                  {u.deviation && <span className={styles.devLate}>{u.deviation}</span>}
                </div>
                {u.note && <p className={styles.historyItemNote}>{u.note}</p>}
                {u.delayReason && <p className={styles.historyItemNote}>Motivo: {u.delayReason}</p>}
                <span className={styles.historyItemMeta}>{u.authorName ?? "—"} · {formatDateTime(u.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// === Modal de registrar avance (Puerta 4, S5) ==================================

/** Estados que se pueden declarar al registrar avance (CANCELED es acción de plan, no avance). */
const PROGRESS_STATUSES: WorkActivityStatus[] = ["IN_PROGRESS", "BLOCKED", "DONE"];

function ProgressModal({ wo, activity, onClose }: { wo: WorkOrderDetail; activity: WorkActivityDto; onClose: () => void }) {
  const toast = useToast();
  const record = useRecordWorkOrderActivityProgress(wo.id);

  const [status, setStatus] = useState<WorkActivityStatus>(
    activity.status === "PENDING" || activity.status === "CANCELED" ? "IN_PROGRESS" : activity.status,
  );
  const [progressPct, setProgressPct] = useState(activity.progressPct);
  const [note, setNote] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [actualStart, setActualStart] = useState(toLocalInput(activity.actualStart));
  const [actualEnd, setActualEnd] = useState(toLocalInput(activity.actualEnd));

  // % efectivo: DONE ⇒ 100 (fuente única compartida con el backend).
  const effPct = effectiveProgressPct({ status, progressPct }, activity.progressPct);
  const isDone = status === "DONE";
  const isBlocked = status === "BLOCKED";
  const devLabel = activityDeviationLabel({
    baselineEnd: activity.baselineEnd,
    plannedEnd: activity.plannedEnd,
    actualEnd: isoOrNull(actualEnd) ?? activity.actualEnd,
  });

  const err = (e: unknown) => toast.error((e as Error).message);
  const save = () => {
    const dto: RecordWorkActivityProgressRequest = {
      status,
      progressPct: effPct,
      note: note.trim() || null,
      delayReason: delayReason.trim() || null,
      ...(actualStart ? { actualStart: isoOrNull(actualStart) } : {}),
      ...(actualEnd ? { actualEnd: isoOrNull(actualEnd) } : {}),
    };
    record.mutate(
      { aid: activity.id, dto },
      { onSuccess: () => { toast.success("Avance registrado"); onClose(); }, onError: err },
    );
  };

  return (
    <Modal open onClose={onClose} title="Registrar avance" size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" leftIcon={<TrendingUp size={15} />} loading={record.isPending} onClick={save}>Registrar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <div className={styles.planCellTitle}>{activity.title}</div>

        {/* Contexto: baseline y desviación (para decidir con dato) */}
        <div className={styles.progressContext}>
          <div className={styles.progressContextRow}>
            <span>Plan comprometido (baseline)</span>
            <span>{activity.baselineEnd ? formatDate(activity.baselineEnd) : "—"}</span>
          </div>
          {devLabel && (
            <div className={styles.progressContextRow}>
              <span>Desviación estimada</span>
              <span className={styles.devLate}>{devLabel}</span>
            </div>
          )}
        </div>

        {/* Estado */}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Estado</span>
          <div className={styles.statusPicker}>
            {PROGRESS_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={s === status ? `${styles.statusOption} ${styles.statusOptionActive}` : styles.statusOption}
                onClick={() => setStatus(s)}
              >
                <span style={{ color: ACTIVITY_STATUS_META[s].color }}>●</span> {ACTIVITY_STATUS_META[s].label}
              </button>
            ))}
          </div>
        </label>

        {/* Porcentaje de avance */}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Avance: {effPct}%</span>
          <div className={styles.rangeRow}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={effPct}
              disabled={isDone}
              onChange={(e) => setProgressPct(Number(e.target.value))}
            />
          </div>
          {isDone && <span className={styles.muted}>Al completar, el avance queda en 100%.</span>}
        </label>

        {/* Fechas reales (opcionales; el sistema completa la fecha faltante) */}
        <div className={styles.formRow2}>
          <label className={styles.field}><span className={styles.fieldLabel}>Inicio real</span>
            <Input type="datetime-local" value={actualStart} onChange={(e) => setActualStart(e.target.value)} />
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Término real</span>
            <Input type="datetime-local" value={actualEnd} onChange={(e) => setActualEnd(e.target.value)} />
          </label>
        </div>

        {/* Motivo de atraso/bloqueo */}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>{isBlocked ? "Motivo del bloqueo" : "Motivo de atraso (opcional)"}</span>
          <Input value={delayReason} onChange={(e) => setDelayReason(e.target.value)} placeholder={isBlocked ? "¿Qué impide continuar?" : "Solo si hay desviación"} />
        </label>

        {/* Nota de avance */}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Nota de avance</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Qué se hizo, hallazgos, pendientes…" />
        </label>
      </div>
    </Modal>
  );
}

// === Modal de creación/edición de una actividad ================================

function ActivityModal({ wo, activity, onClose }: { wo: WorkOrderDetail; activity?: WorkActivityDto; onClose: () => void }) {
  const toast = useToast();
  const { data: users = [] } = useWorkOrderAssignableUsers();
  const { data: specialties = [] } = useWorkOrderSpecialties();
  const { data: activities = [] } = useWorkOrderActivities(wo.id);
  const create = useCreateWorkOrderActivity(wo.id);
  const update = useUpdateWorkOrderActivity(wo.id);
  const editing = !!activity;

  const [title, setTitle] = useState(activity?.title ?? "");
  const [description, setDescription] = useState(activity?.description ?? "");
  const [responsibleId, setResponsibleId] = useState(activity?.responsibleId ?? wo.ownerId ?? "");
  const [specialtyId, setSpecialtyId] = useState(activity?.specialtyId ?? wo.specialties[0]?.id ?? "");
  const [plannedStart, setPlannedStart] = useState(toLocalInput(activity?.plannedStart ?? wo.plannedStart ?? null));
  const [plannedEnd, setPlannedEnd] = useState(toLocalInput(activity?.plannedEnd ?? wo.plannedEnd ?? null));
  const [mandatory, setMandatory] = useState(activity?.mandatory ?? true);
  const [priority, setPriority] = useState(activity?.priority ?? "");
  const [dependsOnId, setDependsOnId] = useState(activity?.dependsOnId ?? "");
  const [status, setStatus] = useState<WorkActivityStatus>(activity?.status ?? "PENDING");

  const err = (e: unknown) => toast.error((e as Error).message);
  const payload = () => ({
    title: title.trim(),
    description: description.trim() || null,
    responsibleId: responsibleId || null,
    specialtyId: specialtyId || null,
    plannedStart: isoOrNull(plannedStart),
    plannedEnd: isoOrNull(plannedEnd),
    mandatory,
    priority: (priority || null) as CreateWorkActivityRequest["priority"],
    dependsOnId: dependsOnId || null,
  });

  const save = () => {
    if (editing) {
      update.mutate(
        { aid: activity!.id, dto: { ...payload(), status } },
        { onSuccess: () => { toast.success("Actividad actualizada"); onClose(); }, onError: err },
      );
    } else {
      create.mutate(payload(), { onSuccess: () => { toast.success("Actividad agregada"); onClose(); }, onError: err });
    }
  };

  return (
    <Modal open onClose={onClose} title={editing ? "Editar actividad" : "Nueva actividad"} size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={create.isPending || update.isPending} disabled={title.trim().length < 3} onClick={save}>Guardar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <label className={styles.field}><span className={styles.fieldLabel}>Tarea *</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej. Desmontar acoplamiento y retirar rodamiento" autoFocus />
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Descripción</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Detalle / instrucciones (opcional)" />
        </label>
        <div className={styles.formRow2}>
          <label className={styles.field}><span className={styles.fieldLabel}>Responsable</span>
            <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
              <option value="">(sin responsable)</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Especialidad</span>
            <Select value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
              <option value="">(sin especialidad)</option>
              {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </label>
        </div>
        <div className={styles.formRow2}>
          <label className={styles.field}><span className={styles.fieldLabel}>Inicio planificado</span>
            <Input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Fin planificado</span>
            <Input type="datetime-local" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
          </label>
        </div>
        <div className={styles.formRow2}>
          <label className={styles.field}><span className={styles.fieldLabel}>Prioridad</span>
            <Select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}>
              <option value="">(sin prioridad)</option>
              {(Object.keys(PRIORITY_META) as Array<keyof typeof PRIORITY_META>).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
            </Select>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Depende de</span>
            <Select value={dependsOnId} onChange={(e) => setDependsOnId(e.target.value)}>
              <option value="">(sin dependencia)</option>
              {activities.filter((a) => a.id !== activity?.id).map((a) => <option key={a.id} value={a.id}>{a.sequence + 1}. {a.title}</option>)}
            </Select>
          </label>
        </div>
        <div className={styles.formRow2}>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
            <span>Obligatoria (bloquea el cierre si queda abierta)</span>
          </label>
          {editing && (
            <label className={styles.field}><span className={styles.fieldLabel}>Estado</span>
              <Select value={status} onChange={(e) => setStatus(e.target.value as WorkActivityStatus)}>
                {(Object.keys(ACTIVITY_STATUS_META) as WorkActivityStatus[]).map((s) => <option key={s} value={s}>{ACTIVITY_STATUS_META[s].label}</option>)}
              </Select>
            </label>
          )}
        </div>
      </div>
    </Modal>
  );
}

// === Asistente guiado (Stepper) ================================================

const WIZARD_STEPS: Step[] = [
  { id: "tareas", label: "Tareas", hint: "¿Qué hay que hacer?" },
  { id: "equipo", label: "Equipo", hint: "¿Quién / especialidad?" },
  { id: "fechas", label: "Fechas", hint: "¿Cuándo?" },
  { id: "orden", label: "Orden", hint: "Secuencia y revisión" },
];

function PlanWizard({ wo, onDone }: { wo: WorkOrderDetail; onDone: () => void }) {
  const toast = useToast();
  const { data: users = [] } = useWorkOrderAssignableUsers();
  const { data: specialties = [] } = useWorkOrderSpecialties();
  const batch = useCreateWorkOrderActivitiesBatch(wo.id);

  const [step, setStep] = useState(0);
  const [tasks, setTasks] = useState<string[]>([""]);
  // Defaults inteligentes para todo el plan (afinables luego en la grilla).
  const [responsibleId, setResponsibleId] = useState(wo.ownerId ?? "");
  const [specialtyId, setSpecialtyId] = useState(wo.specialties[0]?.id ?? "");
  const [plannedStart, setPlannedStart] = useState(toLocalInput(wo.plannedStart));
  const [plannedEnd, setPlannedEnd] = useState(toLocalInput(wo.plannedEnd));

  const cleanTasks = tasks.map((t) => t.trim()).filter((t) => t.length >= 3);
  const err = (e: unknown) => toast.error((e as Error).message);

  const setTask = (i: number, v: string) => setTasks((prev) => prev.map((t, idx) => (idx === i ? v : t)));
  const addTask = () => setTasks((prev) => [...prev, ""]);
  const removeTask = (i: number) => setTasks((prev) => (prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev));
  const moveTask = (i: number, dir: -1 | 1) => {
    const t = i + dir;
    if (t < 0 || t >= tasks.length) return;
    setTasks((prev) => { const c = [...prev]; const tmp = c[i]!; c[i] = c[t]!; c[t] = tmp; return c; });
  };

  const generate = () => {
    const activities: CreateWorkActivityRequest[] = cleanTasks.map((title) => ({
      title,
      responsibleId: responsibleId || null,
      specialtyId: specialtyId || null,
      plannedStart: isoOrNull(plannedStart),
      plannedEnd: isoOrNull(plannedEnd),
    }));
    batch.mutate({ activities }, {
      onSuccess: (rows) => { toast.success(`Plan generado: ${rows.length} actividad(es)`); onDone(); },
      onError: err,
    });
  };

  return (
    <div className={styles.wizard}>
      <Stepper steps={WIZARD_STEPS} current={step} onStepClick={(i) => setStep(i)} />

      {step === 0 && (
        <div className={styles.wizardStep}>
          <p className={styles.muted}>Enumera las tareas del trabajo, una por línea. Podrás afinar responsable, fechas y dependencias después.</p>
          {tasks.map((t, i) => (
            <div key={i} className={styles.wizardTaskRow}>
              <span className={styles.planSeq}>{i + 1}</span>
              <Input value={t} onChange={(e) => setTask(i, e.target.value)} placeholder={`Tarea ${i + 1}`} />
              <Button variant="icon" leftIcon={<ChevronUp size={14} />} disabled={i === 0} onClick={() => moveTask(i, -1)} aria-label="Subir" />
              <Button variant="icon" leftIcon={<ChevronDown size={14} />} disabled={i === tasks.length - 1} onClick={() => moveTask(i, 1)} aria-label="Bajar" />
              <Button variant="icon" leftIcon={<Trash2 size={14} />} disabled={tasks.length === 1} onClick={() => removeTask(i)} aria-label="Quitar" />
            </div>
          ))}
          <Button variant="secondary" leftIcon={<Plus size={15} />} onClick={addTask}>Agregar tarea</Button>
        </div>
      )}

      {step === 1 && (
        <div className={styles.wizardStep}>
          <p className={styles.muted}>Se aplican a todas las tareas como valor por defecto (editable en la grilla).</p>
          <label className={styles.field}><span className={styles.fieldLabel}>Responsable por defecto</span>
            <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
              <option value="">(sin responsable)</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </label>
          <label className={styles.field}><span className={styles.fieldLabel}>Especialidad por defecto</span>
            <Select value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)}>
              <option value="">(sin especialidad)</option>
              {specialties.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className={styles.wizardStep}>
          <p className={styles.muted}>Ventana de trabajo por defecto (tomada de la OT). Puedes dejarla vacía y fijar fechas por actividad luego.</p>
          <div className={styles.formRow2}>
            <label className={styles.field}><span className={styles.fieldLabel}>Inicio planificado</span>
              <Input type="datetime-local" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </label>
            <label className={styles.field}><span className={styles.fieldLabel}>Fin planificado</span>
              <Input type="datetime-local" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </label>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={styles.wizardStep}>
          <p className={styles.muted}>Revisa el orden y genera el plan. Las dependencias entre tareas se ajustan en la grilla.</p>
          {cleanTasks.length === 0 ? (
            <p className={styles.planBannerWarn}><ShieldAlert size={15} /> Agrega al menos una tarea (mín. 3 caracteres) en el paso 1.</p>
          ) : (
            <ol className={styles.wizardReview}>
              {cleanTasks.map((t, i) => (
                <li key={i}><span className={styles.planSeq}>{i + 1}</span> {t}</li>
              ))}
            </ol>
          )}
          <p className={styles.muted}>
            Responsable: {users.find((u) => u.id === responsibleId)?.name ?? "—"} · Especialidad: {specialties.find((s) => s.id === specialtyId)?.name ?? "—"}
            {plannedStart ? ` · ${formatDate(isoOrNull(plannedStart)!)}` : ""}
          </p>
        </div>
      )}

      <div className={styles.wizardNav}>
        {step > 0 && <Button variant="secondary" onClick={() => setStep((s) => s - 1)}>Atrás</Button>}
        {step < WIZARD_STEPS.length - 1 ? (
          <Button variant="primary" disabled={step === 0 && cleanTasks.length === 0} onClick={() => setStep((s) => s + 1)}>Siguiente</Button>
        ) : (
          <Button variant="primary" leftIcon={<Sparkles size={15} />} loading={batch.isPending} disabled={cleanTasks.length === 0} onClick={generate}>
            Generar plan ({cleanTasks.length})
          </Button>
        )}
      </div>
    </div>
  );
}
