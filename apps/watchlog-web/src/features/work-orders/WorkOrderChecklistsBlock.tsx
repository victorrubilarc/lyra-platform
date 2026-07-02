import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Eye, Lightbulb, PenLine, Plus, ShieldAlert, Trash2, XCircle } from "lucide-react";
import { blockingChecklistsForClose, type WorkOrderChecklistDto } from "@lyra/contracts";
import { Button, Modal, Select, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import { EntryFillPage } from "../log-entries/EntryFillPage.js";
import { CHECKLIST_STATUS_META } from "./work-orders-presentation.js";
import {
  WORK_ORDER_CHECKLIST_KEYS,
  WORK_ORDER_KEYS,
  useAddWorkOrderChecklist,
  useInstantiateWorkOrderChecklist,
  useRemoveWorkOrderChecklist,
  useReviewWorkOrderChecklist,
  useSubmitWorkOrderChecklist,
  useSuggestWorkOrderChecklists,
  useWorkOrderChecklistRules,
  useWorkOrderChecklists,
} from "./work-orders-queries.js";
import styles from "./work-orders.module.css";

/**
 * Bloque de Checklists / PTW de una OT (Puerta 2, S3). Espejo de IncidentReportsBlock:
 * lista los checklists sugeridos/agregados, su estado y las acciones (iniciar → llenar
 * el LogEntry → enviar a revisión → aprobar/rechazar). El botón "Sugerir" re-deriva los
 * aplicables; "Agregar" ofrece plantillas de checklist no presentes. La segregación
 * (revisor ≠ responsable) y el bloqueo de la Puerta 2 los decide el backend.
 */
export function WorkOrderChecklistsBlock({ workOrderId, isLive }: { workOrderId: string; isLive: boolean }) {
  const { can } = usePermissions();
  const toast = useToast();
  const manage = can("workorder:checklist:manage");
  const { data: checklists = [], isLoading } = useWorkOrderChecklists(workOrderId);
  const suggest = useSuggestWorkOrderChecklists(workOrderId);
  const instantiate = useInstantiateWorkOrderChecklist(workOrderId);
  const submit = useSubmitWorkOrderChecklist(workOrderId);
  const remove = useRemoveWorkOrderChecklist(workOrderId);

  const [addOpen, setAddOpen] = useState(false);
  const [reviewing, setReviewing] = useState<WorkOrderChecklistDto | null>(null);
  // Llenar/ver el checklist SIN salir de la OT: se abre su registro (LogEntry) en un
  // MODAL embebido (reusa EntryFillPage en modo embebido). Al cerrar, refresca el
  // estado del checklist (p. ej. tras sellar, habilita "Enviar a revisión").
  const qc = useQueryClient();
  const [fillId, setFillId] = useState<string | null>(null);
  const closeFill = () => {
    setFillId(null);
    qc.invalidateQueries({ queryKey: WORK_ORDER_CHECKLIST_KEYS.forWorkOrder(workOrderId) });
    qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.detail(workOrderId) });
  };

  const blocking = blockingChecklistsForClose(checklists);
  const err = (e: unknown) => toast.error((e as Error).message);

  return (
    <>
      <div className={styles.sectionTitle}>
        <ClipboardCheck size={15} /> Checklists / Permisos de trabajo
      </div>

      {blocking.length > 0 && (
        <p className={styles.rejectBox}>
          <ShieldAlert size={15} /> Puerta 2 bloqueada: {blocking.length} checklist(s) obligatorio(s) sin aprobar.
        </p>
      )}

      {isLive && manage && (
        <div className={styles.actions}>
          <Button variant="secondary" leftIcon={<Lightbulb size={15} />} loading={suggest.isPending}
            onClick={() => suggest.mutate(undefined, { onSuccess: (r) => toast.success(`Checklists sugeridos (${r.length})`), onError: err })}>
            Sugerir aplicables
          </Button>
          <Button variant="secondary" leftIcon={<Plus size={15} />} onClick={() => setAddOpen(true)}>Agregar</Button>
        </div>
      )}

      {isLoading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : checklists.length === 0 ? (
        <p className={styles.muted}>Sin checklists. Usa «Sugerir aplicables» al preparar la OT.</p>
      ) : (
        <ul className={styles.checklistList}>
          {checklists.map((c) => {
            const meta = CHECKLIST_STATUS_META[c.status];
            return (
              <li key={c.id} className={styles.checklistItem}>
                <div className={styles.checklistHead}>
                  <span className={styles.checklistName}>{c.templateName ?? "Checklist"}</span>
                  {c.mandatory && <span className={styles.ptwTag}>Obligatorio</span>}
                  <span className={styles.lifeChip} style={{ color: meta.color, marginLeft: "auto" }}>{meta.label}</span>
                </div>
                <div className={styles.checklistMeta}>
                  {c.logEntryCode && <span className={styles.mono}>{c.logEntryCode}</span>}
                  {c.responsibleName && <span>Responsable: {c.responsibleName}</span>}
                  {c.reviewerName && <span>Revisor: {c.reviewerName}</span>}
                  {c.reviewedAt && <span className={styles.muted}>{formatDateTime(c.reviewedAt)}</span>}
                </div>
                {c.status === "REJECTED" && c.rejectReason && (
                  <p className={styles.rejectBox}><XCircle size={14} /> Motivo: {c.rejectReason}</p>
                )}
                {isLive && manage && (
                  <div className={styles.checklistActions}>
                    {(c.status === "PENDING" || c.status === "REJECTED") && (
                      <Button variant="primary" onClick={() => instantiate.mutate(c.id, { onError: err })}>
                        {c.status === "REJECTED" ? "Rehacer" : "Iniciar"}
                      </Button>
                    )}
                    {c.logEntryId && c.status === "IN_PROGRESS" && (
                      <Button variant="secondary" leftIcon={<PenLine size={14} />} onClick={() => setFillId(c.logEntryId)}>Llenar</Button>
                    )}
                    {c.status === "IN_PROGRESS" && (
                      <Button variant="secondary" disabled={!c.logEntrySealed} title={c.logEntrySealed ? undefined : "Complete y selle el registro primero"}
                        onClick={() => submit.mutate(c.id, { onError: err })}>
                        Enviar a revisión
                      </Button>
                    )}
                    {c.status === "SUBMITTED" && (
                      <>
                        <Button variant="primary" leftIcon={<CheckCircle2 size={14} />} onClick={() => setReviewing(c)}>Revisar</Button>
                      </>
                    )}
                    {c.logEntryId && (c.status === "SUBMITTED" || c.status === "APPROVED") && (
                      <Button variant="secondary" leftIcon={<Eye size={14} />} onClick={() => setFillId(c.logEntryId)}>Ver</Button>
                    )}
                    {!c.mandatory && c.status === "PENDING" && (
                      <Button variant="secondary" leftIcon={<Trash2 size={14} />} onClick={() => remove.mutate(c.id, { onError: err })}>Quitar</Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {addOpen && <AddChecklistModal workOrderId={workOrderId} present={checklists} onClose={() => setAddOpen(false)} />}
      {reviewing && <ReviewChecklistModal workOrderId={workOrderId} checklist={reviewing} onClose={() => setReviewing(null)} />}
      {fillId && (
        <Modal open onClose={closeFill} size="xl" title="Checklist / permiso de trabajo">
          {/* Reusa el motor de llenado del constructor de formularios en MODO EMBEBIDO:
              se llena/sella aquí mismo sin salir de la OT; "Cerrar" vuelve al detalle. */}
          <EntryFillPage embedded entryId={fillId} onClose={closeFill} />
        </Modal>
      )}
    </>
  );
}

/** Modal para agregar manualmente un checklist: ofrece plantillas de checklist no presentes. */
function AddChecklistModal({ workOrderId, present, onClose }: { workOrderId: string; present: WorkOrderChecklistDto[]; onClose: () => void }) {
  const toast = useToast();
  const { data: rules = [] } = useWorkOrderChecklistRules();
  const add = useAddWorkOrderChecklist(workOrderId);
  const [templateId, setTemplateId] = useState("");

  const options = useMemo(() => {
    const presentTemplateIds = new Set(present.map((c) => c.templateId));
    const seen = new Set<string>();
    return rules
      .filter((r) => r.active && !presentTemplateIds.has(r.templateId) && !seen.has(r.templateId) && seen.add(r.templateId))
      .map((r) => ({ id: r.templateId, name: r.templateName ?? r.name }));
  }, [rules, present]);

  return (
    <Modal open onClose={onClose} title="Agregar checklist" size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={add.isPending} disabled={!templateId}
          onClick={() => add.mutate({ templateId }, { onSuccess: () => { toast.success("Checklist agregado"); onClose(); }, onError: (e) => toast.error((e as Error).message) })}>
          Agregar
        </Button>
      </>
    }>
      <div className={styles.modalBody}>
        {options.length === 0 ? (
          <p className={styles.muted}>No hay plantillas de checklist disponibles para agregar.</p>
        ) : (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Plantilla de checklist</span>
            <Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
              <option value="">Selecciona…</option>
              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select>
          </label>
        )}
      </div>
    </Modal>
  );
}

/** Modal de revisión (aprobar/rechazar). El backend valida segregación revisor ≠ responsable. */
function ReviewChecklistModal({ workOrderId, checklist, onClose }: { workOrderId: string; checklist: WorkOrderChecklistDto; onClose: () => void }) {
  const toast = useToast();
  const review = useReviewWorkOrderChecklist(workOrderId);
  const [reason, setReason] = useState("");
  const submit = (decision: "APPROVE" | "REJECT") =>
    review.mutate(
      { cid: checklist.id, dto: { decision, reason: reason.trim() || undefined } },
      { onSuccess: () => { toast.success(decision === "APPROVE" ? "Checklist aprobado" : "Checklist rechazado"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
    );
  return (
    <Modal open onClose={onClose} title={`Revisar: ${checklist.templateName ?? "Checklist"}`} size="sm" footer={
      <>
        <Button variant="danger" loading={review.isPending} disabled={reason.trim().length === 0} onClick={() => submit("REJECT")}>Rechazar</Button>
        <Button variant="primary" loading={review.isPending} onClick={() => submit("APPROVE")}>Aprobar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>El revisor debe ser distinto de quien completó el checklist (segregación de funciones).</p>
        {checklist.logEntryId && (
          <p><Link to={`/bitacoras/${checklist.logEntryId}`} className={styles.mono}>Ver registro {checklist.logEntryCode}</Link></p>
        )}
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Motivo (obligatorio para rechazar)</span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Motivo del rechazo…" />
        </label>
      </div>
    </Modal>
  );
}
