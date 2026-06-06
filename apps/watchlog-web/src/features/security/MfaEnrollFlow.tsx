import { useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { Button, FormField, Input, useToast } from "@lyra/ui";
import { ApiError, refreshAccessToken } from "../../lib/api-client.js";
import { setupMfa, verifyMfa } from "../../auth/auth-api.js";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel.js";
import styles from "./security.module.css";

interface MfaEnrollFlowProps {
  /** Etiqueta del botón inicial (difiere entre perfil y gate forzado). */
  startLabel?: string;
  /** Tras guardar los códigos: refresca sesión/token y (en el gate) navega. */
  onFinish: () => void | Promise<void>;
}

type Step = "intro" | "scan" | "done";

/**
 * Enrolamiento MFA self-service en 3 pasos: setup (QR + secreto) → verificar un
 * código del autenticador → mostrar los códigos de recuperación una sola vez.
 * El secreto TOTP solo lo conoce el dispositivo del usuario; el backend ya lo
 * entrega cifrado y como `otpauth://` para el QR.
 */
export function MfaEnrollFlow({
  startLabel = "Activar verificación en dos pasos",
  onFinish,
}: MfaEnrollFlowProps) {
  const toast = useToast();
  const [step, setStep] = useState<Step>("intro");
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [totp, setTotp] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  async function begin(): Promise<void> {
    setError(null);
    setBusy(true);
    try {
      const res = await setupMfa();
      setSetup(res);
      setStep("scan");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar el enrolamiento");
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await verifyMfa(totp.trim());
      // Limpia el claim `mfaPending` del access token de inmediato (si lo había),
      // para no quedar bloqueado por el gate al terminar.
      await refreshAccessToken();
      setCodes(res.recoveryCodes);
      setStep("done");
      toast.success("Verificación en dos pasos activada");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Código inválido");
    } finally {
      setBusy(false);
    }
  }

  async function finish(): Promise<void> {
    setFinishing(true);
    try {
      await onFinish();
    } finally {
      setFinishing(false);
    }
  }

  if (step === "intro") {
    return (
      <div className={styles.card}>
        {error && (
          <div className={styles.formError} role="alert">
            <AlertTriangle size={16} aria-hidden="true" /> {error}
          </div>
        )}
        <div>
          <Button
            variant="primary"
            loading={busy}
            leftIcon={<ShieldCheck size={18} />}
            onClick={() => void begin()}
          >
            {startLabel}
          </Button>
        </div>
      </div>
    );
  }

  if (step === "scan" && setup) {
    return (
      <form className={styles.card} onSubmit={(e) => void verify(e)} noValidate>
        {error && (
          <div className={styles.formError} role="alert">
            <AlertTriangle size={16} aria-hidden="true" /> {error}
          </div>
        )}
        <div className={styles.enrollGrid}>
          <div className={styles.qrPlate}>
            <QRCodeSVG value={setup.otpauthUrl} size={168} />
          </div>
          <div className={styles.enrollSteps}>
            <p className={styles.stepText}>
              <strong>1.</strong> Escanea el código con tu app de autenticación (Google
              Authenticator, Authy, 1Password…).
            </p>
            <div>
              <div className={styles.secretLabel}>¿No puedes escanear? Ingresa esta clave:</div>
              <div className={styles.secret}>{setup.secret}</div>
            </div>
            <p className={styles.stepText}>
              <strong>2.</strong> Escribe el código de 6 dígitos que muestra la app:
            </p>
            <FormField label="Código de verificación" required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid || Boolean(error)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  mono
                  placeholder="123456"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value)}
                />
              )}
            </FormField>
            <Button
              type="submit"
              variant="primary"
              loading={busy}
              leftIcon={<ShieldCheck size={18} />}
            >
              Verificar y activar
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.cardTitleWrap}>
        <span className={styles.cardIcon}>
          <ShieldCheck size={20} aria-hidden="true" />
        </span>
        <div>
          <h3 className={styles.cardTitle}>Verificación en dos pasos activada</h3>
          <p className={styles.cardDesc}>Guarda tus códigos de recuperación antes de continuar.</p>
        </div>
      </div>
      <RecoveryCodesPanel codes={codes} />
      <div>
        <Button variant="primary" loading={finishing} onClick={() => void finish()}>
          Ya los guardé, finalizar
        </Button>
      </div>
    </div>
  );
}
