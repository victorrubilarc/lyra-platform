import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Activity, ArrowLeft, ArrowRight, ClipboardCheck, Info, ListChecks, ShieldCheck, Users, Waypoints, XCircle } from "lucide-react";
import type { WorkOrderAvailableTransition, WorkOrderPriority } from "@lyra/contracts";
import { Button, Input, Modal, Select, Spinner, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDate, formatDateTime } from "../../lib/format.js";
import {
  useAssignWorkOrder,
  useCancelWorkOrder,
  useTransitionWorkOrder,
  useUpdateWorkOrder,
  useWorkOrderAssignableUsers,
  useWorkOrderDetail,
  useWorkOrderRoster,
} from "./work-orders-queries.js";
import { LIFECYCLE_META, ORIGIN_META, PRIORITY_META, SLA_STATUS_META, criticalityColor, criticalityLabel } from "./work-orders-presentation.js";
import { WorkOrderChecklistsBlock } from "./WorkOrderChecklistsBlock.js";
import { WorkOrderRosterBlock } from "./WorkOrderRosterBlock.js";
import { WorkOrderPlanBlock } from "./WorkOrderPlanBlock.js";
import { WorkflowDiagram } from "../logbook/WorkflowDiagram.js";
import styles from "./work-orders.module.css";

/**
 * Página de detalle de una OT (Object Page, estándar SAP Fiori / Maximo). Reemplaza el
 * drawer lateral por una PÁGINA dedicada con ruta propia (`/ordenes-trabajo/:id`,
 * deep-linkable): la OT es un objeto DENSO (4 puertas + folio + checklists + plan +
 * baseline + firmas) que necesita todo el ancho. Layout: cabecera con folio/estado +
 * **CTA primario de etapa** (la transición de avance) + acciones secundarias discretas;
 * stepper del flujo; cuerpo a 2 columnas (pestañas a todo el ancho + panel lateral de
 * estado/responsable/metadatos). Responsive: en pantallas angostas el panel baja debajo.
 */
