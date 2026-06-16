import { AlertOctagon, AlertTriangle, HelpCircle, Link2 } from "lucide-react";
import type { LogEntryExceptionDto } from "@lyra/contracts";
import { Checkbox } from "@lyra/ui";
import { formatDateTime } from "../../lib/format.js";
import { STATUS_META, THRESHOLD_META, bandHint, formatExceptionValue } from "./exceptions-presentation.js";
import styles from "./exceptions.module.css";

const THRESHOLD_ICON = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  invalid: HelpCircle,
} as const;

interface Props {
  exc: LogEntryExceptionDto;
  onOpen: (id: string) => void;
  /** Si se provee, la tarjeta muestra checkbox de selección múltiple. */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
  /** Muestra el contexto operacional (nodo/equipo/operador) — útil en la bandeja global. */
  showContext?: boolean;
}

/** Tarjeta de una excepción, compartida por el panel inline y la bandeja global. */
export function ExceptionCard({ exc, onOpen, selectable, selected, onToggle, showContext }: Props) {
  const meta = THRESHOLD_META[exc.thresholdType];
  const status = STATUS_META[exc.status];
  const Icon = THRESHOLD_ICON[exc.thresholdType];
  const hint = bandHint(exc.bandsSnapshot, exc.unit);

  return (
    <div className={styles.card} style={{ ["--sev" as string]: meta.color }}>
      {selectable && (
        <div className={styles.cardCheck}>
          <Checkbox
            checked={!!selected}
            onChange={() => onToggle?.(exc.id)}
            aria-label={`Seleccionar excepción ${exc.code}`}
          />
        </div>
      )}
      <div
        className={styles.cardMain}
        role="button"
        tabIndex={0}
        onClick={() => onOpen(exc.id)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(exc.id); } }}
      >
        <div className={styles.cardTop}>
          <span className={styles.cardIcon} style={{ color: meta.color }}><Icon size={16} /></span>
          <span className={styles.cardField}>
            {exc.fieldLabel ?? (exc.fieldKey || "Registro manual")}
            {exc.sectionLabel ? <span className={styles.muted}> · {exc.sectionLabel}</span> : null}
          </span>
          <span className={styles.cardCode}>{exc.code}</span>
          <span className={styles.statusChip} style={{ color: status.color, borderColor: status.color }}>{status.label}</span>
          {exc.incidentCode && (
            <span className={styles.linkTag} title={exc.incidentTitle ?? undefined}><Link2 size={11} /> {exc.incidentCode}</span>
          )}
        </div>
        {exc.triggerKind === "MANUAL" ? (
          <div className={styles.cardValue}>{exc.detail ?? "—"}</div>
        ) : (
          <div className={styles.cardValue}>
            Valor: <strong>{formatExceptionValue(exc.correctedValue ?? exc.originalValue)}{exc.unit ? ` ${exc.unit}` : ""}</strong>
            {exc.correctedValue != null && <span className={styles.muted}> (corregido)</span>}
          </div>
        )}
        {hint && <div className={styles.cardHint}>Rango: {hint}</div>}
        <div className={styles.cardMeta}>
          <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
          {showContext && exc.orgNodeName && <span>· {exc.orgNodeName}</span>}
          {showContext && exc.equipmentTag && <span>· {exc.equipmentTag}</span>}
          {exc.operatorName && <span>· {exc.operatorName}</span>}
          <span>· {formatDateTime(exc.detectedAt)}</span>
        </div>
      </div>
    </div>
  );
}
