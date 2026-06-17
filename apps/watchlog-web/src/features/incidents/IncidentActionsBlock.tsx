import { useState } from "react";
import { AlertTriangle, BadgeCheck, Ban, CheckCircle2, ClipboardList, Plus, Star } from "lucide-react";
import type {
  IncidentActionDto,
  IncidentActionKind,
  IncidentActionOutcome,
} from "@lyra/contracts";
import { INCIDENT_ACTION_KINDS } from "@lyra/contracts";
import { Button, Input, Modal, Select, Spinner, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import {
  useAssignableUsers,
  useCancelIncidentAction,
  useCompleteIncidentAction,
  useCreateIncidentAction,
  useIncidentActions,
  useUpdateIncidentAction,
  useVerifyIncidentAction,
} from "./incidents-queries.js";
import { ACTION_KIND_META, ACTION_STATUS_META } from "./incidents-presentation.js";
import styles from "./incidents.module.css";

interface Props {
  incidentId: string;
  /** Las mutaciones solo se ofrecen mientras la incidencia está abierta. */
  incidentOpen: boolean;
}

/**
 * Acciones CAPA (correctivas / preventivas / inmediatas) de la incidencia
 * (Fase 4.2a). Una acción `mandatory` sin resolver bloquea el cierre (el servidor
 * es autoritativo; aquí mostramos un aviso). La verificación de eficacia se ofrece
 * solo con el permiso `incident:action:verify` (segregación de funciones).
 */
export function IncidentActionsBlock({ incidentId, incidentOpen }: Props) {
  const { can } = usePermissions();
  const toast = useToast();
  const { data: actions = [], isLoading } = useIncidentActions(incidentId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncidentActionDto | null>(null);
  const [completing, setCompleting] = useState<IncidentActionDto | null>(null);
  const [verifying, setVerifying] = useState<IncidentActionDto | null>(null);
  const [canceling, setCanceling] = useState<IncidentActionDto | null>(null);

  const canManage = can("incident:action:manage");
  const canVerify = can("incident:action:verify");

  // Aviso (cliente): acciones obligatorias sin verificar pueden bloquear el cierre.
  const pendingMandatory = actions.filter((a) => a.mandatory && a.status !== "VERIFIED" && a.status !== "CANCELED").length;

  if (isLoading) {
    return (
      <div className={styles.originBox}>
        <div className={styles.originTitle}><ClipboardList size={14} /> Acciones</div>
        <div className={styles.center}><Spinner /></div>
      </div>
    );
  }

  return (
    <div className={styles.originBox}>
      <div className={styles.actionsHead}>
        <div className={styles.originTitle}><ClipboardList size={14} /> Acciones correctivas/preventivas ({actions.length})</div>
        {canManage && incidentOpen && (
          <Button variant="secondary" leftIcon={<Plus size={14} />} onClick={() => { setEditing(null); setFormOpen(true); }}>
            Nueva acción
          </Button>
        )}
      </div>

      {pendingMandatory > 0 && (
        <div className={styles.actionWarn}>
          <AlertTriangle size={14} /> {pendingMandatory} acción(es) obligatoria(s) sin resolver: pueden bloquear el cierre.
        </div>
      )}

      {actions.length === 0 ? (
        <div className={styles.muted}>Sin acciones registradas.</div>
      ) : (
        <ul className={styles.actionList}>
          {actions.map((a) => {
            const kind = ACTION_KIND_META[a.kind];
            const st = ACTION_STATUS_META[a.status];
            const closed = a.status === "VERIFIED" || a.status === "CANCELED";
            return (
              <li key={a.id} className={styles.actionCard}>
                <div className={styles.actionTop}>
                  <span className={styles.actionKind} style={{ color: kind.color, borderColor: kind.color }}>{kind.label}</span>
                  {a.mandatory && <Star size={13} className={styles.actionStar} aria-label="Obligatoria" />}
                  <span className={styles.code}>{a.code}</span>
                  <span className={styles.actionStatus} style={{ color: st.color }}>{st.label}</span>
                </div>
                <div className={styles.actionTitle}>{a.title}</div>
                {a.description && <div className={styles.actionDesc}>{a.description}</div>}
                <div className={styles.actionMeta}>
                  {a.responsibleName && <>Resp.: {a.responsibleName}{a.responsibleRoleName ? ` (${a.responsibleRoleName})` : ""} · </>}
                  {!a.responsibleName && a.responsibleRoleName && <>Resp.: {a.responsibleRoleName} · </>}
                  {a.dueAt ? <span className={a.overdue ? styles.overdue : ""}>Vence {formatDateTime(a.dueAt)}</span> : "Sin plazo"}
                </div>
                {a.completionNote && <div className={styles.actionNote}>Cierre: {a.completionNote}</div>}
                {a.status === "VERIFIED" && (
                  <div className={styles.actionNote}>
                    <BadgeCheck size={12} /> Verificada eficaz{a.verifiedByName ? ` · ${a.verifiedByName}` : ""}
                    {a.verificationNote ? ` — ${a.verificationNote}` : ""}
                  </div>
                )}
                {a.status === "CANCELED" && a.cancelReason && <div className={styles.actionNote}>Anulada: {a.cancelReason}</div>}

                {!closed && incidentOpen && (canManage || canVerify) && (
                  <div className={styles.actionBtns}>
                    {canManage && (a.status === "OPEN" || a.status === "IN_PROGRESS") && (
                      <Button variant="secondary" leftIcon={<CheckCircle2 size={14} />} onClick={() => setCompleting(a)}>Completar</Button>
                    )}
                    {canVerify && a.status === "DONE" && (
                      <Button variant="primary" leftIcon={<BadgeCheck size={14} />} onClick={() => setVerifying(a)}>Verificar</Button>
                    )}
                    {canManage && (a.status === "OPEN" || a.status === "IN_PROGRESS") && (
                      <Button variant="secondary" onClick={() => { setEditing(a); setFormOpen(true); }}>Editar</Button>
                    )}
                    {canManage && (
                      <Button variant="secondary" leftIcon={<Ban size={14} />} onClick={() => setCanceling(a)}>Anular</Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {formOpen && (
        <ActionFormModal
          incidentId={incidentId}
          action={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
          onDone={() => { setFormOpen(false); setEditing(null); toast.success(editing ? "Acción actualizada" : "Acción creada"); }}
        />
      )}
      {completing && (
        <CompleteModal incidentId={incidentId} action={completing} onClose={() => setCompleting(null)} onDone={() => { setCompleting(null); toast.success("Acción marcada como realizada"); }} />
      )}
      {verifying && (
        <VerifyModal incidentId={incidentId} action={verifying} onClose={() => setVerifying(null)} onDone={() => { setVerifying(null); toast.success("Verificación registrada"); }} />
      )}
      {canceling && (
        <CancelActionModal incidentId={incidentId} action={canceling} onClose={() => setCanceling(null)} onDone={() => { setCanceling(null); toast.success("Acción anulada"); }} />
      )}
    </div>
  );
}

function ActionFormModal({ incidentId, action, onClose, onDone }: { incidentId: string; action: IncidentActionDto | null; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: users = [] } = useAssignableUsers();
  const create = useCreateIncidentAction(incidentId);
  const update = useUpdateIncidentAction(incidentId);
  const [kind, setKind] = useState<IncidentActionKind>(action?.kind ?? "CORRECTIVE");
  const [title, setTitle] = useState(action?.title ?? "");
  const [description, setDescription] = useState(action?.description ?? "");
  const [mandatory, setMandatory] = useState(action?.mandatory ?? false);
  const [responsibleId, setResponsibleId] = useState(action?.responsibleId ?? "");
  const [dueAt, setDueAt] = useState(action?.dueAt ? action.dueAt.slice(0, 16) : "");
  const loading = create.isPending || update.isPending;
  const canSave = title.trim().length >= 3;

  function save() {
    const base = {
      kind,
      title: title.trim(),
      description: description.trim() || null,
      mandatory,
      responsibleId: responsibleId || null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    };
    const onError = (e: unknown) => toast.error((e as Error).message || "No se pudo guardar");
    if (action) update.mutate({ actionId: action.id, dto: base }, { onSuccess: onDone, onError });
    else create.mutate(base, { onSuccess: onDone, onError });
  }

  return (
    <Modal open onClose={onClose} title={action ? "Editar acción" : "Nueva acción"} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={loading} disabled={!canSave} onClick={save}>{action ? "Guardar" : "Crear"}</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <label className={styles.field}><span className={styles.fieldLabel}>Tipo</span>
          <Select value={kind} onChange={(e) => setKind(e.target.value as IncidentActionKind)}>
            {INCIDENT_ACTION_KINDS.map((k) => <option key={k} value={k}>{ACTION_KIND_META[k].label}</option>)}
          </Select>
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Título</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Qué se hará" autoFocus />
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Detalle (opcional)</span>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Responsable (opcional)</span>
          <Select value={responsibleId} onChange={(e) => setResponsibleId(e.target.value)}>
            <option value="">(sin asignar)</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Plazo (opcional)</span>
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
          <span>Obligatoria (bloquea el cierre de la incidencia hasta resolverse)</span>
        </label>
      </div>
    </Modal>
  );
}

function CompleteModal({ incidentId, action, onClose, onDone }: { incidentId: string; action: IncidentActionDto; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const complete = useCompleteIncidentAction(incidentId);
  const [note, setNote] = useState("");
  return (
    <Modal open onClose={onClose} title={`Completar ${action.code}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={complete.isPending} onClick={() =>
          complete.mutate({ actionId: action.id, dto: { completionNote: note.trim() || null } }, { onSuccess: onDone, onError: (e) => toast.error((e as Error).message) })
        }>Marcar realizada</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>{action.title}</p>
        <label className={styles.field}><span className={styles.fieldLabel}>Nota de cierre (opcional)</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Qué se hizo / evidencia" />
        </label>
      </div>
    </Modal>
  );
}

function VerifyModal({ incidentId, action, onClose, onDone }: { incidentId: string; action: IncidentActionDto; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const verify = useVerifyIncidentAction(incidentId);
  const [outcome, setOutcome] = useState<IncidentActionOutcome>("EFFECTIVE");
  const [note, setNote] = useState("");
  return (
    <Modal open onClose={onClose} title={`Verificar eficacia · ${action.code}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={verify.isPending} onClick={() =>
          verify.mutate({ actionId: action.id, dto: { effectivenessOutcome: outcome, verificationNote: note.trim() || null } }, { onSuccess: onDone, onError: (e) => toast.error((e as Error).message) })
        }>Registrar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>{action.title}</p>
        <label className={styles.field}><span className={styles.fieldLabel}>Resultado</span>
          <Select value={outcome} onChange={(e) => setOutcome(e.target.value as IncidentActionOutcome)}>
            <option value="EFFECTIVE">Eficaz (se verifica y cierra)</option>
            <option value="NOT_EFFECTIVE">No eficaz (se reabre para retrabajo)</option>
          </Select>
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Nota de verificación (opcional)</span>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Evidencia de eficacia" />
        </label>
      </div>
    </Modal>
  );
}

function CancelActionModal({ incidentId, action, onClose, onDone }: { incidentId: string; action: IncidentActionDto; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const cancel = useCancelIncidentAction(incidentId);
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title={`Anular ${action.code}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Volver</Button>
        <Button variant="danger" loading={cancel.isPending} disabled={reason.trim().length < 5} onClick={() =>
          cancel.mutate({ actionId: action.id, dto: { reason: reason.trim() } }, { onSuccess: onDone, onError: (e) => toast.error((e as Error).message) })
        }>Anular</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Motivo de la anulación (mín. 5 caracteres)" />
      </div>
    </Modal>
  );
}
