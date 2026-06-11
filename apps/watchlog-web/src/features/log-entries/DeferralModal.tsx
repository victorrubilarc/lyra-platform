import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, History, Trash2 } from "lucide-react";
import { Button, FormField, Input, Modal, Textarea } from "@lyra/ui";
import type { DeferralInput } from "@lyra/contracts";
import { isoToLocalInput, localInputToIso } from "./datetime-local.js";
import styles from "./LogEntries.module.css";

interface DeferralModalProps {
  /** Declaración vigente (para corregirla); null = declarar por primera vez. */
  initial: { effectiveAt: string; reason: string } | null;
  loading: boolean;
  onConfirm: (deferred: DeferralInput) => void;
  /** Quitar la marca (vuelve a registro en línea). Solo al editar. */
  onRemove?: () => void;
  onClose: () => void;
}

/**
 * Gesto de registro DIFERIDO (2.7.0): declara la fecha/hora REAL del evento y el
 * motivo (obligatorio — práctica GxP de late entry). El backend decide y audita;
 * la entrada queda MARCADA como diferida en grilla, visor y timeline.
 */
export function DeferralModal({ initial, loading, onConfirm, onRemove, onClose }: DeferralModalProps) {
  const { t } = useTranslation();
  const [eventAt, setEventAt] = useState(initial ? isoToLocalInput(initial.effectiveAt) : "");
  const [reason, setReason] = useState(initial?.reason ?? "");
  const canConfirm = eventAt.trim() !== "" && reason.trim().length >= 5;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className={styles.modalTitle}>
          <History size={17} /> {t("logbook.deferral.modalTitle")}
        </span>
      }
      footer={
        <>
          {initial && onRemove && (
            <Button variant="danger" onClick={onRemove} disabled={loading}>
              <Trash2 size={14} /> {t("logbook.deferral.remove")}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            loading={loading}
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm({ effectiveAt: localInputToIso(eventAt), reason: reason.trim() })}
          >
            {initial ? t("logbook.deferral.update") : t("logbook.deferral.confirm")}
          </Button>
        </>
      }
    >
      <p className={styles.deferralExplain}>{t("logbook.deferral.explain")}</p>

      <FormField label={t("logbook.deferral.effectiveAt")}>
        {(field) => (
          <Input
            {...field}
            type="datetime-local"
            value={eventAt}
            onChange={(e) => setEventAt(e.target.value)}
            rightSlot={<CalendarClock size={15} />}
          />
        )}
      </FormField>

      <FormField label={t("logbook.deferral.reason")} hint={t("logbook.deferral.reasonHint")}>
        {(field) => (
          <Textarea
            {...field}
            value={reason}
            rows={3}
            placeholder={t("logbook.deferral.reasonPlaceholder")}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </FormField>
    </Modal>
  );
}
