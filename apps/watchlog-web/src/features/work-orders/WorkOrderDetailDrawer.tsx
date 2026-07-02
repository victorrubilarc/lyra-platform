import { useEffect, useState } from "react";
import { Activity, ArrowRight, ClipboardCheck, Info, ListChecks, ShieldCheck, XCircle } from "lucide-react";
import type { WorkOrderAvailableTransition, WorkOrderPriority } from "@lyra/contracts";
import { Button, Drawer, Input, Modal, Select, Spinner, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate, formatDateTime } from "../../lib/format.js";
import {
  useAssignWorkOrder,
  useCancelWorkOrder,
  useTransitionWorkOrder,
  useUpdateWorkOrder,
  useWorkOrderAssignableUsers,
  useWorkOrderDetail,
} from "./work-orders-queries.js";
import { LIFECYCLE_META, ORIGIN_META, PRIORITY_META, criticalityColor, criticalityLabel } from "./work-orders-presentation.js";
import { WorkOrderChecklistsBlock } from "./WorkOrderChecklistsBlock.js";
import { WorkOrderPlanBlock } from "./WorkOrderPlanBlock.js";
import styles from "./work-orders.module.css";

interface Props {
  workOrderId: string | null;
  onClose: () => void;
}

/**
 * Detalle (peek) de una OT — S2 Puerta 1: stepper del flujo congelado + botones de
 * transición (enviar / aprobar con FIRMA Part 11 [emite folio] / rechazar con motivo
 * obligatorio) + timeline append-only. Espejo de IncidentDetailDrawer. Los checklists
 * (P2) y el plan de actividades (P3–P4) llegan en S3–S5.
 */
