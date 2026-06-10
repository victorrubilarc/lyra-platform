import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, PenLine } from "lucide-react";
import { Button, FormField, Input, Modal } from "@lyra/ui";
import { useAuth } from "../../auth/use-auth.js";
import styles from "./LogEntries.module.css";

interface SectionSignModalProps {
  sectionTitle: string;
  loading: boolean;
  onConfirm: (password: string) => void;
  onClose: () => void;
}

/**
 * Firma de completitud de sección (21 CFR Part 11): re-autentica con contraseña
 * antes de marcar la sección como completada y firmada. Las secciones no exigen
 * MFA step-up (eso es a nivel de transición). El backend re-verifica la contraseña.
 */
export function SectionSignModal({ sectionTitle, loading, onConfirm, onClose }: SectionSignModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [password, setPassword] = useState("");
  const signerName = user?.displayName ?? user?.email ?? "—";
  const canConfirm = password.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={
        <span className={styles.modalTitle}>
          <PenLine size={17} /> {t("logbook.fill.signSectionTitle")}
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => canConfirm && onConfirm(password)} loading={loading} disabled={!canConfirm}>
            {t("logbook.fill.completeAndSign")}
          </Button>
        </>
      }
    >
      <div className={styles.signatureNotice}>
        <div className={styles.signatureMeaning}>
          <PenLine size={14} /> {t("logbook.fill.signSectionMeaning", { section: sectionTitle })}
        </div>
        <div className={styles.signatureSigner}>{t("logbook.transition.signingAs", { name: signerName })}</div>
      </div>

      <FormField label={t("logbook.transition.password")}>
        {(field) => (
          <Input
            {...field}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            rightSlot={<KeyRound size={15} />}
            onKeyDown={(e) => e.key === "Enter" && canConfirm && onConfirm(password)}
          />
        )}
      </FormField>
    </Modal>
  );
}