/** ISO (UTC) → valor de un <input type="datetime-local"> ("YYYY-MM-DDTHH:mm", hora local). */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function WorkOrderDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const toast = useToast();
  const { data: wo, isLoading } = useWorkOrderDetail(id);
  const { data: roster } = useWorkOrderRoster(id);
  const { data: users = [] } = useWorkOrderAssignableUsers();
  const assign = useAssignWorkOrder();
  const update = useUpdateWorkOrder();
  const cancel = useCancelWorkOrder();
  const transition = useTransitionWorkOrder();

  const [cancelReason, setCancelReason] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [pending, setPending] = useState<WorkOrderAvailableTransition | null>(null);
  const [tab, setTab] = useState<"resumen" | "plan" | "checklists" | "dotacion" | "flujo" | "actividad">("resumen");
  const rosterEnabled = !!roster?.enabled;

  const back = () => navigate("/ordenes-trabajo");

  if (isLoading || !wo) {
    return <div className={styles.center}><Spinner /></div>;
  }

  const isLive = wo.lifecycle !== "CLOSED" && wo.lifecycle !== "CANCELED";
  const canTransition = isLive && can("workorder:transition") && wo.availableTransitions.length > 0;
  // CTA primario = la transición de AVANCE (no devolver/reabrir/rechazo); el resto van
  // como acciones secundarias discretas. Así hay UNA acción evidente por etapa.
  const forward = wo.availableTransitions.filter((t) => !t.requiresReason && !/^(devolver|reabrir)/.test(t.key));
  const primary = forward[0] ?? null;
  const secondary = wo.availableTransitions.filter((t) => t !== primary);
  const currentOrder = wo.states.find((x) => x.key === wo.currentStateKey)?.order ?? -1;

  return (
    <div className={styles.detailPage}>
      {/* --- Cabecera: breadcrumb + identidad + CTA de etapa --- */}
      <div className={styles.detailTopbar}>
        <button className={styles.back} onClick={back}><ArrowLeft size={15} /> Órdenes de trabajo</button>
      </div>
      <header className={styles.detailHeader}>
        <div className={styles.detailHeaderMain}>
          <div className={styles.drawerHead}>
            <span className={styles.code}>{wo.code}</span>
            {wo.currentStateName ? (
              <span className={styles.lifeChip} style={{ color: wo.currentStateColor ?? undefined }}>{wo.currentStateName}</span>
            ) : (
              <span className={styles.lifeChip} style={{ color: LIFECYCLE_META[wo.lifecycle].color }}>{LIFECYCLE_META[wo.lifecycle].label}</span>
            )}
            {wo.requiresPtw && <span className={styles.ptwTag}>PTW</span>}
            {wo.slaStatus !== "none" && (
              <span
                className={styles.lifeChip}
                style={{ color: SLA_STATUS_META[wo.slaStatus].color }}
                title={wo.dueAt ? `Plazo: ${formatDateTime(wo.dueAt)}` : undefined}
              >
                ● {SLA_STATUS_META[wo.slaStatus].label}
              </span>
            )}
            {wo.stalled && <span className={styles.stalledTag} title="Lleva demasiado tiempo en su estado actual">Estancada</span>}
          </div>
          <h1 className={styles.detailPageTitle}>{wo.title}</h1>
        </div>
        {canTransition && (
          <div className={styles.detailHeaderActions}>
            {primary && (
              <Button
                variant="primary"
                leftIcon={primary.requireSignature ? <ShieldCheck size={16} /> : <ArrowRight size={16} />}
                onClick={() => setPending(primary)}
              >
                {primary.label}
              </Button>
            )}
            {secondary.map((t) => (
              <Button
                key={t.key}
                variant={t.requiresReason ? "danger" : "secondary"}
                leftIcon={t.requireSignature ? <ShieldCheck size={15} /> : undefined}
                onClick={() => setPending(t)}
              >
                {t.label}
              </Button>
            ))}
          </div>
        )}
      </header>

      {/* --- Stepper: dónde estoy de un vistazo --- */}
      {wo.states.length > 0 && (
        <div className={styles.stepper}>
          {wo.states.map((s) => {
            const active = s.key === wo.currentStateKey;
            const passed = currentOrder >= s.order;
            return (
              <div key={s.key} className={styles.step} title={s.name}>
                <span
                  className={active ? `${styles.stepDot} ${styles.stepDotCurrent}` : styles.stepDot}
                  style={{ background: passed ? s.color ?? "#6366F1" : "transparent", borderColor: s.color ?? "#6366F1" }}
                />
                <span className={active ? styles.stepLabelActive : styles.stepLabel}>{s.name}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* --- Cuerpo a 2 columnas: contenido (pestañas) + panel de estado --- */}
      <div className={styles.detailBody}>
        <main className={styles.detailMain}>
          <div className={styles.drawerTabs} role="tablist">
            <button role="tab" aria-selected={tab === "resumen"} className={tab === "resumen" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("resumen")}>
              <Info size={14} /> Resumen
            </button>
            <button role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("plan")}>
              <ListChecks size={14} /> Plan de actividades
            </button>
            <button role="tab" aria-selected={tab === "checklists"} className={tab === "checklists" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("checklists")}>
              <ClipboardCheck size={14} /> Verificaciones
            </button>
            {rosterEnabled && (
              <button role="tab" aria-selected={tab === "dotacion"} className={tab === "dotacion" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("dotacion")}>
                <Users size={14} /> Dotación
                {roster && roster.workers.length > 0 && <span className={styles.tabBadge}>{roster.workers.length}</span>}
              </button>
            )}
            <button role="tab" aria-selected={tab === "flujo"} className={tab === "flujo" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("flujo")}>
              <Waypoints size={14} /> Flujo
            </button>
            <button role="tab" aria-selected={tab === "actividad"} className={tab === "actividad" ? styles.drawerTabActive : styles.drawerTab} onClick={() => setTab("actividad")}>
              <Activity size={14} /> Historial
              {wo.events.length > 0 && <span className={styles.tabBadge}>{wo.events.length}</span>}
            </button>
          </div>

          {tab === "resumen" && (
            <div className={styles.summary}>
              {/* Descripción — SIEMPRE visible (con placeholder si está vacía) */}
              <section className={styles.summaryGroup}>
                <div className={styles.summaryGroupTitle}>Descripción</div>
                {wo.description
                  ? <p className={styles.summaryDesc}>{wo.description}</p>
                  : <p className={`${styles.summaryDesc} ${styles.summaryDescEmpty}`}>Sin descripción registrada.</p>}
              </section>

              {wo.rejectedAt && (
                <p className={styles.rejectBox}>
                  <XCircle size={15} /> Rechazada el {formatDateTime(wo.rejectedAt)} · Motivo: {wo.rejectReason ?? "—"}
                </p>
              )}
              {wo.closureSummary && (
                <p className={styles.closureBox}>
                  <Info size={15} /> <span><strong>Resumen de cierre:</strong> {wo.closureSummary}</span>
                </p>
              )}

              {/* Clasificación */}
              <section className={styles.summaryGroup}>
                <div className={styles.summaryGroupTitle}>Clasificación</div>
                <dl className={styles.kv}>
                  <dt>Tipo</dt><dd>{wo.typeName ?? "—"}</dd>
                  <dt>Criticidad</dt>
                  <dd><span className={styles.sevDot} style={{ background: criticalityColor(wo.criticality) }} /> {wo.criticality} · {criticalityLabel(wo.criticality)}</dd>
                  <dt>Prioridad</dt><dd style={{ color: PRIORITY_META[wo.priority].color, fontWeight: 600 }}>{PRIORITY_META[wo.priority].label}</dd>
                  <dt>Origen</dt><dd>{ORIGIN_META[wo.originType].label}</dd>
                  <dt>Permiso de trabajo (PTW)</dt><dd>{wo.requiresPtw ? "Sí" : "No"}</dd>
                  {wo.riskProbability != null && wo.riskConsequence != null && (
                    <><dt>Riesgo (ISO 31000)</dt><dd>Probabilidad {wo.riskProbability} · Consecuencia {wo.riskConsequence}</dd></>
                  )}
                  {wo.specialties.length > 0 && (<><dt>Especialidades</dt><dd>{wo.specialties.map((s) => s.name).join(", ")}</dd></>)}
                </dl>
              </section>

              {/* Ubicación y alcance */}
              <section className={styles.summaryGroup}>
                <div className={styles.summaryGroupTitle}>Ubicación y alcance</div>
                <dl className={styles.kv}>
                  <dt>Nodo</dt><dd>{wo.orgNodeName ?? "—"}</dd>
                  {wo.equipmentTag && (<><dt>Equipo</dt><dd>{wo.equipmentTag}</dd></>)}
                  {wo.locationDetail && (<><dt>Ubicación (detalle)</dt><dd>{wo.locationDetail}</dd></>)}
                  {wo.shiftCode && (<><dt>Turno</dt><dd>{wo.shiftCode}</dd></>)}
                </dl>
              </section>

              {/* Personas */}
              <section className={styles.summaryGroup}>
                <div className={styles.summaryGroupTitle}>Personas</div>
                <dl className={styles.kv}>
                  <dt>Solicitante</dt><dd>{wo.requesterName ?? "—"}</dd>
                  <dt>Responsable</dt><dd>{wo.ownerName ?? <span className={styles.muted}>sin asignar</span>}</dd>
                </dl>
              </section>

              {/* Fechas */}
              <section className={styles.summaryGroup}>
                <div className={styles.summaryGroupTitle}>Fechas</div>
                <dl className={styles.kv}>
                  {wo.detectedAt && (<><dt>Detectada</dt><dd>{formatDateTime(wo.detectedAt)}</dd></>)}
                  {wo.plannedStart && (<><dt>Inicio planificado</dt><dd>{formatDate(wo.plannedStart)}</dd></>)}
                  {wo.plannedEnd && (<><dt>Fin planificado</dt><dd>{formatDate(wo.plannedEnd)}</dd></>)}
                  {wo.dueAt && (<><dt>Fecha límite</dt><dd>{formatDate(wo.dueAt)}</dd></>)}
                  <dt>Creada</dt><dd>{formatDateTime(wo.createdAt)}</dd>
                  <dt>Última actualización</dt><dd>{formatDateTime(wo.updatedAt)}</dd>
                  {wo.closedAt && (<><dt>Cerrada</dt><dd>{formatDateTime(wo.closedAt)}</dd></>)}
                  {wo.canceledAt && (<><dt>Anulada</dt><dd>{formatDateTime(wo.canceledAt)} · {wo.cancelReason}</dd></>)}
                </dl>
              </section>

              {/* Origen ligado (trazabilidad) */}
              {(wo.originIncidentId || wo.originExceptionId || wo.originLogEntryId) && (
                <section className={styles.summaryGroup}>
                  <div className={styles.summaryGroupTitle}>Origen ligado</div>
                  <dl className={styles.kv}>
                    {wo.originIncidentId && (
                      <>
                        <dt>Incidencia</dt>
                        <dd>
                          <Link to={`/incidencias?open=${wo.originIncidentId}`}>
                            {wo.originIncidentCode
                              ? `${wo.originIncidentCode}${wo.originIncidentTitle ? ` — ${wo.originIncidentTitle}` : ""}`
                              : "Ver incidencia de origen"}
                          </Link>
                        </dd>
                      </>
                    )}
                    {wo.originLogEntryId && (<><dt>Bitácora</dt><dd><Link to={`/bitacoras/${wo.originLogEntryId}`}>Ver entrada de origen</Link></dd></>)}
                    {wo.originExceptionId && (<><dt>Excepción</dt><dd className={styles.mono}>{wo.originExceptionId}</dd></>)}
                  </dl>
                </section>
              )}
            </div>
          )}

          {tab === "plan" && <WorkOrderPlanBlock wo={wo} isLive={isLive} />}
          {tab === "checklists" && <WorkOrderChecklistsBlock wo={wo} isLive={isLive} />}
          {tab === "dotacion" && <WorkOrderRosterBlock wo={wo} isLive={isLive} />}

          {tab === "flujo" && (
            wo.workflow && wo.workflow.states.length > 0 ? (
              <WorkflowDiagram
                states={wo.workflow.states}
                transitions={wo.workflow.transitions}
                record={{
                  executed: wo.workflow.executed,
                  currentStateKey: wo.currentStateKey,
                  recordedAt: wo.createdAt,
                  // El diagrama trata "DRAFT" = en curso; para la OT, "en curso" = viva.
                  status: isLive ? "DRAFT" : "CLOSED",
                }}
              />
            ) : (
              <p className={styles.muted}>Esta orden de trabajo no tiene un flujo configurado.</p>
            )
          )}

          {tab === "actividad" && (
            <>
              <div className={styles.sectionTitle}>Historial</div>
              <ul className={styles.timeline}>
                {[...wo.events].reverse().map((e) => (
                  <li key={e.id}><span className={styles.muted}>{formatDateTime(e.occurredAt)}</span> — {e.summary}{e.actorName ? ` · ${e.actorName}` : ""}</li>
                ))}
                {wo.events.length === 0 && <li className={styles.muted}>Sin actividad registrada.</li>}
              </ul>
            </>
          )}
        </main>

        {/* --- Panel lateral: estado + acciones editables + metadatos --- */}
        <aside className={styles.detailAside}>
          <div className={styles.asideCard}>
            <div className={styles.asideTitle}>Estado</div>
            <dl className={styles.kv}>
              {wo.folio && (<><dt>Folio</dt><dd className={styles.code}>{wo.folio}</dd></>)}
              {wo.approvedAt && (<><dt>Aprobada</dt><dd>{formatDate(wo.approvedAt)}</dd></>)}
              {wo.planFrozenAt && (<><dt>Plan congelado</dt><dd>{formatDate(wo.planFrozenAt)}</dd></>)}
            </dl>

            {isLive && can("workorder:assign") && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Responsable</span>
                <Select value={wo.ownerId ?? ""} onChange={(e) => assign.mutate({ id: wo.id, dto: { ownerId: e.target.value || null } }, { onError: (err) => toast.error((err as Error).message) })}>
                  <option value="">(sin responsable)</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </label>
            )}
            {isLive && can("workorder:edit") && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Prioridad</span>
                <Select value={wo.priority} onChange={(e) => update.mutate({ id: wo.id, dto: { priority: e.target.value as WorkOrderPriority } }, { onError: (err) => toast.error((err as Error).message) })}>
                  {(Object.keys(PRIORITY_META) as WorkOrderPriority[]).map((p) => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
                </Select>
              </label>
            )}
            {isLive && can("workorder:edit") && (
              <label className={styles.field}>
                <span className={styles.fieldLabel}>Plazo de resolución</span>
                <Input
                  key={wo.dueAt ?? "none"}
                  type="datetime-local"
                  defaultValue={toLocalInput(wo.dueAt)}
                  onChange={(e) => {
                    const v = e.target.value ? new Date(e.target.value).toISOString() : null;
                    update.mutate({ id: wo.id, dto: { dueAt: v } }, {
                      onSuccess: () => toast.success(v ? "Plazo actualizado" : "Plazo quitado"),
                      onError: (err) => toast.error((err as Error).message),
                    });
                  }}
                />
                <span className={styles.muted}>Vacío = sin plazo. Se auto-fija al aprobar según el SLA del tipo.</span>
              </label>
            )}
          </div>

          {isLive && can("workorder:cancel") && (
            <div className={styles.asideCard}>
              <div className={styles.dangerZone}>
                {!showCancel ? (
                  <Button variant="danger" block onClick={() => setShowCancel(true)}>Anular solicitud</Button>
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
                        onClick={() => cancel.mutate({ id: wo.id, dto: { reason: cancelReason.trim() } }, {
                          onSuccess: () => { toast.success("Solicitud anulada"); setShowCancel(false); },
                          onError: (err) => toast.error((err as Error).message),
                        })}
                      >
                        Confirmar anulación
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {pending && (
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
    </div>
  );
}

/**
 * Confirmación de una transición: motivo (OBLIGATORIO si es rechazo), resumen de
 * cierre (estados finales tras aprobación) y firma electrónica (re-auth Part 11:
 * contraseña + MFA si la transición lo exige).
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