export function WorkOrderDetailDrawer({ workOrderId, onClose }: Props) {
  const { can } = usePermissions();
  const toast = useToast();
  const { data: wo, isLoading } = useWorkOrderDetail(workOrderId);
  const { data: users = [] } = useWorkOrderAssignableUsers();
  const assign = useAssignWorkOrder();
  const update = useUpdateWorkOrder();
  const cancel = useCancelWorkOrder();
  const transition = useTransitionWorkOrder();

  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [pending, setPending] = useState<WorkOrderAvailableTransition | null>(null);
  const [tab, setTab] = useState<"resumen" | "plan" | "checklists" | "actividad">("resumen");

  useEffect(() => {
    setCancelReason("");
    setShowCancel(false);
    setPending(null);
    setTab("resumen");
  }, [workOrderId]);

  const isLive = wo && wo.lifecycle !== "CLOSED" && wo.lifecycle !== "CANCELED";

  return (
    <Drawer open={!!workOrderId} onClose={onClose} title={wo ? wo.code : "Solicitud"} width={680}>
      {isLoading || !wo ? (
        <div className={styles.center}><Spinner /></div>
      ) : (
        <div className={styles.detail}>
          <div className={styles.drawerHead}>
            <span className={styles.code}>{wo.code}</span>
            {wo.currentStateName ? (
              <span className={styles.lifeChip} style={{ color: wo.currentStateColor ?? undefined }}>{wo.currentStateName}</span>
            ) : (
              <span className={styles.lifeChip} style={{ color: LIFECYCLE_META[wo.lifecycle].color }}>{LIFECYCLE_META[wo.lifecycle].label}</span>
            )}
            {wo.requiresPtw && <span className={styles.ptwTag}>PTW</span>}
          </div>
          <h2 className={styles.detailTitle}>{wo.title}</h2>

          {/* Pestañas: Resumen | Actividad (timeline) */}
          <div className={styles.drawerTabs} role="tablist">
            <button role="tab" aria-selected={tab === "resumen"} className={tab === "resumen" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("resumen")}>
              <Info size={14} /> Resumen
            </button>
            <button role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("plan")}>
              <ListChecks size={14} /> Plan
            </button>
            <button role="tab" aria-selected={tab === "checklists"} className={tab === "checklists" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("checklists")}>
              <ClipboardCheck size={14} /> Permiso
            </button>
            <button role="tab" aria-selected={tab === "actividad"} className={tab === "actividad" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("actividad")}>
              <Activity size={14} /> Actividad
              {wo.events.length > 0 && <span className={styles.tabBadge}>{wo.events.length}</span>}
            </button>
          </div>

          {tab === "resumen" && (<>
          {/* Stepper de estados del flujo congelado */}
          {wo.states.length > 0 && (
            <div className={styles.stepper}>
              {wo.states.map((s) => {
                const currentOrder = wo.states.find((x) => x.key === wo.currentStateKey)?.order ?? -1;
                const active = s.key === wo.currentStateKey;
                const passed = currentOrder >= s.order;
                return (
                  <div key={s.key} className={styles.step} title={s.name}>
                    <span className={styles.stepDot} style={{ background: passed ? s.color ?? "#6366F1" : "transparent", borderColor: s.color ?? "#6366F1" }} />
                    <span className={active ? styles.stepLabelActive : styles.stepLabel}>{s.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {wo.description && <p className={styles.desc}>{wo.description}</p>}

          {/* Rechazo: motivo visible (Puerta 1) */}
          {wo.rejectedAt && (
            <p className={styles.rejectBox}>
              <XCircle size={15} /> Rechazada el {formatDateTime(wo.rejectedAt)} · Motivo: {wo.rejectReason ?? "—"}
            </p>
          )}

          <dl className={styles.kv}>
            {wo.folio && (<><dt>Folio oficial</dt><dd className={styles.code}>{wo.folio}</dd></>)}
            {wo.folioIssuedAt && (<><dt>Folio emitido</dt><dd>{formatDateTime(wo.folioIssuedAt)}</dd></>)}
            {wo.approvedAt && (<><dt>Aprobada</dt><dd>{formatDateTime(wo.approvedAt)}</dd></>)}
            <dt>Tipo</dt><dd>{wo.typeName ?? "—"}</dd>
            <dt>Criticidad</dt>
            <dd><span className={styles.sevDot} style={{ background: criticalityColor(wo.criticality) }} /> {wo.criticality} · {criticalityLabel(wo.criticality)}</dd>
            <dt>Prioridad</dt><dd style={{ color: PRIORITY_META[wo.priority].color, fontWeight: 600 }}>{PRIORITY_META[wo.priority].label}</dd>
            <dt>Origen</dt><dd>{ORIGIN_META[wo.originType].label}</dd>
            <dt>Nodo</dt><dd>{wo.orgNodeName ?? "—"}</dd>
            {wo.equipmentTag && (<><dt>Equipo</dt><dd>{wo.equipmentTag}</dd></>)}
            {wo.locationDetail && (<><dt>Ubicación</dt><dd>{wo.locationDetail}</dd></>)}
            {wo.specialties.length > 0 && (<><dt>Especialidades</dt><dd>{wo.specialties.map((s) => s.name).join(", ")}</dd></>)}
            <dt>Solicitante</dt><dd>{wo.requesterName ?? "—"}</dd>
            {wo.dueAt && (<><dt>Fecha límite</dt><dd>{formatDate(wo.dueAt)}</dd></>)}
            <dt>Creada</dt><dd>{formatDate(wo.createdAt)}</dd>
            {wo.closedAt && (<><dt>Cerrada</dt><dd>{formatDateTime(wo.closedAt)}</dd></>)}
            {wo.canceledAt && (<><dt>Anulada</dt><dd>{formatDateTime(wo.canceledAt)} · {wo.cancelReason}</dd></>)}
          </dl>

          {/* Transiciones disponibles (Puerta 1: enviar / aprobar / rechazar) */}
          {isLive && can("workorder:transition") && wo.availableTransitions.length > 0 && (
            <div className={styles.actions}>
              {wo.availableTransitions.map((t) => (
                <Button
                  key={t.key}
                  variant={t.requiresReason ? "danger" : t.toStateIsFinal || t.requireSignature ? "primary" : "secondary"}
                  leftIcon={t.requireSignature ? <ShieldCheck size={15} /> : <ArrowRight size={15} />}
                  onClick={() => setPending(t)}
                >
                  {t.label}
                </Button>
              ))}
            </div>
          )}

          {isLive && can("workorder:assign") && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Responsable</span>
              <Select
                value={wo.ownerId ?? ""}
                onChange={(e) =>
                  assign.mutate(
                    { id: wo.id, dto: { ownerId: e.target.value || null } },
                    { onError: (err) => toast.error((err as Error).message) },
                  )
                }
              >
                <option value="">(sin responsable)</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </label>
          )}

          {isLive && can("workorder:edit") && (
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Prioridad</span>
              <Select
                value={wo.priority}
                onChange={(e) =>
                  update.mutate(
                    { id: wo.id, dto: { priority: e.target.value as WorkOrderPriority } },
                    { onError: (err) => toast.error((err as Error).message) },
                  )
                }
              >
                {(Object.keys(PRIORITY_META) as WorkOrderPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
              </Select>
            </label>
          )}

          {isLive && can("workorder:cancel") && (
            <div className={styles.dangerZone}>
              {!showCancel ? (
                <Button variant="danger" onClick={() => setShowCancel(true)}>Anular solicitud</Button>
              ) : (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Motivo de anulación *</span>
                  <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={2} placeholder="Explica por qué se anula (mín. 5 caracteres)" />
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => setShowCancel(false)}>Cancelar</Button>
                    <Button
                      variant="danger"
                      loading={cancel.isPending}
                      disabled={cancelReason.trim().length < 5}
                      onClick={() =>
                        cancel.mutate(
                          { id: wo.id, dto: { reason: cancelReason.trim() } },
                          {
                            onSuccess: () => { toast.success("Solicitud anulada"); setShowCancel(false); },
                            onError: (err) => toast.error((err as Error).message),
                          },
                        )
                      }
                    >
                      Confirmar anulación
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
          </>)}

          {tab === "plan" && <WorkOrderPlanBlock wo={wo} isLive={!!isLive} />}

          {tab === "checklists" && <WorkOrderChecklistsBlock workOrderId={wo.id} isLive={!!isLive} />}

          {tab === "actividad" && (
            <>
              <div className={styles.sectionTitle}>Actividad</div>
              <ul className={styles.timeline}>
                {[...wo.events].reverse().map((e) => (
                  <li key={e.id}><span className={styles.muted}>{formatDateTime(e.occurredAt)}</span> — {e.summary}{e.actorName ? ` · ${e.actorName}` : ""}</li>
                ))}
                {wo.events.length === 0 && <li className={styles.muted}>Sin actividad registrada.</li>}
              </ul>
            </>
          )}
        </div>
      )}

      {pending && wo && (
        <TransitionModal
          transition={pending}
          loading={transition.isPending}
          onClose={() => setPending(null)}
          onConfirm={(dto) =>
            transition.mutate(
              { id: wo.id, dto: { transitionKey: pending.key, ...dto } },
              {
                onSuccess: (updated) => {
                  setPending(null);
                  toast.success(updated.folio && !wo.folio ? `Aprobada · folio ${updated.folio}` : "Estado actualizado");
                },
                onError: (e) => toast.error((e as Error).message || "No se pudo avanzar"),
              },
            )
          }
        />
      )}
    </Drawer>
  );
}

/**
 * Confirmación de una transición: motivo (OBLIGATORIO si es rechazo), resumen de
 * cierre (estados finales tras aprobación) y firma electrónica (re-auth Part 11:
 * contraseña + MFA si la transición lo exige). Espejo del modal de Incidencias.
 */
function TransitionModal({ transition, loading, onClose, onConfirm }: {
  transition: WorkOrderAvailableTransition;
  loading: boolean;
  onClose: () => void;
  onConfirm: (dto: { reason?: string; closureSummary?: string; password?: string; mfaCode?: string }) => void;
}) {
  const [reason, setReason] = useState("");
  const [closure, setClosure] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const needsReason = transition.requiresReason && reason.trim().length === 0;
  const needsPassword = transition.requireSignature && password.length === 0;
  const canConfirm = !needsReason && !needsPassword;
  return (
    <Modal open onClose={onClose} title={transition.label} size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant={transition.requiresReason ? "danger" : "primary"} loading={loading} disabled={!canConfirm} onClick={() => onConfirm({
          reason: reason.trim() || undefined,
          closureSummary: transition.toStateIsFinal && !transition.requiresReason ? closure.trim() || undefined : undefined,
          password: transition.requireSignature ? password : undefined,
          mfaCode: transition.requireMfa ? mfaCode || undefined : undefined,
        })}>Confirmar</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>Avanzar a <strong>{transition.toStateName}</strong>.</p>
        {transition.requiresReason ? (
          <label className={styles.field}><span className={styles.fieldLabel}>Motivo del rechazo *</span>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Por qué se rechaza la solicitud (obligatorio)" autoFocus />
          </label>
        ) : (
          <>
            {transition.toStateIsFinal && (
              <label className={styles.field}><span className={styles.fieldLabel}>Resumen de cierre</span>
                <Textarea value={closure} onChange={(e) => setClosure(e.target.value)} rows={3} placeholder="Qué se ejecutó / verificó…" />
              </label>
            )}
            <label className={styles.field}><span className={styles.fieldLabel}>Comentario (opcional)</span>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo o nota" />
            </label>
          </>
        )}
        {transition.requireSignature && (
          <div className={styles.signBox}>
            <div className={styles.signTitle}><ShieldCheck size={14} /> Firma electrónica requerida{transition.signatureMeaning ? `: ${transition.signatureMeaning}` : ""}</div>
            <label className={styles.field}><span className={styles.fieldLabel}>Contraseña</span>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!transition.requiresReason} />
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
