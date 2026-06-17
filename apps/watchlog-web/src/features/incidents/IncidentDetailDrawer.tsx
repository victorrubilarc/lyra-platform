import { useState } from "react";
import { Link } from "react-router-dom";
import { Activity, AlertTriangle, ArrowRight, Ban, ClipboardList, FileCheck2, GitBranch, Info, MessageSquare, Send, ShieldCheck } from "lucide-react";
import type { IncidentAvailableTransition } from "@lyra/contracts";
import { isInvestigationComplete } from "@lyra/contracts";
import { Button, Drawer, Input, Modal, Select, Spinner, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import {
  useAssignIncident,
  useAssignableUsers,
  useCancelIncident,
  useCommentIncident,
  useIncidentActions,
  useIncidentDetail,
  useIncidentInvestigation,
  useIncidentReports,
  useTransitionIncident,
} from "./incidents-queries.js";
import { IncidentActionsBlock } from "./IncidentActionsBlock.js";
import { IncidentInvestigationBlock } from "./IncidentInvestigationBlock.js";
import { IncidentReportsBlock } from "./IncidentReportsBlock.js";
import { LIFECYCLE_META, ORIGIN_META, PRIORITY_META, severityColor, severityLabel } from "./incidents-presentation.js";
import { useExceptions } from "../exceptions/exceptions-queries.js";
import { THRESHOLD_META, formatExceptionValue } from "../exceptions/exceptions-presentation.js";
import excStyles from "../exceptions/exceptions.module.css";
import styles from "./incidents.module.css";

interface Props {
  incidentId: string | null;
  onClose: () => void;
}

export function IncidentDetailDrawer({ incidentId, onClose }: Props) {
  const { can } = usePermissions();
  const toast = useToast();
  const { data: inc, isLoading } = useIncidentDetail(incidentId);
  const { data: users = [] } = useAssignableUsers();
  const assign = useAssignIncident();
  const comment = useCommentIncident();
  const transition = useTransitionIncident();
  const cancel = useCancelIncident();

  const [commentText, setCommentText] = useState("");
  const [pending, setPending] = useState<IncidentAvailableTransition | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [tab, setTab] = useState<"resumen" | "acciones" | "investigacion" | "reportes" | "actividad">("resumen");

  // Conteos/avisos para los chips de pestaña (cacheados; las dedupea React Query).
  const { data: actionsForTab = [] } = useIncidentActions(incidentId);
  const { data: investigationForTab } = useIncidentInvestigation(incidentId);
  const { data: reportsForTab = [] } = useIncidentReports(incidentId);
  const pendingMandatory = actionsForTab.filter((a) => a.mandatory && a.status !== "VERIFIED" && a.status !== "CANCELED").length;
  const investigationBlocks = !!inc?.typeRequiresInvestigation && !isInvestigationComplete(investigationForTab);
  const reportsBlock = reportsForTab.filter((r) => r.mandatory && r.status === "PENDING").length;
  const reportsOverdue = reportsForTab.some((r) => r.overdue);

  const title = inc ? (
    <div className={styles.drawerHead}>
      <span className={styles.code}>{inc.code}</span>
      <span className={styles.sevDot} style={{ background: severityColor(inc.severity) }} title={`Severidad ${inc.severity}`} />
      <span className={styles.priChip} style={{ color: PRIORITY_META[inc.priority].color, borderColor: PRIORITY_META[inc.priority].color }}>
        {PRIORITY_META[inc.priority].label}
      </span>
      <span className={styles.lifeChip} style={{ color: LIFECYCLE_META[inc.lifecycle].color }}>
        {LIFECYCLE_META[inc.lifecycle].label}
      </span>
    </div>
  ) : (
    "Incidencia"
  );

  function submitComment() {
    if (!inc || !commentText.trim()) return;
    comment.mutate(
      { id: inc.id, dto: { body: commentText.trim() } },
      { onSuccess: () => setCommentText(""), onError: () => toast.error("No se pudo comentar") },
    );
  }

  return (
    <Drawer open={!!incidentId} onClose={onClose} title={title} width={720}>
      {isLoading || !inc ? (
        <div className={styles.center}><Spinner /></div>
      ) : (
        <div className={styles.detail}>
          <h2 className={styles.detailTitle}>{inc.title}</h2>
          <div className={styles.metaLine}>
            {inc.typeName} {inc.categoryName ? `· ${inc.categoryName}` : ""} · severidad {severityLabel(inc.severity)}
            {inc.potentialSeverity ? ` · potencial ${severityLabel(inc.potentialSeverity)}` : ""}
          </div>

          {/* Pestañas (Fase 4.2b) */}
          <div className={styles.drawerTabs} role="tablist">
            <button role="tab" aria-selected={tab === "resumen"} className={tab === "resumen" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("resumen")}>
              <Info size={14} /> Resumen
            </button>
            <button role="tab" aria-selected={tab === "acciones"} className={tab === "acciones" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("acciones")}>
              <ClipboardList size={14} /> Acciones
              {actionsForTab.length > 0 && <span className={styles.tabBadge}>{actionsForTab.length}</span>}
              {pendingMandatory > 0 && <span className={styles.tabDot} title="Acciones obligatorias sin resolver" />}
            </button>
            <button role="tab" aria-selected={tab === "investigacion"} className={tab === "investigacion" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("investigacion")}>
              <GitBranch size={14} /> Investigación
              {investigationBlocks && <span className={styles.tabDot} title="Investigación pendiente (exigida para cerrar)" />}
            </button>
            <button role="tab" aria-selected={tab === "reportes"} className={tab === "reportes" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("reportes")}>
              <FileCheck2 size={14} /> Reportes
              {reportsForTab.length > 0 && <span className={styles.tabBadge}>{reportsForTab.length}</span>}
              {(reportsBlock > 0 || reportsOverdue) && <span className={styles.tabDot} title={reportsBlock > 0 ? "Reporte obligatorio pendiente (bloquea el cierre)" : "Reporte vencido"} />}
            </button>
            <button role="tab" aria-selected={tab === "actividad"} className={tab === "actividad" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("actividad")}>
              <Activity size={14} /> Actividad
            </button>
          </div>

          {tab === "resumen" && (<>
          {/* Stepper de estados del flujo */}
          {inc.states.length > 0 && (
            <div className={styles.stepper}>
              {inc.states.map((s) => {
                const active = s.key === inc.currentStateKey;
                const passed = inc.states.findIndex((x) => x.key === inc.currentStateKey) >= s.order;
                return (
                  <div key={s.key} className={styles.step} title={s.name}>
                    <span className={styles.stepDot} style={{ background: passed ? s.color ?? "#6366F1" : "transparent", borderColor: s.color ?? "#6366F1" }} />
                    <span className={active ? styles.stepLabelActive : styles.stepLabel}>{s.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {inc.description && <p className={styles.desc}>{inc.description}</p>}

          {/* Bloque Origen */}
          <div className={styles.originBox}>
            <div className={styles.originTitle}>Origen</div>
            <dl className={styles.kv}>
              <dt>Fuente</dt><dd>{ORIGIN_META[inc.originType].label}</dd>
              <dt>Nodo</dt><dd>{inc.orgNodeName ?? "—"}</dd>
              {inc.equipmentTag && (<><dt>Equipo</dt><dd>{inc.equipmentTag}</dd></>)}
              {inc.shiftCode && (<><dt>Turno</dt><dd>{inc.shiftCode}</dd></>)}
              {inc.occurredAt && (<><dt>Ocurrió</dt><dd>{formatDateTime(inc.occurredAt)}</dd></>)}
              <dt>Reportada por</dt><dd>{inc.reporterName ?? "—"}</dd>
              {inc.originLogEntryId && (
                <>
                  <dt>Bitácora</dt>
                  <dd><Link to={`/bitacoras/${inc.originLogEntryId}`} className={styles.link}>Entrada #{inc.originLogEntryNumber}</Link></dd>
                </>
              )}
              {inc.dueAt && (<><dt>Vence</dt><dd className={inc.slaBreached ? styles.overdue : ""}>{formatDateTime(inc.dueAt)}</dd></>)}
            </dl>
          </div>

          {/* Trazabilidad campo → excepción → incidencia (Fase 4.1.1) */}
          {can("module:incidents:view") && <IncidentExceptionsBlock incidentId={inc.id} />}

          {/* Responsable */}
          {can("incident:assign") && inc.lifecycle === "OPEN" && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Responsable</span>
              <Select
                value={inc.ownerId ?? ""}
                onChange={(e) => assign.mutate({ id: inc.id, dto: { ownerId: e.target.value || null } })}
              >
                <option value="">(sin asignar)</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </label>
          )}

          {/* Transiciones disponibles */}
          {inc.lifecycle === "OPEN" && can("incident:transition") && inc.availableTransitions.length > 0 && (
            <div className={styles.actions}>
              {inc.availableTransitions.map((t) => (
                <Button key={t.key} variant={t.toStateIsFinal ? "primary" : "secondary"} leftIcon={t.requireSignature ? <ShieldCheck size={15} /> : <ArrowRight size={15} />} onClick={() => setPending(t)}>
                  {t.label}
                </Button>
              ))}
            </div>
          )}

          {/* Anular */}
          {inc.lifecycle !== "CANCELED" && can("incident:cancel") && (
            <div className={styles.dangerZone}>
              <Button variant="secondary" leftIcon={<Ban size={15} />} onClick={() => setCancelOpen(true)}>Anular incidencia</Button>
            </div>
          )}
          </>)}

          {/* Pestaña Acciones CAPA (Fase 4.2a) */}
          {tab === "acciones" && can("module:incidents:view") && (
            <IncidentActionsBlock incidentId={inc.id} incidentOpen={inc.lifecycle === "OPEN"} />
          )}

          {/* Pestaña Investigación de causa raíz (Fase 4.2b) */}
          {tab === "investigacion" && can("module:incidents:view") && (
            <IncidentInvestigationBlock
              incidentId={inc.id}
              requiresInvestigation={inc.typeRequiresInvestigation}
              incidentOpen={inc.lifecycle === "OPEN"}
              canEdit={can("incident:edit")}
            />
          )}

          {/* Pestaña Reportabilidad (Fase 4.3) */}
          {tab === "reportes" && can("module:incidents:view") && (
            <IncidentReportsBlock incidentId={inc.id} incidentOpen={inc.lifecycle === "OPEN"} />
          )}

          {tab === "actividad" && (<>
          {/* Comentarios */}
          <div className={styles.sectionTitle}><MessageSquare size={15} /> Comentarios ({inc.comments.length})</div>
          <div className={styles.comments}>
            {inc.comments.map((c) => (
              <div key={c.id} className={styles.comment}>
                <div className={styles.commentMeta}>{c.authorName ?? "—"} · {formatDateTime(c.createdAt)}</div>
                <div>{c.body}</div>
              </div>
            ))}
            {inc.comments.length === 0 && <div className={styles.muted}>Sin comentarios.</div>}
          </div>
          {can("incident:comment") && (
            <div className={styles.commentBar}>
              <Input value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Agregar comentario de gestión…" onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }} />
              <Button variant="secondary" leftIcon={<Send size={15} />} onClick={submitComment} loading={comment.isPending}>Enviar</Button>
            </div>
          )}

          {/* Timeline */}
          <div className={styles.sectionTitle}>Actividad</div>
          <ul className={styles.timeline}>
            {[...inc.activity].reverse().map((a) => (
              <li key={a.id}><span className={styles.muted}>{formatDateTime(a.occurredAt)}</span> — {a.summary}{a.actorName ? ` · ${a.actorName}` : ""}</li>
            ))}
          </ul>
          </>)}
        </div>
      )}

      {pending && inc && (
        <TransitionModal
          transition={pending}
          loading={transition.isPending}
          onClose={() => setPending(null)}
          onConfirm={(dto) =>
            transition.mutate(
              { id: inc.id, dto: { transitionKey: pending.key, ...dto } },
              {
                onSuccess: () => { setPending(null); toast.success("Estado actualizado"); },
                onError: (e) => toast.error((e as Error).message || "No se pudo avanzar"),
              },
            )
          }
        />
      )}

      {cancelOpen && inc && (
        <CancelModal
          loading={cancel.isPending}
          onClose={() => setCancelOpen(false)}
          onConfirm={(reason) =>
            cancel.mutate(
              { id: inc.id, dto: { reason } },
              { onSuccess: () => { setCancelOpen(false); toast.success("Incidencia anulada"); } },
            )
          }
        />
      )}
    </Drawer>
  );
}

/** Excepciones que originaron / se agruparon en la incidencia (trazabilidad). */
function IncidentExceptionsBlock({ incidentId }: { incidentId: string }) {
  const { data } = useExceptions({ incidentId, pageSize: 50, sort: "severity" });
  const items = data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <div className={styles.originBox}>
      <div className={styles.originTitle}>Excepciones de origen ({items.length})</div>
      <div className={excStyles.excLinks}>
        {items.map((exc) => {
          const color = THRESHOLD_META[exc.thresholdType].color;
          return (
            <Link key={exc.id} to={`/bitacoras/${exc.logEntryId}`} className={excStyles.excLink}>
              <span className={excStyles.excDot} style={{ background: color }} />
              <span style={{ flex: 1 }}>
                <strong>{exc.fieldLabel ?? (exc.fieldKey || "Registro manual")}</strong>
                {exc.triggerKind !== "MANUAL" && (
                  <> · {formatExceptionValue(exc.originalValue)}{exc.unit ? ` ${exc.unit}` : ""}</>
                )}
                {exc.sectionLabel ? <span className={styles.muted}> · {exc.sectionLabel}</span> : null}
              </span>
              <span className={styles.code}>{exc.code}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function TransitionModal({ transition, loading, onClose, onConfirm }: {
  transition: IncidentAvailableTransition;
  loading: boolean;
  onClose: () => void;
  onConfirm: (dto: { reason?: string; closureSummary?: string; password?: string; mfaCode?: string }) => void;
}) {
  const [reason, setReason] = useState("");
  const [closure, setClosure] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const canConfirm = !transition.requireSignature || password.length > 0;
  return (
    <Modal open onClose={onClose} title={transition.label} size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={loading} disabled={!canConfirm} onClick={() => onConfirm({
          reason: reason.trim() || undefined,
          closureSummary: transition.toStateIsFinal ? closure.trim() || undefined : undefined,
          password: transition.requireSignature ? password : undefined,
          mfaCode: transition.requireMfa ? mfaCode || undefined : undefined,
        })}>Confirmar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>Avanzar a <strong>{transition.toStateName}</strong>.</p>
        {transition.toStateIsFinal && (
          <label className={styles.field}><span className={styles.fieldLabel}>Resumen de cierre</span>
            <Textarea value={closure} onChange={(e) => setClosure(e.target.value)} rows={3} placeholder="Qué se resolvió / verificó…" />
          </label>
        )}
        <label className={styles.field}><span className={styles.fieldLabel}>Comentario (opcional)</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo o nota" />
        </label>
        {transition.requireSignature && (
          <div className={styles.signBox}>
            <div className={styles.signTitle}><ShieldCheck size={14} /> Firma electrónica requerida{transition.signatureMeaning ? `: ${transition.signatureMeaning}` : ""}</div>
            <label className={styles.field}><span className={styles.fieldLabel}>Contraseña</span>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </label>
            {transition.requireMfa && (
              <label className={styles.field}><span className={styles.fieldLabel}>Código MFA</span>
                <Input value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} inputMode="numeric" />
              </label>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

function CancelModal({ loading, onClose, onConfirm }: { loading: boolean; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title="Anular incidencia" size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Volver</Button>
        <Button variant="danger" loading={loading} disabled={reason.trim().length < 5} onClick={() => onConfirm(reason.trim())}>Anular</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.warn}><AlertTriangle size={15} /> La anulación es trazable (no borra la incidencia). Indica el motivo.</p>
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Motivo de la anulación (mín. 5 caracteres)" />
      </div>
    </Modal>
  );
}
