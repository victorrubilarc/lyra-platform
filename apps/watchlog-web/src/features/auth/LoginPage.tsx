import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { Button, FormField, Input, useToast } from "@lyra/ui";
import { emailSchema, totpCodeSchema } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { completeMfaChallenge, login } from "../../auth/auth-api.js";
import { useAuthStore } from "../../auth/auth-store.js";
import { fetchSetupStatus } from "../setup/setup-api.js";
import { AuthLayout } from "./AuthLayout.js";
import styles from "./AuthLayout.module.css";

/** Clave para recordar el correo (NO la contraseña) entre sesiones. */
const REMEMBER_EMAIL_KEY = "wl_remember_email";

function rememberedEmail(): string {
  try {
    return localStorage.getItem(REMEMBER_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Esquema del paso 1 (sin TOTP: el segundo factor va en su propio paso). */
const credentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "La contraseña es obligatoria"),
});
type CredentialsForm = z.infer<typeof credentialsSchema>;

const mfaSchema = z.object({ totp: totpCodeSchema });
type MfaForm = z.infer<typeof mfaSchema>;

export function LoginPage() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const setSession = useAuthStore((s) => s.setSession);
  const toast = useToast();
  const location = useLocation();
  const navigate = useNavigate();
  /** Aviso persistente tras una redirección (ej. contraseña restablecida). */
  const notice = (location.state as { notice?: string } | null)?.notice ?? null;

  // Instalación VIRGEN (0 usuarios): el primer arranque no es un login, es el
  // asistente de configuración (OOBE). El endpoint es público y devuelve solo
  // un booleano; si falla (API caída) se queda en el login normal.
  useEffect(() => {
    let cancelled = false;
    fetchSetupStatus()
      .then((s) => {
        if (!cancelled && s.setupRequired) navigate("/setup", { replace: true });
      })
      .catch(() => {
        /* sin señal de setup: el login sigue siendo el camino */
      });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(() => rememberedEmail() !== "");
  /** mfaToken presente ⇒ estamos en el segundo paso (TOTP). */
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  /** En el paso MFA, alterna entre código de la app y código de recuperación. */
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);

  const credForm = useForm<CredentialsForm>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: rememberedEmail(), password: "" },
  });
  const mfaForm = useForm<MfaForm>({
    resolver: zodResolver(mfaSchema),
    defaultValues: { totp: "" },
  });

  // Ya hay sesión: redirige (cambio forzado tiene prioridad).
  if (status === "authenticated" && session) {
    if (session.user.forcePasswordChange) return <Navigate to="/cambiar-contrasena" replace />;
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from && from !== "/login" ? from : "/"} replace />;
  }

  /** Persiste o borra el correo recordado según la preferencia. */
  const persistEmail = (email: string) => {
    try {
      if (remember) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
      else localStorage.removeItem(REMEMBER_EMAIL_KEY);
    } catch {
      /* almacenamiento no disponible: se ignora */
    }
  };

  const onCredentials = credForm.handleSubmit(async (values) => {
    setServerError(null);
    persistEmail(values.email);
    try {
      const res = await login(values);
      if (res.result === "mfa_required") {
        setMfaToken(res.mfaToken);
        toast.toast("Ingresa el código de tu app de autenticación", { variant: "info" });
        return;
      }
      setSession(res.session);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión");
    }
  });

  const onMfa = mfaForm.handleSubmit(async (values) => {
    if (!mfaToken) return;
    setServerError(null);
    try {
      const res = await completeMfaChallenge({ mfaToken, totp: values.totp.trim() });
      if (res.result === "authenticated") setSession(res.session);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "Código inválido");
      mfaForm.reset({ totp: "" });
    }
  });

  if (mfaToken) {
    return (
      <AuthLayout
        title="Verificación en dos pasos"
        subtitle={
          useRecoveryCode
            ? "Introduce uno de los códigos de recuperación que guardaste al activar el segundo factor."
            : "Introduce el código de 6 dígitos de tu aplicación de autenticación."
        }
        footer={
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setMfaToken(null);
              setServerError(null);
              setUseRecoveryCode(false);
              mfaForm.reset({ totp: "" });
            }}
          >
            Volver al inicio de sesión
          </button>
        }
      >
        <form className={styles.form} onSubmit={onMfa} noValidate>
          {serverError && (
            <div className={styles.formError} role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              {serverError}
            </div>
          )}
          <FormField
            label={useRecoveryCode ? "Código de recuperación" : "Código de verificación"}
            required
            error={mfaForm.formState.errors.totp?.message}
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                mono
                inputMode={useRecoveryCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                autoFocus
                placeholder={useRecoveryCode ? "XXXXX-XXXXX" : "123456"}
                {...mfaForm.register("totp")}
              />
            )}
          </FormField>
          <Button
            type="submit"
            variant="primary"
            block
            loading={mfaForm.formState.isSubmitting}
            leftIcon={<ShieldCheck size={18} />}
          >
            Verificar
          </Button>
          <div className={styles.mfaSwitch}>
            <button
              type="button"
              className={styles.link}
              onClick={() => {
                setUseRecoveryCode((v) => !v);
                setServerError(null);
                mfaForm.reset({ totp: "" });
              }}
            >
              {useRecoveryCode
                ? "Usar el código de la aplicación"
                : "¿Perdiste tu dispositivo? Usa un código de recuperación"}
            </button>
          </div>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Iniciar sesión"
      subtitle="Ingresa con tu cuenta corporativa para acceder a las bitácoras de tu operación."
    >
      <form className={styles.form} onSubmit={onCredentials} noValidate>
        {notice && !serverError && (
          <div className={styles.formNotice} role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            {notice}
          </div>
        )}
        {serverError && (
          <div className={styles.formError} role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            {serverError}
          </div>
        )}
        <FormField label="Correo electrónico" required error={credForm.formState.errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="tu@empresa.cl"
              {...credForm.register("email")}
            />
          )}
        </FormField>
        <FormField label="Contraseña" required error={credForm.formState.errors.password?.message}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              placeholder="••••••••"
              rightSlot={
                <button
                  type="button"
                  className={styles.reveal}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              }
              {...credForm.register("password")}
            />
          )}
        </FormField>

        <div className={styles.optionsRow}>
          <label className={styles.checkbox}>
            <input
              type="checkbox"
              className={styles.checkboxInput}
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Recordar mi correo
          </label>
          <Link className={styles.link} to="/recuperar-contrasena">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <Button
          type="submit"
          variant="primary"
          block
          loading={credForm.formState.isSubmitting}
          leftIcon={<LogIn size={18} />}
        >
          Entrar
        </Button>
      </form>
    </AuthLayout>
  );
}
