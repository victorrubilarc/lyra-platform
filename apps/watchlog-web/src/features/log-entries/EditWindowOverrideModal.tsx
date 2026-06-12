import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, ShieldAlert, TimerOff } from "lucide-react";
import { Button, FormField, Input, Modal, Textarea } from "@lyra/ui";
import styles from "./LogEntries.module.css";

/** Campos del override que se adjuntan a la escritura fuera de ventana (2.7.2). */
export interface EditWindowOverrideFields {
  overrideReason: string;
  password?: string;
  mfaCode?: string;
}

interface EditWindowOverrideModalProps {
  /** Pedir contraseña (firma de sección y/o re-auth de MFA del override). */
  requirePassword: boolean;
  /** Pedir segundo factor (ajuste del sistema: MFA para editar fuera de ventana). */
  requireMfa: boolean;
  loading: boolean;
  onConfirm: (fields: EditWindowOverrideFields) => void;
  onClose: () => void;
}

/**
 * Edición FUERA de la ventana (Fase 2.7.2, patrón GxP de corrección excepcional):
 * el motivo es OBLIGATORIO y queda auditado (AuditLog + historial por campo); si
 * el ajuste del sistema lo exige, re-autentica con contraseña + MFA (step-up).
 * El backend re-valida todo; este modal solo recolecta.
 */
export function EditWindowOverrideModal({
  requirePassword,
  requireMfa,
  loading,
  onConfirm,
  onClose,
}: EditWindowOverrideModalProps) {
  const { t } = useTranslation();
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");

  const needPassword = requirePassword || requireMfa;
  const canConfirm =
    reason.trim().length >= 5 && (!needPassword || password.trim().length > 0) && (!requireMfa || mfaCode.trim().length > 0);

  const confirm = () =>
    canConfirm &&
    onConfirm({
      overrideReason: reason.trim(),
      password: needPassword ? password : undefined,
      mfaCode: requireMfa ? mfaCode.trim() : undefined,
    });

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className={styles.modalTitle}>
          <TimerOff size={17} /> {t("logbook.override.title")}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={confirm} loading={loading} disabled={!canConfirm}>
            {t("logbook.override.confirm")}
          </Button>
        </>
      }
    >
      <div className={styles.signatureNotice}>
        <div className={styles.signatureMeaning}>
          <ShieldAlert size={14} /> {t("logbook.override.notice")}
        </div>
      </div>

      <FormField label={t("logbook.override.reason")} hint={t("logbook.override.reasonHint")}>
        {(field) => (
          <Textarea
            {...field}
            rows={3}
            value={reason}
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("logbook.override.reasonPlaceholder")}
          />
        )}
      </FormField>

      {needPassword && (
        <FormField label={t("logbook.transition.password")}>
          {(field) => (
            <Input
              {...field}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
              rightSlot={<KeyRound size={15} />}
            />
          )}
        </FormField>
      )}

      {requireMfa && (
        <FormField label={t("logbook.transition.mfaCode")}>
          {(field) => (
            <Input
              {...field}
              value={mfaCode}
              inputMode="numeric"
              autoComplete="one-time-code"
              onChange={(e) => setMfaCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && confirm()}
            />
          )}
        </FormField>
      )}
    </Modal>
  );
}
