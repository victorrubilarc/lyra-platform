import { useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card, FormField, Input, cx, useToast } from "@lyra/ui";
import { ApiError } from "../../lib/api-client.js";
import { disableMfa, regenerateRecoveryCodes } from "../../auth/auth-api.js";
import { useAuth } from "../../auth/use-auth.js";
import { MfaEnrollFlow } from "./MfaEnrollFlow.js";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel.js";
import styles from "./security.module.css";

type ManageMode = "idle" | "regenerate" | "disable";

/**
 * Seguridad de la cuenta del propio usuario. Hoy: gestión self-service de MFA
 * (activar con QR → verificar → códigos; o, si ya está activo, regenerar códigos
 * y desactivar). El admin NUNCA enrola por el usuario; solo puede resetear.
 */
export function ProfileSecurityPage() {
  const { user, refreshSession } = useAuth();
  const toast = useToast();
  const [mode, setMode] = useState<ManageMode>("idle");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  if (!user) return null;
  const enabled = user.mfaEnabled;
  const required = user.mfaRequired;

  function resetManage(): void {
    setMode("idle");
    setPassword("");
    setError(null);
    setNewCodes(null);
  }

  async function submitManage(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "regenerate") {
        const res = await regenerateRecoveryCodes(password);
        setNewCodes(res.recoveryCodes);
        setPassword("");
        toast.success("Códigos de recuperación regenerados");
      } else if (mode === "disable") {
        await disableMfa(password);
        await refreshSession();
        toast.success("Verificación en dos pasos desactivada");
        resetManage();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo completar la acción");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Link
          to="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            color: "var(--color-text-secondary)",
            fontSize: "var(--text-body-sm-size)",
            marginBottom: 4,
          }}
        >
          <ArrowLeft size={16} aria-hidden="true" /> Volver al inicio
        </Link>
        <h1 className={styles.title}>Seguridad de mi cuenta</h1>
        <p className={styles.subtitle}>Gestiona tu verificación en dos pasos (MFA).</p>
      </div>

      <Card>
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitleWrap}>
              <span className={styles.cardIcon}>
                <ShieldCheck size={20} aria-hidden="true" />
              </span>
              <div>
                <h2 className={styles.cardTitle}>Verificación en dos pasos (MFA)</h2>
                <p className={styles.cardDesc}>
                  Un código temporal de tu teléfono además de la contraseña.
                </p>
              </div>
            </div>
            <span
              className={cx(
                styles.badge,
                enabled ? styles.badgeOn : required ? styles.badgeRequired : styles.badgeOff,
              )}
            >
              {enabled ? "Activado" : required ? "Requerido" : "Desactivado"}
            </span>
          </div>

          {/* --- No activado: enrolar --- */}
          {!enabled && (
            <>
              {required && (
                <div className={cx(styles.notice, styles.noticeWarn)}>
                  <AlertTriangle size={18} className={styles.noticeIcon} aria-hidden="true" />
                  <span>
                    Tu rol <strong>exige</strong> verificación en dos pasos. Actívala para proteger
                    tu cuenta.
                  </span>
                </div>
              )}
              <MfaEnrollFlow
                onFinish={async () => {
                  await refreshSession();
                }}
              />
            </>
          )}

          {/* --- Activado: gestionar --- */}
          {enabled && newCodes && (
            <>
              <RecoveryCodesPanel codes={newCodes} />
              <div>
                <Button variant="primary" onClick={resetManage}>
                  Listo
                </Button>
              </div>
            </>
          )}

          {enabled && !newCodes && (
            <>
              {mode === "idle" && (
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    leftIcon={<RefreshCw size={16} />}
                    onClick={() => setMode("regenerate")}
                  >
                    Regenerar códigos de recuperación
                  </Button>
                  {!required && (
                    <Button
                      variant="danger"
                      leftIcon={<Trash2 size={16} />}
                      onClick={() => setMode("disable")}
                    >
                      Desactivar MFA
                    </Button>
                  )}
                </div>
              )}

              {required && mode === "idle" && (
                <div className={cx(styles.notice, styles.noticeInfo)}>
                  <ShieldCheck size={18} className={styles.noticeIcon} aria-hidden="true" />
                  <span>
                    Tu rol exige MFA, por eso no puede desactivarse. Si perdiste el dispositivo, pide
                    a un administrador que lo <strong>restablezca</strong>.
                  </span>
                </div>
              )}

              {mode !== "idle" && (
                <form className={styles.inlineForm} onSubmit={(e) => void submitManage(e)} noValidate>
                  <hr className={styles.divider} />
                  <p className={styles.stepText}>
                    {mode === "regenerate"
                      ? "Confirma tu contraseña para generar códigos nuevos (los anteriores dejarán de servir)."
                      : "Confirma tu contraseña para desactivar la verificación en dos pasos."}
                  </p>
                  {error && (
                    <div className={styles.formError} role="alert">
                      <AlertTriangle size={16} aria-hidden="true" /> {error}
                    </div>
                  )}
                  <FormField label="Contraseña" required>
                    {({ id, describedBy, invalid }) => (
                      <Input
                        id={id}
                        aria-describedby={describedBy}
                        invalid={invalid || Boolean(error)}
                        type="password"
                        autoComplete="current-password"
                        autoFocus
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    )}
                  </FormField>
                  <div className={styles.actions}>
                    <Button
                      type="submit"
                      variant={mode === "disable" ? "danger" : "primary"}
                      loading={busy}
                      leftIcon={mode === "disable" ? <Trash2 size={16} /> : <KeyRound size={16} />}
                    >
                      {mode === "disable" ? "Desactivar" : "Regenerar"}
                    </Button>
                    <Button type="button" variant="secondary" onClick={resetManage} disabled={busy}>
                      Cancelar
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
