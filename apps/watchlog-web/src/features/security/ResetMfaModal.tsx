import { useTranslation } from "react-i18next";
import { ShieldAlert } from "lucide-react";
import { Button, Modal } from "@lyra/ui";
import shared from "./security-shared.module.css";

interface ResetMfaModalProps {
  open: boolean;
  userName: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * Confirma el reset de MFA de un usuario (dispositivo perdido). Es una acción
 * sensible: borra el segundo factor y revoca todas las sesiones del objetivo.
 * El admin NUNCA enrola por el usuario — este solo lo deja listo para re-enrolar.
 */
export function ResetMfaModal({ open, userName, loading, onConfirm, onClose }: ResetMfaModalProps) {
  const { t } = useTranslation();
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ShieldAlert size={18} />
          {t("security.users.mfa.resetTitle")}
        </span>
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {t("security.users.mfa.reset")}
          </Button>
        </div>
      }
    >
      <p style={{ margin: 0, color: "var(--color-text-secondary)" }}>
        {t("security.users.mfa.resetConfirm", { name: userName })}
      </p>
      <div className={shared.errorBox} style={{ marginTop: 12 }}>
        <ShieldAlert size={16} />
        {t("security.users.mfa.resetWarning")}
      </div>
    </Modal>
  );
}
