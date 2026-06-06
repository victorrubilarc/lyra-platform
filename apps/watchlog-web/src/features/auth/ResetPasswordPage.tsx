import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Eye, EyeOff, KeyRound, ShieldX } from "lucide-react";
import { Button, FormField, Input } from "@lyra/ui";
import { ApiError } from "../../lib/api-client.js";
import { resetPassword } from "../../auth/auth-api.js";
import { AuthLayout } from "./AuthLayout.js";
import styles from "./AuthLayout.module.css";

/**
 * Validación de cliente para feedback inmediato. La política REAL (longitud,
 * complejidad, historial) la impone el backend; aquí solo evitamos errores
 * obvios y confirmamos que ambas contraseñas coincidan.
 */
const schema = z
  .object({
    newPassword: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });
type FormValues = z.infer<typeof schema>;

/**
 * Recuperación de contraseña self-service (paso 2): el usuario llega desde el
 * enlace del correo con `?token=...`. Endurecimiento: el token se lee una sola
 * vez y se BORRA de la URL (history.replaceState) para que no quede en el
 * historial ni se filtre por referer. La validez real del token la decide el
 * backend al enviar; si es inválido/expirado mostramos un CTA para pedir otro.
 */
export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Captura el token al montar; luego lo quitamos de la URL.
  const [token] = useState(() => searchParams.get("token") ?? "");
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await resetPassword({ token, newPassword: values.newPassword });
      // El aviso viaja en el state de la ruta: el login muestra un banner
      // persistente (un toast efímero se perdería al cambiar de pantalla).
      navigate("/login", {
        replace: true,
        state: {
          notice: "Tu contraseña se restableció correctamente. Inicia sesión con tu nueva contraseña.",
        },
      });
    } catch (err) {
      setServerError(
        err instanceof ApiError ? err.message : "No se pudo restablecer la contraseña.",
      );
    }
  });

  // Sin token en el enlace: no tiene sentido el formulario.
  if (!token) {
    return (
      <AuthLayout
        title="Enlace no válido"
        subtitle="Este enlace de restablecimiento no es válido o está incompleto."
        footer={
          <Link className={styles.linkButton} to="/login">
            Volver al inicio de sesión
          </Link>
        }
      >
        <div className={styles.form}>
          <div className={styles.formError} role="alert">
            <ShieldX size={16} aria-hidden="true" />
            Abre el enlace más reciente desde tu correo, o solicita uno nuevo.
          </div>
          <Button variant="primary" block onClick={() => navigate("/recuperar-contrasena")}>
            Solicitar un enlace nuevo
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Define tu nueva contraseña"
      subtitle="Elige una contraseña segura. Al guardarla, se cerrarán todas tus sesiones activas."
      footer={
        <Link className={styles.linkButton} to="/login">
          Volver al inicio de sesión
        </Link>
      }
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className={styles.formError} role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            {serverError}
            <Link className={styles.link} to="/recuperar-contrasena" style={{ marginLeft: "auto" }}>
              Pedir otro enlace
            </Link>
          </div>
        )}
        <FormField
          label="Nueva contraseña"
          required
          hint="Usa una combinación robusta; el servidor valida la política vigente."
          error={form.formState.errors.newPassword?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              autoFocus
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
              {...form.register("newPassword")}
            />
          )}
        </FormField>
        <FormField
          label="Confirmar nueva contraseña"
          required
          error={form.formState.errors.confirmPassword?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              placeholder="••••••••"
              {...form.register("confirmPassword")}
            />
          )}
        </FormField>
        <Button
          type="submit"
          variant="primary"
          block
          loading={form.formState.isSubmitting}
          leftIcon={<KeyRound size={18} />}
        >
          Restablecer contraseña
        </Button>
      </form>
    </AuthLayout>
  );
}
