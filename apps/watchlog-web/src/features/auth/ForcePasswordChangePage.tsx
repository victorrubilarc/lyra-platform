import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Navigate } from "react-router-dom";
import { AlertTriangle, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button, FormField, Input, useToast } from "@lyra/ui";
import { ApiError } from "../../lib/api-client.js";
import { changePassword } from "../../auth/auth-api.js";
import { useAuth } from "../../auth/use-auth.js";
import { AuthLayout } from "./AuthLayout.js";
import styles from "./AuthLayout.module.css";

/**
 * Validación de cliente para feedback inmediato. La política REAL (longitud,
 * complejidad, historial) la impone el backend; aquí solo evitamos errores
 * obvios y confirmamos que ambas contraseñas coincidan.
 */
const schema = z
  .object({
    currentPassword: z.string().min(1, "Ingresa tu contraseña actual"),
    newPassword: z.string().min(8, "Mínimo 8 caracteres"),
    confirmPassword: z.string().min(1, "Confirma la nueva contraseña"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "La nueva contraseña debe ser distinta a la actual",
  });
type FormValues = z.infer<typeof schema>;

export function ForcePasswordChangePage() {
  const { user, refreshSession } = useAuth();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  // Si ya no se exige el cambio (o no hay sesión), no corresponde esta pantalla.
  if (user && !user.forcePasswordChange) return <Navigate to="/" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await changePassword({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      await refreshSession();
      toast.success("Contraseña actualizada");
      // El refresh de sesión baja `forcePasswordChange`; el guard redirige solo.
    } catch (err) {
      setServerError(
        err instanceof ApiError ? err.message : "No se pudo actualizar la contraseña",
      );
    }
  });

  return (
    <AuthLayout
      title="Cambia tu contraseña"
      subtitle="Por seguridad, debes definir una nueva contraseña antes de continuar."
    >
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className={styles.formError} role="alert">
            <AlertTriangle size={16} aria-hidden="true" />
            {serverError}
          </div>
        )}
        <FormField
          label="Contraseña actual"
          required
          error={form.formState.errors.currentPassword?.message}
        >
          {({ id, describedBy, invalid }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              invalid={invalid}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              autoFocus
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
              {...form.register("currentPassword")}
            />
          )}
        </FormField>
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
          Guardar y continuar
        </Button>
      </form>
    </AuthLayout>
  );
}
