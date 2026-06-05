import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate, useLocation } from "react-router-dom";
import { AlertTriangle, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import { Button, FormField, Input, useToast } from "@lyra/ui";
import { emailSchema, totpCodeSchema } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { completeMfaChallenge, login } from "../../auth/auth-api.js";
import { useAuthStore } from "../../auth/auth-store.js";
import { AuthLayout } from "./AuthLayout.js";
import styles from "./AuthLayout.module.css";

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

  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  /** mfaToken presente ⇒ estamos en el segundo paso (TOTP). */
  const [mfaToken, setMfaToken] = useState<string | null>(null);

  const credForm = useForm<CredentialsForm>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
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

  const onCredentials = credForm.handleSubmit(async (values) => {
    setServerError(null);
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
      const res = await completeMfaChallenge({ mfaToken, totp: values.totp });
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
        subtitle="Introduce el código de 6 dígitos de tu aplicación de autenticación."
        footer={
          <button
            type="button"
            className={styles.linkButton}
            onClick={() => {
              setMfaToken(null);
              setServerError(null);
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
          <FormField label="Código de verificación" required error={mfaForm.formState.errors.totp?.message}>
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                invalid={invalid}
                mono
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                placeholder="123456"
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
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Iniciar sesión" subtitle="Accede a la plataforma de bitácoras operacionales.">
      <form className={styles.form} onSubmit={onCredentials} noValidate>
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
