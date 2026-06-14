import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban } from "lucide-react";
import { Button, FormField, Modal, Textarea } from "@lyra/ui";
import styles from "./LogEntries.module.css";

interface VoidEntryModalProps {
  loading: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/**
 * Anular (descartar) un BORRADOR (2.8.2). El motivo es obligatorio (≥5): el
 * borrador no es un registro firmado Part 11, pero ALCOA+ exige registrar por qué
 * se descartó. El backend decide/autoriza (ownership o `logentry:void`) y audita;
 * la entrada pasa a VOID (sale de las superficies normales, queda trazable).
 */
export function VoidEntryModal({ loading, onConfirm, onClose }: VoidEntryModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const canConfirm = reason.trim().length >= 5;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className={styles.modalTitle}>
          <Ban size={17} /> {t("logbook.void.modalTitle")}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="danger"
            loading={loading}
            disabled={!canConfirm}
            onClick={() => canConfirm && onConfirm(reason.trim())}
          >
            <Ban size={14} /> {t("logbook.void.confirm")}
          </Button>
        </>
      }
    >
      <p className={styles.deferralExplain}>{t("logbook.void.explain")}</p>

      <FormField label={t("logbook.void.reason")} hint={t("logbook.void.reasonHint")}>
        {(field) => (
          <Textarea
            {...field}
            value={reason}
            rows={3}
            placeholder={t("logbook.void.reasonPlaceholder")}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </FormField>
    </Modal>
  );
}
