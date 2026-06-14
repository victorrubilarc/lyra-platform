import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileSignature,
  GitBranch,
  History,
  Link2,
  Lock,
  PenLine,
  Printer,
  ShieldCheck,
  Sparkles,
  TimerOff,
  TriangleAlert,
} from "lucide-react";
import { Button, Card, Chip, EmptyState, Spinner, useToast } from "@lyra/ui";
import {
  formatEntryFolio,
  isFieldVisible,
  thresholdBandFor,
  type LogEntryDetail,
  type LogEntryListItem,
  type LogEntryTimelineEvent,
  type SignatureVerifyResult,
  type TemplateFieldDto,
} from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { FieldControl } from "../templates/FieldControl.js";
import { useLogEntry } from "../log-entries/log-entries-queries.js";
import {
  useLogbookChanges,
  useLogbookRelated,
  useLogbookTimeline,
  useVerifySignature,
} from "./logbook-queries.js";
import fillStyles from "../log-entries/LogEntries.module.css";
import styles from "./Logbook.module.css";
import { WorkflowDiagram } from "./WorkflowDiagram.js";

function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium" }).format(new Date(iso));
}

/** Representación legible de un valor para el log de cambios (espejo del prototipo). */
function fmtVal(v: unknown): string {
  if (v === undefined || v === null || v === "") return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length === 0 ? "—" : v.join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/** Mini-representación de la máquina de estados: la POSICIÓN del registro. */
function WorkflowStepper({ entry }: { entry: LogEntryDetail }) {
  if (!entry.workflowVersion || !entry.currentStateKey) return null;
  const states = entry.workflowVersion.states;
  const currentIndex = states.findIndex((s) => s.key === entry.currentStateKey);
  return (
    <div className={styles.stepper} aria-label="Posición en el flujo">
      {states.map((s, i) => {
        const isCurrent = s.key === entry.currentStateKey;
        const color = s.color ?? "var(--color-accent, #6366f1)";
        return (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center" }}>
            {i > 0 && <ArrowRight size={12} className={styles.stepArrow} />}
            <span className={`${styles.step} ${isCurrent ? styles.stepCurrent : i < currentIndex ? styles.stepDone : ""}`}>
              <span className={styles.stepDot} style={{ background: color, opacity: isCurrent || i < currentIndex ? 1 : 0.35 }} />
              {s.name}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** Panel de firmas: manifestación §11.50 + verificación de integridad §11.70. */
function SignaturesPanel({ entry }: { entry: LogEntryDetail }) {
  const { t } = useTranslation();
  const toast = useToast();
  const verify = useVerifySignature(entry.id);
  const [results, setResults] = useState<Record<string, SignatureVerifyResult>>({});
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  if (entry.signatures.length === 0) return null;

  function doVerify(signatureId: string) {
    setVerifyingId(signatureId);
    verify.mutate(signatureId, {
      onSuccess: (res) => setResults((r) => ({ ...r, [signatureId]: res })),
      onError: (e) => toast.error(e instanceof ApiError ? e.message : t("common.errorGeneric")),
      onSettled: () => setVerifyingId(null),
    });
  }

  const verdictChip = (res: SignatureVerifyResult) =>
    res.verdict === "VALID" ? (
      <Chip variant="success" label={t("logbook.viewer.verdict.VALID")} />
    ) : res.verdict === "VALID_RECORD_CHANGED_AFTER" ? (
      <Chip variant="warning" label={t("logbook.viewer.verdict.VALID_RECORD_CHANGED_AFTER")} />
    ) : (
      <Chip variant="error" label={t("logbook.viewer.verdict.INVALID")} />
    );

  return (
    <Card className={fillStyles.section}>
      <div className={fillStyles.sectionTitle}>
        <ShieldCheck size={16} /> {t("logbook.viewer.signaturesTitle")}
      </div>
      <div>
        {entry.signatures.map((sig) => {
          const res = results[sig.id];
          return (
            <div key={sig.id} className={styles.signatureRow}>
              <div>
                <div className={styles.signatureWho}>
                  {sig.signerName} — <i>{sig.meaning}</i>
                </div>
                <div className={styles.signatureMeta}>
                  {t(`logbook.viewer.sigContext.${sig.context}`)}
                  {sig.sectionKey ? ` · ${sig.sectionKey}` : sig.transitionKey ? ` · ${sig.transitionKey}` : ""} ·{" "}
                  {t(`logbook.viewer.sigMethod.${sig.method}`)} · {formatDateTime(sig.signedAt)} UTC
                </div>
                <div className={styles.signatureHash}>SHA-256 {sig.payloadHash}</div>
                {res && res.verdict !== "VALID" && (
                  <div className={styles.verdictNote}>
                    {t(`logbook.viewer.verdictNote.${res.verdict}`, { count: res.changesAfterSignature })}
                  </div>
                )}
              </div>
              <div className={styles.signatureActions}>
                {res && verdictChip(res)}
                <Button variant="secondary" loading={verifyingId === sig.id} onClick={() => doVerify(sig.id)}>
                  {res ? t("logbook.viewer.reverify") : t("logbook.viewer.verify")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Evento de la línea de tiempo unificada (audit trail ALCOA+). */
function TimelineEvent({ event }: { event: LogEntryTimelineEvent }) {
  const { t } = useTranslation();
  switch (event.kind) {
    case "CREATED":
      return (
        <div className={`${styles.eventItem} ${styles.eventSignature}`}>
          <div className={styles.eventHead}>
            <span className={styles.eventTitle}>
              <Sparkles size={14} /> {t("logbook.viewer.event.created")}
            </span>
            <span className={styles.eventWhen}>
              {event.actorName ? `${event.actorName} · ` : ""}
              {formatDateTime(event.at)}
            </span>
          </div>
        </div>
      );
    case "SEALED":
      return (
        <div className={`${styles.eventItem} ${styles.eventSealed}`}>
          <div className={styles.eventHead}>
            <span className={styles.eventTitle}>
              <Lock size={14} /> {t("logbook.viewer.event.sealed")}
            </span>
            <span className={styles.eventWhen}>{formatDateTime(event.at)}</span>
          </div>
        </div>
      );
    case "FIELD_CHANGE":
      return (
        <div className={`${styles.eventItem} ${styles.eventChange}`}>
          <div className={styles.eventHead}>
            <span className={styles.eventTitle}>
              <PenLine size={14} /> {event.fieldLabel ?? event.fieldKey}
            </span>
            <span className={styles.eventWhen}>
              {event.actorName ? `${event.actorName} · ` : ""}
              {formatDateTime(event.at)}
            </span>
          </div>
          <div className={styles.eventBody}>
            <span className={styles.diffBefore}>{fmtVal(event.before)}</span>
            <span className={styles.diffArrow}>→</span>
            <span className={styles.diffAfter}>{fmtVal(event.after)}</span>
          </div>
          {event.reason && <div className={styles.eventReason}>“{event.reason}”</div>}
        </div>
      );
    case "TRANSITION":
      return (
        <div className={`${styles.eventItem} ${styles.eventTransition}`}>
          <div className={styles.eventHead}>
            <span className={styles.eventTitle}>
              <GitBranch size={14} /> {event.label ?? event.transitionKey}
            </span>
            <span className={styles.eventWhen}>
              {event.actorName ? `${event.actorName} · ` : ""}
              {formatDateTime(event.at)}
            </span>
          </div>
          <div className={styles.eventBody}>
            {event.fromStateName ?? event.fromStateKey}
            <span className={styles.diffArrow}>→</span>
            <b>{event.toStateName ?? event.toStateKey}</b>
            {event.signature && (
              <span style={{ marginLeft: 8 }}>
                <Chip variant="success" label={t("logbook.transition.signedChip", { meaning: event.signature.meaning })} />
              </span>
            )}
          </div>
          {event.reason && <div className={styles.eventReason}>“{event.reason}”</div>}
        </div>
      );
    case "DEFERRED_DECLARED":
      return (
        <div className={`${styles.eventItem} ${styles.eventChange}`}>
          <div className={styles.eventHead}>
            <span className={styles.eventTitle}>
              <History size={14} /> {t("logbook.viewer.event.deferredDeclared")}
            </span>
            <span className={styles.eventWhen}>
              {event.actorName ? `${event.actorName} · ` : ""}
              {formatDateTime(event.at)}
            </span>
          </div>
          <div className={styles.eventBody}>
            {t("logbook.deferral.eventBody", { at: formatDateTime(event.declaredEffectiveAt) })}
          </div>
          {event.reason && <div className={styles.eventReason}>“{event.reason}”</div>}
        </div>
      );
    case "VOIDED":
      return (
        <div className={`${styles.eventItem} ${styles.eventChange}`}>
          <div className={styles.eventHead}>
            <span className={styles.eventTitle}>
              <Ban size={14} /> {t("logbook.viewer.event.voided")}
            </span>
            <span className={styles.eventWhen}>
              {event.actorName ? `${event.actorName} · ` : ""}
              {formatDateTime(event.at)}
            </span>
          </div>
          {event.reason && <div className={styles.eventReason}>“{event.reason}”</div>}
        </div>
      );
    case "SECTION_SIGNED":
      return (
        <div className={`${styles.eventItem} ${styles.eventSignature}`}>
          <div className={styles.eventHead}>
            <span className={styles.eventTitle}>
              <FileSignature size={14} /> {t("logbook.viewer.event.sectionSigned", { section: event.sectionTitle ?? event.sectionKey })}
            </span>
            <span className={styles.eventWhen}>
              {event.signerName} · {formatDateTime(event.at)}
            </span>
          </div>
          <div className={styles.eventBody}>
            <i>{event.meaning}</i>
          </div>
        </div>
      );
  }
}

function RelatedGroup({ title, items }: { title: string; items: LogEntryListItem[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  if (items.length === 0) return null;
  return (
    <div>
      <div className={styles.relatedGroupTitle}>{title}</div>
      <div className={styles.relatedList}>
        {items.map((r) => (
          <button key={r.id} type="button" className={styles.relatedItem} onClick={() => navigate(`/bitacoras/${r.id}`)}>
            <span>
              <span className={styles.folio}>{formatEntryFolio(r.entryNumber)}</span>
              <span style={{ marginLeft: 10 }}>{r.templateName}</span>
            </span>
            <span className={styles.cellSub}>
              {r.shiftCode ? `${t("logbook.fill.shift")} ${r.shiftCode} · ` : ""}
              {formatDateTime(r.effectiveAt)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function EntryViewerPage() {
  const { t } = useTranslation();
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();

  const { data: entry, isLoading, isError } = useLogEntry(id);
  const timeline = useLogbookTimeline(id);
  const changes = useLogbookChanges(id);
  const related = useLogbookRelated(id);

  if (isLoading) {
    return (
      <div className={styles.viewerPage}>
        <Spinner />
      </div>
    );
  }
  if (isError || !entry) {
    return (
      <div className={styles.viewerPage}>
        <EmptyState icon={<TriangleAlert size={30} />} title={t("logbook.fill.loadError")} />
      </div>
    );
  }

  const valuesByKey: Record<string, unknown> = {};
  for (const v of entry.values) valuesByKey[v.fieldKey] = v.value;
  const stateBySection = new Map(entry.sectionStates.map((s) => [s.sectionKey, s]));
  const currentState = entry.workflowVersion?.states.find((s) => s.key === entry.currentStateKey);
  const stateColor = currentState?.color ?? "var(--color-accent, #6366f1)";
  const timelineEvents = timeline.data?.pages.flatMap((p) => p.events) ?? [];
  const changeItems = changes.data?.pages.flatMap((p) => p.items) ?? [];

  const fieldBand = (f: TemplateFieldDto) =>
    thresholdBandFor({ key: f.key, type: f.type, dataType: f.dataType, label: f.label, config: f.config }, valuesByKey[f.key]);

  return (
    <div className={styles.viewerPage}>
      <div className={`${styles.headerActions} ${styles.noPrint}`} style={{ justifyContent: "space-between" }}>
        <Button variant="secondary" onClick={() => navigate("/bitacoras")}>
          <ArrowLeft size={15} /> {t("logbook.viewer.back")}
        </Button>
        <div className={styles.headerActions}>
          {/* Abrir para EDITAR: solo si el registro sigue en curso (DRAFT) y el
              usuario puede llenar. El backend reaplica la autorización por sección. */}
          {can("logentry:fill") && entry.status === "DRAFT" && (
            <Button variant="primary" leftIcon={<PenLine size={15} />} onClick={() => navigate(`/bitacoras/${entry.id}/editar`)}>
              {t("logbook.viewer.edit")}
            </Button>
          )}
          <Button variant="secondary" leftIcon={<Printer size={15} />} onClick={() => window.print()}>
            {t("logbook.viewer.print")}
          </Button>
        </div>
      </div>

      {/* Borrador ANULADO (2.8.2): huella prominente quién/cuándo/por qué. */}
      {entry.status === "VOID" && (
        <div className={styles.voidBanner}>
          <Ban size={18} />
          <span>
            {t("logbook.void.banner", {
              who: entry.voidedByName ?? "—",
              at: entry.voidedAt ? formatDateTime(entry.voidedAt) : "—",
            })}
            {entry.voidReason ? ` — “${entry.voidReason}”` : ""}
          </span>
        </div>
      )}

      {/* Cabecera de identidad (record review) */}
      <Card className={styles.viewerHeader}>
        <div className={styles.viewerTopRow}>
          <div>
            <span className={styles.viewerFolio}>{formatEntryFolio(entry.entryNumber)}</span>
            <div className={styles.viewerName}>{entry.templateName}</div>
            <div className={fillStyles.entryNode}>{entry.orgNodePath ?? "—"}</div>
          </div>
          <div className={fillStyles.entryHeadChips}>
            {entry.entryOrigin === "DEFERRED" && <Chip variant="warning" label={t("logbook.origin.DEFERRED")} />}
            {entry.currentStateName && (
              <span
                className={styles.stateChip}
                style={{
                  color: stateColor,
                  borderColor: `color-mix(in srgb, ${stateColor} 45%, transparent)`,
                  background: `color-mix(in srgb, ${stateColor} 12%, transparent)`,
                }}
              >
                <span className={styles.stateDot} />
                {entry.currentStateName}
              </span>
            )}
            <Chip
              variant={entry.status === "SUBMITTED" ? "success" : entry.status === "VOID" ? "default" : "warning"}
              label={t(`logbook.status.${entry.status}`)}
            />
          </div>
        </div>

        <WorkflowStepper entry={entry} />

        <div className={fillStyles.dimsRow}>
          <span className={fillStyles.dimChip}>
            <Clock size={13} /> {t("logbook.fill.effectiveAt")}: <b>{formatDateTime(entry.effectiveAt)}</b>
          </span>
          {entry.shiftCode && (
            <span className={fillStyles.dimChip}>
              <CalendarClock size={13} /> {t("logbook.fill.shift")}: <b>{entry.shiftCode}</b>
            </span>
          )}
          {entry.operationalDate && (
            <span className={fillStyles.dimChip}>
              {t("logbook.fill.operationalDate")}: <b>{entry.operationalDate}</b>
            </span>
          )}
          {entry.periodKey && (
            <span className={fillStyles.dimChip}>
              {t("logbook.fill.period")}: <b>{entry.periodKey}</b>
            </span>
          )}
        </div>

        <div className={styles.viewerMetaRow}>
          <span>
            {t("logbook.viewer.versionLabel")}: <b>v{entry.version.versionNumber}</b>
          </span>
          <span>
            {t("logbook.list.author")}: <b>{entry.createdByName ?? "—"}</b>
          </span>
          {entry.equipmentName && (
            <span>
              {t("logbook.viewer.equipment")}: <b>{entry.equipmentName}</b>
            </span>
          )}
          <span>
            {t("logbook.list.recordedAt")}: <b>{formatDateTime(entry.recordedAt)}</b>
          </span>
          {entry.sealedAt && (
            <span>
              <CheckCircle2 size={12} style={{ verticalAlign: -2 }} /> {t("logbook.viewer.sealedAt")}:{" "}
              <b>{formatDateTime(entry.sealedAt)}</b>
            </span>
          )}
        </div>

        {/* Huella del registro diferido (2.7.0): qué se declaró, quién y por qué. */}
        {entry.entryOrigin === "DEFERRED" && (
          <div className={fillStyles.deferredNote}>
            <History size={13} />
            <span>
              {t("logbook.deferral.viewerNote", {
                at: entry.declaredEffectiveAt ? formatDateTime(entry.declaredEffectiveAt) : "—",
                by: entry.deferredDeclaredByName ?? "—",
              })}
              {entry.deferredReason ? ` — “${entry.deferredReason}”` : ""}
            </span>
          </div>
        )}
      </Card>

      {/* Ventana de edición (2.7.2): mismo banner informativo que el llenado, solo
          mientras la entrada sigue editable (DRAFT). En registros sellados es moot. */}
      {entry.status === "DRAFT" &&
        entry.editWindow &&
        (entry.editWindow.expired ? (
          <div className={`${fillStyles.editWindowBanner} ${fillStyles.editWindowExpired}`}>
            <TimerOff size={18} />
            <span>
              {entry.editWindow.canOverride
                ? t("logbook.fill.windowExpiredOverrideBanner", { until: formatDateTime(entry.editWindow.expiresAt) })
                : t("logbook.fill.windowExpiredReadonlyBanner", { until: formatDateTime(entry.editWindow.expiresAt) })}
            </span>
          </div>
        ) : (
          <div className={`${fillStyles.editWindowBanner} ${fillStyles.editWindowOk}`}>
            <Clock size={18} />
            <span>{t("logbook.fill.windowOpenBanner", { until: formatDateTime(entry.editWindow.expiresAt) })}</span>
          </div>
        ))}

      {/* Secciones con valores resueltos (read-only) */}
      {entry.version.sections.map((section) => {
        const st = stateBySection.get(section.key);
        const visible = section.fields.filter((f) => isFieldVisible(f.visibleWhen, valuesByKey));
        return (
          <Card key={section.key} className={fillStyles.section}>
            <div className={fillStyles.sectionHead}>
              <div>
                <div className={fillStyles.sectionTitle}>{section.title}</div>
                {section.description && <div className={fillStyles.sectionDesc}>{section.description}</div>}
              </div>
              <div className={fillStyles.sectionMeta}>
                {st && (
                  <Chip
                    variant={st.state === "COMPLETED" ? "success" : st.state === "LOCKED" ? "default" : "warning"}
                    label={t(`logbook.sectionState.${st.state}`)}
                  />
                )}
                {st?.signature && <Chip variant="success" label={t("logbook.fill.signedBy", { name: st.signature.signerName })} />}
                {st?.filledByName && <span className={fillStyles.filledBy}>{t("logbook.fill.filledBy", { name: st.filledByName })}</span>}
              </div>
            </div>
            <div>
              {visible.map((f) => {
                const band = fieldBand(f);
                return (
                  <div key={f.key}>
                    <FieldControl field={f} value={valuesByKey[f.key]} onChange={() => undefined} readOnly />
                    {band && (
                      <span className={styles.bandChip}>
                        <Chip variant={band === "CRIT" ? "error" : "warning"} label={t(`logbook.band.${band}`)} />
                      </span>
                    )}
                  </div>
                );
              })}
              {visible.length === 0 && <div className={fillStyles.filledBy}>—</div>}
            </div>
          </Card>
        );
      })}

      {/* Recorrido del flujo: diagrama de la máquina de estados con el camino del registro */}
      {entry.workflowVersion && (
        <Card className={fillStyles.section}>
          <div className={fillStyles.sectionTitle}>
            <GitBranch size={16} /> {t("logbook.diagram.title")}
          </div>
          <WorkflowDiagram entry={entry} />
        </Card>
      )}

      {/* Firmas (§11.50) + verificación de integridad (§11.70) */}
      <SignaturesPanel entry={entry} />

      {/* Línea de tiempo unificada (audit trail ALCOA+) */}
      <Card className={fillStyles.section}>
        <div className={fillStyles.sectionTitle}>
          <History size={16} /> {t("logbook.viewer.timelineTitle")}
        </div>
        <div>
          {timeline.isLoading && <Spinner />}
          {timelineEvents.map((ev) => (
            <TimelineEvent key={ev.id} event={ev} />
          ))}
          {!timeline.isLoading && timelineEvents.length === 0 && (
            <div className={fillStyles.filledBy}>{t("logbook.viewer.timelineEmpty")}</div>
          )}
        </div>
        {timeline.hasNextPage && (
          <div className={`${styles.loadMore} ${styles.noPrint}`}>
            <Button variant="secondary" loading={timeline.isFetchingNextPage} onClick={() => void timeline.fetchNextPage()}>
              {t("logbook.list.loadMore")}
            </Button>
          </div>
        )}
      </Card>

      {/* Log de cambios por campo (tabla de auditoría fina) */}
      <Card className={fillStyles.section}>
        <div className={fillStyles.sectionTitle}>
          <PenLine size={16} /> {t("logbook.viewer.changesTitle")}
        </div>
        <div>
          {changes.isLoading && <Spinner />}
          {changeItems.map((c) => (
            <div key={c.id} className={`${styles.eventItem} ${styles.eventChange}`}>
              <div className={styles.eventHead}>
                <span className={styles.eventTitle}>{c.fieldLabel ?? c.fieldKey}</span>
                <span className={styles.eventWhen}>
                  {c.changedByName ? `${c.changedByName} · ` : ""}
                  {formatDateTime(c.changedAt)}
                </span>
              </div>
              <div className={styles.eventBody}>
                <span className={styles.diffBefore}>{fmtVal(c.before)}</span>
                <span className={styles.diffArrow}>→</span>
                <span className={styles.diffAfter}>{fmtVal(c.after)}</span>
              </div>
              {c.reason && <div className={styles.eventReason}>“{c.reason}”</div>}
            </div>
          ))}
          {!changes.isLoading && changeItems.length === 0 && (
            <div className={fillStyles.filledBy}>{t("logbook.viewer.changesEmpty")}</div>
          )}
        </div>
        {changes.hasNextPage && (
          <div className={`${styles.loadMore} ${styles.noPrint}`}>
            <Button variant="secondary" loading={changes.isFetchingNextPage} onClick={() => void changes.fetchNextPage()}>
              {t("logbook.list.loadMore")}
            </Button>
          </div>
        )}
      </Card>

      {/* Relaciones: contexto operacional navegable */}
      {related.data && (related.data.samePeriod.length > 0 || related.data.sameShift.length > 0) && (
        <Card className={`${fillStyles.section} ${styles.noPrint}`}>
          <div className={fillStyles.sectionTitle}>
            <Link2 size={16} /> {t("logbook.viewer.relatedTitle")}
          </div>
          <RelatedGroup title={t("logbook.viewer.relatedSamePeriod")} items={related.data.samePeriod} />
          <RelatedGroup title={t("logbook.viewer.relatedSameShift")} items={related.data.sameShift} />
        </Card>
      )}
    </div>
  );
}
