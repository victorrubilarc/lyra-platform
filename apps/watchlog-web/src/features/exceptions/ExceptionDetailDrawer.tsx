import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertOctagon, AlertTriangle, Ban, CheckCircle2, ExternalLink, HelpCircle, PencilLine, ShieldCheck, Wrench } from "lucide-react";
import type { FieldType, LogEntryExceptionDto } from "@lyra/contracts";
import { isExceptionResolved } from "@lyra/contracts";
import { Button, Drawer, Input, Modal, Spinner, Textarea, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { formatDateTime } from "../../lib/format.js";
import { FieldControl, type FieldControlField } from "../templates/FieldControl.js";
import {
  useAcknowledgeException,
  useCorrectException,
  useDismissException,
  useExceptionDetail,
} from "./exceptions-queries.js";
import { ConvertExceptionModal } from "./ConvertExceptionModal.js";
import { STATUS_META, THRESHOLD_META, TRIGGER_META, bandHint, formatExceptionValue } from "./exceptions-presentation.js";
import styles from "./exceptions.module.css";

const THRESHOLD_ICON = { critical: AlertOctagon, warning: AlertTriangle, invalid: HelpCircle } as const;

/** Tipos escalares que admiten corrección directa con FieldControl. */
const CORRECTABLE = new Set<string>(["NUMBER", "TEXT", "TEXTAREA", "TIME", "DURATION", "DATE", "DATETIME", "SELECT", "BOOLEAN", "RATING", "CONFORMITY"]);

interface Props {
  exceptionId: string | null;
  onClose: () => void;
  /** Callback al convertir/asociar (para navegar a la incidencia). */
  onLinked?: (incidentId: string) => void;
}

export function ExceptionDetailDrawer({ exceptionId, onClose, onLinked }: Props) {
  const { can } = usePermissions();
  const { data: exc, isLoading } = useExceptionDetail(exceptionId);
  const [action, setAction] = useState<null | "ack" | "dismiss" | "correct">(null);
  const [convertOpen, setConvertOpen] = useState(false);

  useEffect(() => { setAction(null); setConvertOpen(false); }, [exceptionId]);

  const title = exc ? (
    <div className={styles.drawerHead}>
      <span className={styles.code}>{exc.code}</span>
      <span style={{ color: THRESHOLD_META[exc.thresholdType].color, fontWeight: 700, fontSize: "0.8rem" }}>
        {THRESHOLD_META[exc.thresholdType].label}
      </span>
    </div>
  ) : "Excepción";

  return (
    <Drawer open={!!exceptionId} onClose={onClose} title={title} width={560}>
      {isLoading || !exc ? (
        <div className={styles.center}><Spinner /></div>
      ) : (
        <ExceptionDetailBody
          exc={exc}
          can={can}
          action={action}
          setAction={setAction}
          onOpenConvert={() => setConvertOpen(true)}
        />
      )}

      {exc && (
        <ConvertExceptionModal
          open={convertOpen}
          onClose={() => setConvertOpen(false)}
          exceptionIds={[exc.id]}
          anchorExceptionId={exc.id}
          suggestedTitle={exc.fieldLabel ? `${exc.fieldLabel}: ${formatExceptionValue(exc.originalValue)}${exc.unit ? ` ${exc.unit}` : ""}` : undefined}
          onDone={(incidentId) => { setConvertOpen(false); onLinked?.(incidentId); }}
        />
      )}
    </Drawer>
  );
}

function ExceptionDetailBody({
  exc, can, action, setAction, onOpenConvert,
}: {
  exc: LogEntryExceptionDto;
  can: (p: string) => boolean;
  action: null | "ack" | "dismiss" | "correct";
  setAction: (a: null | "ack" | "dismiss" | "correct") => void;
  onOpenConvert: () => void;
}) {
  const toast = useToast();
  const ack = useAcknowledgeException();
  const dismiss = useDismissException();
  const correct = useCorrectException();

  const Icon = THRESHOLD_ICON[exc.thresholdType];
  const status = STATUS_META[exc.status];
  const resolved = isExceptionResolved(exc.status);
  const hint = bandHint(exc.bandsSnapshot, exc.unit);
  const isCritical = exc.thresholdType === "critical";
  const canDismiss = isCritical ? can("exception:dismiss-critical") : (can("exception:dismiss") || can("exception:dismiss-critical"));
  const canConvert = can("exception:triage") && can("incident:create");
  const correctable = !!exc.fieldType && CORRECTABLE.has(exc.fieldType) && exc.triggerKind !== "MANUAL";

  return (
    <div className={styles.detail}>
      <div className={styles.cardTop}>
        <span className={styles.cardIcon} style={{ color: THRESHOLD_META[exc.thresholdType].color }}><Icon size={18} /></span>
        <h2 className={styles.detailTitle} style={{ margin: 0 }}>{exc.fieldLabel ?? (exc.fieldKey || "Registro manual")}</h2>
      </div>

      {exc.triggerKind === "MANUAL" ? (
        <p className={styles.cardValue}>{exc.detail ?? "—"}</p>
      ) : (
        <div className={styles.bigValue}>
          <span className="num" style={{ color: THRESHOLD_META[exc.thresholdType].color }}>{formatExceptionValue(exc.originalValue)}</span>
          {exc.unit && <span className="unit">{exc.unit}</span>}
        </div>
      )}
      {hint && <div className={styles.cardHint}>Rango esperado: {hint}</div>}
      {exc.detail && exc.triggerKind !== "MANUAL" && <p className={styles.cardHint}>{exc.detail}</p>}

      {/* Estado actual + resolución */}
      <div className={styles.cardMeta}>
        <span className={styles.statusChip} style={{ color: status.color, borderColor: status.color }}>{status.label}</span>
        <span>· {TRIGGER_META[exc.triggerKind].label}</span>
        {exc.triagedByName && <span>· {status.label} por {exc.triagedByName}{exc.triagedAt ? ` · ${formatDateTime(exc.triagedAt)}` : ""}</span>}
      </div>

      {exc.status === "CORRECTED" && (
        <div className={styles.resolvedBox}>
          <div className={styles.sectionTitle}><Wrench size={14} /> Corrección (valor original preservado)</div>
          <div><span className="orig">{formatExceptionValue(exc.originalValue)}{exc.unit ? ` ${exc.unit}` : ""}</span> → <strong>{formatExceptionValue(exc.correctedValue)}{exc.unit ? ` ${exc.unit}` : ""}</strong></div>
          {exc.correctionReason && <div className={styles.muted}>Motivo: {exc.correctionReason}</div>}
          {exc.correctedByName && <div className={styles.muted}>{exc.correctedByName} · {exc.correctedAt ? formatDateTime(exc.correctedAt) : ""}</div>}
        </div>
      )}
      {exc.status === "DISMISSED" && exc.dismissReason && (
        <div className={styles.resolvedBox}>
          <div className={styles.sectionTitle}><Ban size={14} /> Descartada</div>
          <div className={styles.muted}>Motivo: {exc.dismissReason}</div>
        </div>
      )}

      {/* Origen / contexto congelado */}
      <div className={styles.originBox}>
        <div className={styles.originTitle}>Origen del dato</div>
        <dl className={styles.kv}>
          <dt>Bitácora</dt>
          <dd>
            <Link to={`/bitacoras/${exc.logEntryId}`} className={styles.link}>
              {exc.templateName ?? "Entrada"}{exc.logEntryNumber != null ? ` #${exc.logEntryNumber}` : ""} <ExternalLink size={11} />
            </Link>
          </dd>
          {exc.sectionLabel && (<><dt>Sección</dt><dd>{exc.sectionLabel}</dd></>)}
          <dt>Nodo</dt><dd>{exc.orgNodeName ?? "—"}</dd>
          {exc.equipmentTag && (<><dt>Equipo</dt><dd>{exc.equipmentTag}</dd></>)}
          {exc.shiftCode && (<><dt>Turno</dt><dd>{exc.shiftCode}</dd></>)}
          {exc.operatorName && (<><dt>Operador</dt><dd>{exc.operatorName}</dd></>)}
          <dt>Detectada</dt><dd>{formatDateTime(exc.detectedAt)}{exc.entrySealedAt ? " · entrada sellada" : " · provisional"}</dd>
          {exc.incidentCode && (
            <>
              <dt>Incidencia</dt>
              <dd><Link to={`/incidencias?open=${exc.incidentId}`} className={styles.link}>{exc.incidentCode} · {exc.incidentTitle ?? ""}</Link></dd>
            </>
          )}
        </dl>
      </div>

      {/* Acciones (ocultas si la excepción ya está resuelta) */}
      {!resolved && (
        <div className={styles.actions}>
          {can("exception:triage") && exc.status === "OPEN" && (
            <Button variant="secondary" leftIcon={<CheckCircle2 size={15} />} onClick={() => setAction("ack")}>Reconocer / revisar</Button>
          )}
          {correctable && can("exception:correct") && (
            <Button variant="secondary" leftIcon={<PencilLine size={15} />} onClick={() => setAction("correct")}>Corregir dato</Button>
          )}
          {canConvert && (
            <Button variant="primary" leftIcon={<AlertTriangle size={15} />} onClick={onOpenConvert}>Crear / asociar incidencia</Button>
          )}
          {can("exception:dismiss") || can("exception:dismiss-critical") ? (
            <Button variant="secondary" leftIcon={<Ban size={15} />} disabled={!canDismiss} onClick={() => setAction("dismiss")}
              title={!canDismiss ? "Descartar una excepción crítica requiere un permiso superior" : undefined}>
              Descartar
            </Button>
          ) : null}
        </div>
      )}

      {action === "ack" && (
        <NoteModal
          title="Reconocer excepción"
          label="Nota (opcional)"
          confirmLabel="Reconocer"
          loading={ack.isPending}
          minLen={0}
          onClose={() => setAction(null)}
          onConfirm={(note) => ack.mutate({ id: exc.id, dto: { note: note || undefined } }, {
            onSuccess: () => { setAction(null); toast.success("Excepción reconocida"); },
            onError: (e) => toast.error((e as Error).message || "No se pudo reconocer"),
          })}
        />
      )}

      {action === "dismiss" && (
        <NoteModal
          title="Descartar excepción"
          label="Motivo del descarte (mín. 5 caracteres) *"
          confirmLabel="Descartar"
          danger
          warnText={isCritical ? "Estás descartando una excepción CRÍTICA. Queda auditado." : undefined}
          loading={dismiss.isPending}
          minLen={5}
          onClose={() => setAction(null)}
          onConfirm={(reason) => dismiss.mutate({ id: exc.id, dto: { reason } }, {
            onSuccess: () => { setAction(null); toast.success("Excepción descartada"); },
            onError: (e) => toast.error((e as Error).message || "No se pudo descartar"),
          })}
        />
      )}

      {action === "correct" && (
        <CorrectModal
          exc={exc}
          loading={correct.isPending}
          onClose={() => setAction(null)}
          onConfirm={(dto) => correct.mutate({ id: exc.id, dto }, {
            onSuccess: () => { setAction(null); toast.success("Dato corregido (original preservado)"); },
            onError: (e) => toast.error((e as Error).message || "No se pudo corregir"),
          })}
        />
      )}
    </div>
  );
}

function NoteModal({ title, label, confirmLabel, loading, minLen, danger, warnText, onClose, onConfirm }: {
  title: string; label: string; confirmLabel: string; loading: boolean; minLen: number; danger?: boolean; warnText?: string;
  onClose: () => void; onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const ok = text.trim().length >= minLen;
  return (
    <Modal open onClose={onClose} title={title} size="sm" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant={danger ? "danger" : "primary"} loading={loading} disabled={!ok} onClick={() => onConfirm(text.trim())}>{confirmLabel}</Button>
      </>
    }>
      <div className={styles.modalBody}>
        {warnText && <p className={styles.warn}><AlertTriangle size={15} /> {warnText}</p>}
        <label className={styles.field}><span className={styles.fieldLabel}>{label}</span>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus />
        </label>
      </div>
    </Modal>
  );
}

function CorrectModal({ exc, loading, onClose, onConfirm }: {
  exc: LogEntryExceptionDto;
  loading: boolean;
  onClose: () => void;
  onConfirm: (dto: { correctedValue: unknown; reason: string; password?: string; mfaCode?: string }) => void;
}) {
  const [value, setValue] = useState<unknown>(exc.originalValue ?? "");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const sealed = !!exc.entrySealedAt;
  const field: FieldControlField = {
    key: exc.fieldKey || "value",
    type: (exc.fieldType as FieldType) ?? "NUMBER",
    label: exc.fieldLabel ?? "Nuevo valor",
    config: exc.unit ? { unit: exc.unit } : {},
  };
  const ok = reason.trim().length >= 5 && (!sealed || password.length > 0);
  return (
    <Modal open onClose={onClose} title="Corregir dato" size="md" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="primary" loading={loading} disabled={!ok} onClick={() => onConfirm({
          correctedValue: value,
          reason: reason.trim(),
          password: sealed ? password : undefined,
        })}>Guardar corrección</Button>
      </>
    }>
      <div className={styles.modalBody}>
        <p className={styles.muted}>El valor original (<strong>{formatExceptionValue(exc.originalValue)}{exc.unit ? ` ${exc.unit}` : ""}</strong>) se conserva. La corrección queda auditada (GxP).</p>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Nuevo valor</span>
          <FieldControl field={field} value={value} onChange={setValue} />
        </div>
        <label className={styles.field}><span className={styles.fieldLabel}>Motivo de la corrección (mín. 5) *</span>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </label>
        {sealed && (
          <div className={styles.signBox}>
            <div className={styles.signTitle}><ShieldCheck size={14} /> Entrada sellada: confirma con tu contraseña (Part 11)</div>
            <label className={styles.field}><span className={styles.fieldLabel}>Contraseña</span>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </label>
          </div>
        )}
      </div>
    </Modal>
  );
}
