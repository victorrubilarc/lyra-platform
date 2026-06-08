import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, KeyRound, RefreshCw, TriangleAlert } from "lucide-react";
import { Button, FormField, Input, Modal } from "@lyra/ui";
import { generateTempPassword } from "./password-gen.js";
import shared from "./security-shared.module.css";

interface ResetPasswordModalProps {
  open: boolean;
  userName: string;
  loading: boolean;
  /** Devuelve la contraseña temporal a aplicar. */
  onConfirm: (password: string) => void;
  onClose: () => void;
}

/**
 * Reset de contraseña por un administrador (contraseña temporal, estilo AD).
 * El admin fija/genera una temporal; el backend fuerza el cambio en el próximo
 * ingreso y revoca las sesiones del usuario. No toca el MFA.
 */
export function ResetPasswordModal({ open, userName, loading, onConfirm, onClose }: ResetPasswordModalProps) {
  const { t } = useTranslation();
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setPassword("");
      setShow(false);
    }
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <KeyRound size={18} />
          {t("security.users.password.resetTitle")}
        </span>
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => onConfirm(password)} loading={loading} disabled={!password.trim()}>
            {t("security.users.password.reset")}
          </Button>
        </div>
      }
    >
      <p style={{ margin: "0 0 12px", color: "var(--color-text-secondary)" }}>
        {t("security.users.password.resetConfirm", { name: userName })}
      </p>

      <FormField label={t("security.users.password.tempPassword")} hint={t("security.users.password.tempHint")} required>
        {(field) => (
          <Input
            {...field}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={show ? "text" : "password"}
            mono
            autoFocus
            rightSlot={
              <span style={{ display: "flex", gap: 2 }}>
                <button
                  type="button"
                  className={shared.iconGhost}
                  onClick={() => setShow((s) => !s)}
                  aria-label={show ? t("security.users.hidePassword") : t("security.users.showPassword")}
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  className={shared.iconGhost}
                  onClick={() => {
                    setPassword(generateTempPassword());
                    setShow(true);
                  }}
                  aria-label={t("security.users.generate")}
                >
                  <RefreshCw size={16} />
                </button>
              </span>
            }
          />
        )}
      </FormField>

      <div className={shared.errorBox} style={{ marginTop: 12, background: "var(--color-warning-bg)", color: "var(--color-warning)", borderColor: "rgba(245,158,11,0.22)" }}>
        <TriangleAlert size={16} />
        {t("security.users.password.resetWarning")}
      </div>
    </Modal>
  );
}
