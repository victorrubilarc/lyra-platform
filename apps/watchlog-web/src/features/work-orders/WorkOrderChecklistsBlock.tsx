import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Eye, Lightbulb, Lock, PenLine, Plus, ShieldAlert, ShieldCheck, Trash2, XCircle } from "lucide-react";
import {
  WORK_ORDER_CHECKLIST_MOMENTS,
  WORK_ORDER_CHECKLIST_MOMENT_META,
  blockingChecklistsForClose,
  type WorkOrderChecklistDto,
  type WorkOrderDetail,
} from "@lyra/contracts";
import { Button, Modal, Select, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import { EntryFillPage } from "../log-entries/EntryFillPage.js";
import { CHECKLIST_STATUS_META } from "./work-orders-presentation.js";
import {
  WORK_ORDER_CHECKLIST_KEYS,
  WORK_ORDER_KEYS,
  useAddWorkOrderChecklist,
  useConfirmWorkOrderExecutionSet,
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
 * Bloque de Checklists / PTW de una OT. Espejo de IncidentReportsBlock: lista los
 * checklists sugeridos/agregados AGRUPADOS por MOMENTO del ciclo (Autorización · Ejecución
 * · Cierre…), su estado y las acciones (iniciar → llenar el LogEntry → enviar a revisión →
 * aprobar/rechazar). El grupo de EJECUCIÓN (Slice B) se sub-agrupa por ACTIVIDAD del plan
 * (LOTO físico/toma-5 se aplican por tarea) e incluye el GOBIERNO 2: el aprobador cura y
 * CONFIRMA el set de ejecución que se exigirá en terreno ANTES de autorizar el permiso. La
 * segregación (revisor ≠ responsable) y los bloqueos de puerta los decide el backend.
 */
export function WorkOrderChecklistsBlock({ wo, isLive }: { wo: WorkOrderDetail; isLive: boolean }) {
  const workOrderId = wo.id;
  const { can } = usePermissions();
  const toast = useToast();
  const manage = can("workorder:checklist:manage");
  const { data: checklists = [], isLoading } = useWorkOrderChecklists(workOrderId);
  const suggest = useSuggestWorkOrderChecklists(workOrderId);
  const instantiate = useInstantiateWorkOrderChecklist(workOrderId);
  const submit = useSubmitWorkOrderChecklist(workOrderId);
  const remove = useRemoveWorkOrderChecklist(workOrderId);
  const confirmExec = useConfirmWorkOrderExecutionSet(workOrderId);

  const [addOpen, setAddOpen] = useState<{ activityId: string | null } | null>(null);
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

  // Agrupa por MOMENTO del ciclo (Autorización · Ejecución · Cierre…) en orden cronológico,
  // para que cada checklist se lea "dónde va" de un vistazo (el de cierre aparece en su lugar).
  const groups = WORK_ORDER_CHECKLIST_MOMENTS.map((m) => ({ moment: m, items: checklists.filter((c) => c.moment === m) })).filter(
    (g) => g.items.length > 0,
  );

  const renderItem = (c: WorkOrderChecklistDto) => {
    const meta = CHECKLIST_STATUS_META[c.status];
    return (
      <li key={c.id} className={styles.checklistItem} style={{ ["--cl" as string]: meta.color }}>
        <div className={styles.checklistHead}>
          <span className={styles.checklistName}>{c.templateName ?? "Checklist"}</span>
          {c.mandatory && <span className={styles.clMandatory}>Obligatorio</span>}
          <span className={styles.clStatus} style={{ marginLeft: "auto" }}>{meta.label}</span>
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
              <Button variant="primary" leftIcon={<CheckCircle2 size={14} />} onClick={() => setReviewing(c)}>Revisar</Button>
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
  };

  // Grupo de EJECUCIÓN: sub-agrupado por ACTIVIDAD del plan (los controles de terreno se
  // aplican por tarea). Incluye el Gobierno 2 (confirmar el set) en su cabecera.
  const renderExecutionGroup = (items: WorkOrderChecklistDto[]) => {
    const byActivity = new Map<string, { title: string; items: WorkOrderChecklistDto[] }>();
    for (const c of items) {
      const key = c.workActivityId ?? "__none__";
      const g = byActivity.get(key) ?? { title: c.workActivityTitle ?? "Sin actividad", items: [] };
      g.items.push(c);
      byActivity.set(key, g);
    }
    const activityGroups = [...byActivity.entries()].sort((a, b) => a[1].title.localeCompare(b[1].title));
    const confirmed = !!wo.executionSetConfirmedAt;
    return (
      <>
        {isLive && manage && (
          confirmed ? (
            <p className={styles.planBannerOk}>
              <ShieldCheck size={15} />
              Set de verificaciones de ejecución confirmado{wo.executionSetConfirmedByName ? ` por ${wo.executionSetConfirmedByName}` : ""}
              {wo.executionSetConfirmedAt ? ` · ${formatDateTime(wo.executionSetConfirmedAt)}` : ""}. Lo aplicado en terreno = lo autorizado.
            </p>
          ) : (
            <div className={styles.planBannerWarn}>
              <ShieldAlert size={15} />
              <span style={{ flex: 1 }}>Revisa y confirma el set de verificaciones que se exigirá en terreno antes de autorizar el permiso.</span>
              <Button variant="primary" leftIcon={<Lock size={14} />} loading={confirmExec.isPending}
                onClick={() => confirmExec.mutate(undefined, { onSuccess: () => toast.success("Set de ejecución confirmado"), onError: err })}>
                Confirmar set de ejecución
              </Button>
            </div>
          )
        )}
        <div className={styles.execActivities}>
          {activityGroups.map(([key, g]) => (
            <section key={key} className={styles.execActivity}>
              <div className={styles.execActivityHead}>
                <span className={styles.execActivityTitle}>{g.title}</span>
                {isLive && manage && (
                  <Button variant="secondary" leftIcon={<Plus size={13} />} onClick={() => setAddOpen({ activityId: key === "__none__" ? null : key })}>
                    Agregar
                  </Button>
                )}
              </div>
              <ul className={styles.checklistList}>{g.items.map(renderItem)}</ul>
            </section>
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      <div className={styles.sectionTitle}>
        <ClipboardCheck size={15} /> Verificaciones (checklists / permisos de trabajo)
      </div>

      {blocking.length > 0 && (
        <p className={styles.rejectBox}>
          <ShieldAlert size={15} /> No se puede avanzar: {blocking.length} verificación(es) obligatoria(s) sin aprobar.
        </p>
      )}

      {isLive && manage && (
        <div className={styles.actions}>
          <Button variant="secondary" leftIcon={<Lightbulb size={15} />} loading={suggest.isPending}
            onClick={() => suggest.mutate(undefined, { onSuccess: (r) => toast.success(`Checklists sugeridos (${r.length})`), onError: err })}>
            Sugerir aplicables
          </Button>
          <Button variant="secondary" leftIcon={<Plus size={15} />} onClick={() => setAddOpen({ activityId: null })}>Agregar</Button>
        </div>
      )}

      {isLoading ? (
        <p className={styles.muted}>Cargando…</p>
      ) : checklists.length === 0 ? (
        <p className={styles.muted}>Sin checklists. Usa «Sugerir aplicables» al preparar la OT.</p>
      ) : (
        <div className={styles.checklistGroups}>
          {groups.map((g) => (
            <section key={g.moment} className={styles.checklistGroup}>
              <div className={styles.checklistGroupHead}>
                <span className={styles.checklistGroupTitle}>{WORK_ORDER_CHECKLIST_MOMENT_META[g.moment].label}</span>
                <span className={styles.checklistGroupHint}>{WORK_ORDER_CHECKLIST_MOMENT_META[g.moment].hint}</span>
              </div>
              {g.moment === "EXECUTION" ? renderExecutionGroup(g.items) : <ul className={styles.checklistList}>{g.items.map(renderItem)}</ul>}
            </section>
          ))}
        </div>
      )}

      {addOpen && (
        <AddChecklistModal
          workOrderId={workOrderId}
          present={checklists}
          activityId={addOpen.activityId}
          onClose={() => setAddOpen(null)}
        />
      )}
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

/**
 * Modal para agregar manualmente un checklist: ofrece plantillas de checklist no presentes.
 * Si se abre desde una actividad (`activityId`), agrega una verificación de EJECUCIÓN a esa
 * tarea y filtra las plantillas a las reglas de momento EJECUCIÓN.
 */
function AddChecklistModal({ workOrderId, present, activityId, onClose }: {
  workOrderId: string;
  present: WorkOrderChecklistDto[];
  activityId: string | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const { data: rules = [] } = useWorkOrderChecklistRules();
  const add = useAddWorkOrderChecklist(workOrderId);
  const [templateId, setTemplateId] = useState("");
  const isExecution = activityId !== null;

  const options = useMemo(() => {
    // Al agregar a una actividad, no repetir la plantilla YA presente en ESA actividad.
    const presentTemplateIds = new Set(
      present.filter((c) => (isExecution ? c.workActivityId === activityId : c.workActivityId === null)).map((c) => c.templateId),
    );
    const seen = new Set<string>();
    return rules
      .filter((r) => r.active && (isExecution ? r.moment === "EXECUTION" : r.moment !== "EXECUTION"))
      .filter((r) => !presentTemplateIds.has(r.templateId) && !seen.has(r.templateId) && seen.add(r.templateId))
      .map((r) => ({ id: r.templateId, name: r.templateName ?? r.name, moment: r.moment }));
  }, [rules, present, isExecution, activityId]);

  return (
    <Modal open onClose={onClose} title={isExecution ? "Agregar verificación de ejecución" : "Agregar checklist"} size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={add.isPending} disabled={!templateId}
          onClick={() => add.mutate(
            { templateId, moment: options.find((o) => o.id === templateId)?.moment, ...(activityId ? { workActivityId: activityId } : {}) },
            { onSuccess: () => { toast.success("Checklist agregado"); onClose(); }, onError: (e) => toast.error((e as Error).message) },
          )}>
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
