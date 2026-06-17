import { useState } from "react";
import { AlertTriangle, Ban, FileCheck2, FileWarning, Plus, RefreshCw, Send, Star } from "lucide-react";
import type { IncidentReportDto } from "@lyra/contracts";
import { Button, Input, Modal, Select, Spinner, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import {
  useCancelIncidentReport,
  useCreateIncidentReport,
  useIncidentReports,
  useMarkIncidentReportNotApplicable,
  useMaterializeIncidentReports,
  useReportingObligations,
  useSubmitIncidentReport,
} from "./incidents-queries.js";
import { REPORT_STATUS_META } from "./incidents-presentation.js";
import styles from "./incidents.module.css";

interface Props {
  incidentId: string;
  /** Las mutaciones solo se ofrecen mientras la incidencia está abierta. */
  incidentOpen: boolean;
}

/**
 * Reportabilidad de la incidencia (Fase 4.3). Lista los reportes a autoridades/
 * obligaciones, su plazo (rojo si vencido), estado y evidencia de envío. Un reporte
 * de obligación OBLIGATORIA aún pendiente bloquea el cierre (el servidor es
 * autoritativo; aquí avisamos). Se gobierna con `incident:edit`.
 */
export function IncidentReportsBlock({ incidentId, incidentOpen }: Props) {
  const { can } = usePermissions();
  const toast = useToast();
  const { data: reports = [], isLoading } = useIncidentReports(incidentId);
  const materialize = useMaterializeIncidentReports(incidentId);

  const [adding, setAdding] = useState(false);
  const [submitting, setSubmitting] = useState<IncidentReportDto | null>(null);
  const [marking, setMarking] = useState<IncidentReportDto | null>(null);
  const [canceling, setCanceling] = useState<IncidentReportDto | null>(null);

  const canEdit = can("incident:edit");
  const blockingPending = reports.filter((r) => r.mandatory && r.status === "PENDING").length;

  if (isLoading) {
    return (
      <div className={styles.originBox}>
        <div className={styles.originTitle}><FileCheck2 size={14} /> Reportes</div>
        <div className={styles.center}><Spinner /></div>
      </div>
    );
  }

  return (
    <div className={styles.originBox}>
      <div className={styles.actionsHead}>
        <div className={styles.originTitle}><FileCheck2 size={14} /> Reportabilidad ({reports.length})</div>
        {canEdit && incidentOpen && (
          <div className={styles.reportHeadBtns}>
            <Button
              variant="secondary"
              leftIcon={<RefreshCw size={14} />}
              loading={materialize.isPending}
              onClick={() =>
                materialize.mutate(undefined, {
                  onSuccess: (n) => toast.success(n > 0 ? `${n} reporte(s) requerido(s) agregado(s)` : "Sin reportes nuevos aplicables"),
                  onError: (e) => toast.error((e as Error).message),
                })
              }
              title="Re-derivar los reportes aplicables según el tipo y la severidad"
            >
              Re-derivar
            </Button>
            <Button variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setAdding(true)}>Agregar</Button>
          </div>
        )}
      </div>

      {blockingPending > 0 && (
        <div className={styles.actionWarn}>
          <AlertTriangle size={14} /> {blockingPending} reporte(s) obligatorio(s) pendiente(s): bloquean el cierre hasta enviarlos o marcarlos "no aplica".
        </div>
      )}

      {reports.length === 0 ? (
        <div className={styles.muted}>Sin reportes. {incidentOpen && canEdit ? 'Usa "Re-derivar" o "Agregar".' : ""}</div>
      ) : (
        <ul className={styles.actionList}>
          {reports.map((r) => {
            const st = REPORT_STATUS_META[r.status];
            const terminal = r.status === "SUBMITTED" || r.status === "NOT_APPLICABLE" || r.status === "CANCELED";
            return (
              <li key={r.id} className={styles.actionCard}>
                <div className={styles.actionTop}>
                  {r.mandatory && <Star size={13} className={styles.actionStar} aria-label="Obligatorio" />}
                  <span className={styles.code}>{r.code}</span>
                  <span className={styles.actionStatus} style={{ color: st.color }}>{st.label}</span>
                  {r.overdue && <span className={styles.reportOverdueChip}><FileWarning size={12} /> Vencido</span>}
                </div>
                <div className={styles.actionTitle}>{r.obligationName}</div>
                {r.authorityName && <div className={styles.actionDesc}>Autoridad: {r.authorityName}</div>}
                <div className={styles.actionMeta}>
                  {r.dueAt ? <span className={r.overdue ? styles.overdue : ""}>Plazo {formatDateTime(r.dueAt)}</span> : "Sin plazo"}
                  {r.status === "SUBMITTED" && r.submittedAt && <> · Enviado {formatDateTime(r.submittedAt)}{r.submittedByName ? ` por ${r.submittedByName}` : ""}</>}
                </div>
                {r.status === "SUBMITTED" && r.externalFolio && <div className={styles.actionNote}>Folio externo: {r.externalFolio}</div>}
                {r.status === "NOT_APPLICABLE" && r.notes && <div className={styles.actionNote}>No aplica: {r.notes}</div>}
                {r.status === "SUBMITTED" && r.notes && <div className={styles.actionNote}>{r.notes}</div>}
                {r.status === "CANCELED" && r.cancelReason && <div className={styles.actionNote}>Anulado: {r.cancelReason}</div>}

                {!terminal && incidentOpen && canEdit && (
                  <div className={styles.actionBtns}>
                    <Button variant="primary" leftIcon={<Send size={14} />} onClick={() => setSubmitting(r)}>Marcar enviado</Button>
                    <Button variant="secondary" onClick={() => setMarking(r)}>No aplica</Button>
                    <Button variant="secondary" leftIcon={<Ban size={14} />} onClick={() => setCanceling(r)}>Anular</Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <AddReportModal incidentId={incidentId} existingObligationIds={reports.filter((r) => r.status !== "CANCELED").map((r) => r.obligationId)} onClose={() => setAdding(false)} onDone={() => { setAdding(false); toast.success("Reporte agregado"); }} />
      )}
      {submitting && (
        <SubmitReportModal incidentId={incidentId} report={submitting} onClose={() => setSubmitting(null)} onDone={() => { setSubmitting(null); toast.success("Reporte marcado como enviado"); }} />
      )}
      {marking && (
        <NotApplicableModal incidentId={incidentId} report={marking} onClose={() => setMarking(null)} onDone={() => { setMarking(null); toast.success("Reporte marcado como no aplica"); }} />
      )}
      {canceling && (
        <CancelReportModal incidentId={incidentId} report={canceling} onClose={() => setCanceling(null)} onDone={() => { setCanceling(null); toast.success("Reporte anulado"); }} />
      )}
    </div>
  );
}

function AddReportModal({ incidentId, existingObligationIds, onClose, onDone }: { incidentId: string; existingObligationIds: string[]; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const { data: obligations = [] } = useReportingObligations();
  const create = useCreateIncidentReport(incidentId);
  const available = obligations.filter((o) => !existingObligationIds.includes(o.id));
  const [obligationId, setObligationId] = useState("");
  const [dueAt, setDueAt] = useState("");

  return (
    <Modal open onClose={onClose} title="Agregar reporte" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={create.isPending} disabled={!obligationId} onClick={() =>
          create.mutate({ obligationId, dueAt: dueAt ? new Date(dueAt).toISOString() : null }, { onSuccess: onDone, onError: (e) => toast.error((e as Error).message) })
        }>Agregar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <label className={styles.field}><span className={styles.fieldLabel}>Obligación</span>
          <Select value={obligationId} onChange={(e) => setObligationId(e.target.value)} autoFocus>
            <option value="">Seleccione…</option>
            {available.map((o) => <option key={o.id} value={o.id}>{o.name}{o.mandatory ? " (obligatorio)" : ""}</option>)}
          </Select>
        </label>
        {available.length === 0 && <div className={styles.muted}>No hay obligaciones disponibles para agregar (las aplicables ya están materializadas).</div>}
        <label className={styles.field}><span className={styles.fieldLabel}>Plazo (opcional, si no se usa el de la obligación)</span>
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

function SubmitReportModal({ incidentId, report, onClose, onDone }: { incidentId: string; report: IncidentReportDto; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const submit = useSubmitIncidentReport(incidentId);
  const [externalFolio, setExternalFolio] = useState("");
  const [submittedAt, setSubmittedAt] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Modal open onClose={onClose} title={`Marcar enviado · ${report.code}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={submit.isPending} onClick={() =>
          submit.mutate(
            { reportId: report.id, dto: { externalFolio: externalFolio.trim() || null, submittedAt: submittedAt ? new Date(submittedAt).toISOString() : null, notes: notes.trim() || null } },
            { onSuccess: onDone, onError: (e) => toast.error((e as Error).message) },
          )
        }>Registrar envío</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>{report.obligationName}{report.authorityName ? ` · ${report.authorityName}` : ""}</p>
        <label className={styles.field}><span className={styles.fieldLabel}>Folio/número externo (opcional)</span>
          <Input value={externalFolio} onChange={(e) => setExternalFolio(e.target.value)} placeholder="N.º de folio entregado por la autoridad" autoFocus />
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Fecha de envío (opcional, por defecto ahora)</span>
          <Input type="datetime-local" value={submittedAt} onChange={(e) => setSubmittedAt(e.target.value)} />
        </label>
        <label className={styles.field}><span className={styles.fieldLabel}>Notas (opcional)</span>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>
      </div>
    </Modal>
  );
}

function NotApplicableModal({ incidentId, report, onClose, onDone }: { incidentId: string; report: IncidentReportDto; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const mark = useMarkIncidentReportNotApplicable(incidentId);
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title={`Marcar "no aplica" · ${report.code}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Volver</Button>
        <Button variant="primary" loading={mark.isPending} disabled={reason.trim().length < 5} onClick={() =>
          mark.mutate({ reportId: report.id, dto: { reason: reason.trim() } }, { onSuccess: onDone, onError: (e) => toast.error((e as Error).message) })
        }>Confirmar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>Justifique por qué este reporte no aplica a la incidencia (queda auditado).</p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Motivo (mín. 5 caracteres)" />
      </div>
    </Modal>
  );
}

function CancelReportModal({ incidentId, report, onClose, onDone }: { incidentId: string; report: IncidentReportDto; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const cancel = useCancelIncidentReport(incidentId);
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title={`Anular ${report.code}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Volver</Button>
        <Button variant="danger" loading={cancel.isPending} disabled={reason.trim().length < 5} onClick={() =>
          cancel.mutate({ reportId: report.id, dto: { reason: reason.trim() } }, { onSuccess: onDone, onError: (e) => toast.error((e as Error).message) })
        }>Anular</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Motivo de la anulación (mín. 5 caracteres)" />
      </div>
    </Modal>
  );
}
