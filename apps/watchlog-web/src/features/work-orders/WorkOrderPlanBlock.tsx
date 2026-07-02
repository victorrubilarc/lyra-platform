import { useMemo, useState } from "react";
import { CalendarClock, ChevronDown, ChevronUp, ListChecks, Lock, Pencil, Plus, ShieldAlert, Sparkles, Trash2, Wand2 } from "lucide-react";
import {
  activityEndDeviationDays,
  planReadyToFreeze,
  summarizeActivities,
  type CreateWorkActivityRequest,
  type WorkActivityDto,
  type WorkActivityStatus,
  type WorkOrderDetail,
} from "@lyra/contracts";
import { Button, Input, Modal, Select, Stepper, Textarea, useToast, type Step } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate } from "../../lib/format.js";
import { ACTIVITY_STATUS_META, PRIORITY_META } from "./work-orders-presentation.js";
import {
  useCreateWorkOrderActivitiesBatch,
  useCreateWorkOrderActivity,
  useRemoveWorkOrderActivity,
  useReorderWorkOrderActivities,
  useUpdateWorkOrderActivity,
  useWorkOrderActivities,
  useWorkOrderAssignableUsers,
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
 * Pestaña PLAN de una OT (Puerta 3, S4). Dos formas complementarias de armar el plan:
 * (a) grilla de actividades para el experto (agregar/editar/reordenar/eliminar, con la
 * desviación plan-vs-baseline visible); (b) asistente guiado (Stepper) que lleva paso a
 * paso con defaults inteligentes y genera las filas. Cuando la OT aún no tiene actividades
 * arranca el asistente; una vez autorizado el plan (baseline congelada) todo es de solo
 * lectura + seguimiento. El bloqueo de la Puerta 3 se EXPLICA (falta ≥1 actividad).
 */
export function WorkOrderPlanBlock({ wo, isLive }: { wo: WorkOrderDetail; isLive: boolean }) {
  const { can } = usePermissions();
  const manage = can("workorder:activity:manage");
  const { data: activities = [], isLoading } = useWorkOrderActivities(wo.id);
  const frozen = !!wo.planFrozenAt;
  const summary = useMemo(() => summarizeActivities(activities), [activities]);
  const canEdit = isLive && manage && !frozen;

  // Modo: si no hay actividades y se puede editar, arranca el asistente (decisión del dueño).
  const [mode, setMode] = useState<"auto" | "grid" | "wizard">("auto");
  const effectiveMode: "grid" | "wizard" =
    mode === "auto" ? (canEdit && activities.length === 0 ? "wizard" : "grid") : mode;

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

      {canEdit && (
        <div className={styles.actions}>
          <Button variant={effectiveMode === "wizard" ? "primary" : "secondary"} leftIcon={<Wand2 size={15} />} onClick={() => setMode("wizard")}>
            Asistente guiado
          </Button>
          <Button variant={effectiveMode === "grid" ? "primary" : "secondary"} leftIcon={<ListChecks size={15} />} onClick={() => setMode("grid")}>
            Grilla {activities.length > 0 ? `(${activities.length})` : ""}
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : effectiveMode === "wizard" && canEdit ? (
        <PlanWizard wo={wo} onDone={() => setMode("grid")} />
      ) : (
        <ActivityGrid wo={wo} activities={activities} canEdit={canEdit} frozen={frozen} />
      )}
    </>
  );
}

/** Banner de etapa: explica dónde está la OT en el plan y la próxima acción esperada. */
function PlanStageBanner({ wo, activities, frozen }: { wo: WorkOrderDetail; activities: WorkActivityDto[]; frozen: boolean }) {
  if (frozen) {
    return (
      <p className={styles.planBannerOk}>
        <Lock size={15} /> Plan autorizado — baseline congelada el {formatDate(wo.planFrozenAt!)}. La ejecución se compara contra esta línea base.
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
          : "Agrega al menos una actividad para poder autorizar el plan (Puerta 3)."}
      </p>
    );
  }
  return (
    <p className={styles.planBanner}>
      <CalendarClock size={15} /> Define aquí el plan de trabajo. Se autoriza (y congela la baseline) al llegar a la etapa de planificación.
    </p>
  );
}

