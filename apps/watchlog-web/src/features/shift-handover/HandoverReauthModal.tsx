import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, PenLine } from "lucide-react";
import { Button, FormField, Input, Modal } from "@lyra/ui";
import { useAuth } from "../../auth/use-auth.js";
import styles from "./shift-handover.module.css";

interface Props {
  title: string;
  /** Significado de la firma (Part 11 §11.50). */
  meaning: string;
  confirmLabel: string;
  loading: boolean;
  onConfirm: (creds: { password: string; mfaCode?: string }) => void;
  onClose: () => void;
}

/**
 * Re-autenticación Part 11 para firmar (saliente) o reconocer (entrante) una
 * entrega de turno. Captura contraseña (+ MFA si la cuenta lo trae); el backend
 * re-verifica. Muestra el SIGNIFICADO de la firma y quién firma.
 */
export function HandoverReauthModal({ title, meaning, confirmLabel, loading, onConfirm, onClose }: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const signerName = user?.displayName ?? user?.email ?? "—";
  const canConfirm = password.trim().length > 0;

  function confirm() {
    if (!canConfirm) return;
    onConfirm({ password, mfaCode: mfaCode.trim() || undefined });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className={styles.modalTitle}>
          <PenLine size={17} /> {title}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={confirm} loading={loading} disabled={!canConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className={styles.signatureNotice}>
        <div className={styles.signatureMeaning}>
          <PenLine size={14} /> {meaning}
        </div>
        <div className={styles.signatureSigner}>{t("handover.signingAs", { name: signerName })}</div>
      </div>

      <FormField label={t("handover.password")}>
        {(field) => (
          <Input
            {...field}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            rightSlot={<KeyRound size={15} />}
            onKeyDown={(e) => e.key === "Enter" && canConfirm && confirm()}
          />
        )}
      </FormField>

      <FormField label={t("handover.mfaCode")} hint={t("handover.mfaHint")}>
        {(field) => (
          <Input
            {...field}
            mono
            inputMode="numeric"
            value={mfaCode}
            autoComplete="one-time-code"
            onChange={(e) => setMfaCode(e.target.value)}
            placeholder="123456"
            onKeyDown={(e) => e.key === "Enter" && canConfirm && confirm()}
          />
        )}
      </FormField>
    </Modal>
  );
}
