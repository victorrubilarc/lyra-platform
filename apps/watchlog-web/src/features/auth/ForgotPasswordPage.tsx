import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowLeft, MailCheck, Send } from "lucide-react";
import { Button, FormField, Input } from "@lyra/ui";
import { forgotPasswordRequestSchema, type ForgotPasswordRequest } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { forgotPassword } from "../../auth/auth-api.js";
import { AuthLayout } from "./AuthLayout.js";
import styles from "./AuthLayout.module.css";

/**
 * Recuperación de contraseña self-service (paso 1): el usuario pide un enlace de
 * restablecimiento por correo. La respuesta es SIEMPRE neutra (no se revela si el
 * correo existe), así que tras enviar mostramos la misma confirmación pase lo que
 * pase. El enlace llega por correo y abre `/restablecer-contrasena`.
 */
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<ForgotPasswordRequest>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await forgotPassword(values);
      setSent(true);
    } catch (err) {
      // Solo errores de red/validación; el backend nunca distingue si existe.
      setServerError(
        err instanceof ApiError ? err.message : "No se pudo procesar la solicitud. Intenta de nuevo.",
      );
    }
  });

  const backToLogin = (
    <Link className={styles.linkButton} to="/login">
      Volver al inicio de sesión
    </Link>
  );

  if (sent) {
    return (
      <AuthLayout
        title="Revisa tu correo"
        subtitle="Si el correo está registrado, te enviamos las instrucciones para restablecer tu contraseña."
        footer={backToLogin}
      >
        <div className={styles.form}>
          <ul className={styles.helpList}>
            <li className={styles.helpItem}>
              <MailCheck size={18} className={styles.helpItemIcon} aria-hidden="true" />
              Abre el enlace del correo para definir una nueva contraseña. Caduca pronto y solo puede
              usarse una vez.
            </li>
          </ul>
          <p className={styles.helpText}>
            ¿No te llegó? Revisa tu carpeta de spam o vuelve a intentarlo en unos minutos.
          </p>
          <Button
            variant="secondary"
            block
            onClick={() => {
              setSent(false);
              form.reset();
            }}
          >
            Usar otro correo
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Recuperar acceso"
      subtitle="Ingresa el correo de tu cuenta y te enviaremos un enlace para restablecer tu contraseña."
      footer={backToLogin}
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className={styles.formError} role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            {serverError}
          </div>
        )}
        <FormField label="Correo electrónico" required error={form.formState.errors.email?.message}>
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type="email"
              autoComplete="username"
              autoFocus
              placeholder="tu@empresa.cl"
              {...form.register("email")}
            />
          )}
        </FormField>
        <Button
          type="submit"
          variant="primary"
          block
          loading={form.formState.isSubmitting}
          leftIcon={<Send size={18} />}
        >
          Enviar enlace de recuperación
        </Button>
        <div className={styles.mfaSwitch}>
          <Link className={styles.link} to="/login">
            <ArrowLeft size={14} style={{ verticalAlign: "-2px", marginRight: 4 }} aria-hidden="true" />
            Volver al inicio de sesión
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