// === Grilla de actividades =====================================================

function ActivityGrid({ wo, activities, canEdit, frozen }: { wo: WorkOrderDetail; activities: WorkActivityDto[]; canEdit: boolean; frozen: boolean }) {
  const toast = useToast();
  const remove = useRemoveWorkOrderActivity(wo.id);
  const reorder = useReorderWorkOrderActivities(wo.id);
  const [editing, setEditing] = useState<WorkActivityDto | null>(null);
  const [adding, setAdding] = useState(false);
  const err = (e: unknown) => toast.error((e as Error).message);

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= activities.length) return;
    const ids = activities.map((a) => a.id);
    const tmp = ids[index]!;
    ids[index] = ids[target]!;
    ids[target] = tmp;
    reorder.mutate({ orderedIds: ids }, { onError: err });
  };

  if (activities.length === 0) {
    return (
      <>
        <p className={styles.muted}>Sin actividades en el plan.</p>
        {canEdit && <Button variant="primary" leftIcon={<Plus size={15} />} onClick={() => setAdding(true)}>Agregar actividad</Button>}
        {adding && <ActivityModal wo={wo} onClose={() => setAdding(false)} />}
      </>
    );
  }

  return (
    <>
      {canEdit && (
        <div className={styles.actions}>
          <Button variant="secondary" leftIcon={<Plus size={15} />} onClick={() => setAdding(true)}>Agregar actividad</Button>
        </div>
      )}
      <ul className={styles.planList}>
        {activities.map((a, i) => {
          const meta = ACTIVITY_STATUS_META[a.status];
          const dev = activityEndDeviationDays(a);
          return (
            <li key={a.id} className={styles.planItem}>
              <div className={styles.planItemHead}>
                <span className={styles.planSeq}>{i + 1}</span>
                <span className={styles.planName}>{a.title}</span>
                {a.mandatory && <span className={styles.ptwTag}>Obligatoria</span>}
                <span className={styles.lifeChip} style={{ color: meta.color, marginLeft: "auto" }}>{meta.label}</span>
              </div>
              <div className={styles.planItemMeta}>
                {a.responsibleName && <span>👤 {a.responsibleName}</span>}
                {a.specialtyName && <span>🔧 {a.specialtyName}</span>}
                {a.priority && <span style={{ color: PRIORITY_META[a.priority].color }}>{PRIORITY_META[a.priority].label}</span>}
                {a.plannedStart && <span>📅 {formatDate(a.plannedStart)}{a.plannedEnd ? ` → ${formatDate(a.plannedEnd)}` : ""}</span>}
                {frozen && dev != null && dev !== 0 && (
                  <span className={dev > 0 ? styles.devLate : styles.devEarly}>{dev > 0 ? `+${dev}d` : `${dev}d`} vs baseline</span>
                )}
              </div>
              {a.description && <p className={styles.planDesc}>{a.description}</p>}
              {canEdit && (
                <div className={styles.planItemActions}>
                  <Button variant="icon" leftIcon={<ChevronUp size={14} />} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir" />
                  <Button variant="icon" leftIcon={<ChevronDown size={14} />} disabled={i === activities.length - 1} onClick={() => move(i, 1)} aria-label="Bajar" />
                  <Button variant="secondary" leftIcon={<Pencil size={14} />} onClick={() => setEditing(a)}>Editar</Button>
                  <Button variant="icon" leftIcon={<Trash2 size={14} />} onClick={() => remove.mutate(a.id, { onError: err })} aria-label="Eliminar" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {adding && <ActivityModal wo={wo} onClose={() => setAdding(false)} />}
      {editing && <ActivityModal wo={wo} activity={editing} onClose={() => setEditing(null)} />}
    </>
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
