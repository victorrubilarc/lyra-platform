import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, KeyRound, ShieldCheck, UserCog } from "lucide-react";
import { Button } from "@lyra/ui";
import { licensee } from "../../branding.js";
import { AuthLayout } from "./AuthLayout.js";
import styles from "./AuthLayout.module.css";

/**
 * Recuperación de acceso. En esta instalación el restablecimiento es **asistido
 * por un administrador** (patrón habitual on-premise: sin self-service por
 * correo activo). El flujo de reset por email es una pieza de backend pendiente
 * de aprobación (requiere endpoints + SMTP); cuando se habilite, esta pantalla
 * pasará a pedir el correo y enviar el enlace de restablecimiento.
 */
export function ForgotPasswordPage() {
  const navigate = useNavigate();
  return (
    <AuthLayout
      title="Recuperar acceso"
      subtitle="¿No puedes ingresar? Así puedes restablecer tu contraseña."
      footer={
        <Link className={styles.linkButton} to="/login">
          Volver al inicio de sesión
        </Link>
      }
    >
      <div className={styles.form}>
        <p className={styles.helpText}>
          Por seguridad, en esta instalación de <strong>{licensee.name}</strong> el restablecimiento
          de contraseña lo realiza un administrador del sistema.
        </p>

        <ul className={styles.helpList}>
          <li className={styles.helpItem}>
            <UserCog size={18} className={styles.helpItemIcon} aria-hidden="true" />
            Contacta al administrador de tu organización o a la mesa de ayuda interna.
          </li>
          <li className={styles.helpItem}>
            <KeyRound size={18} className={styles.helpItemIcon} aria-hidden="true" />
            Se te asignará una contraseña temporal y deberás cambiarla en tu próximo ingreso.
          </li>
          <li className={styles.helpItem}>
            <ShieldCheck size={18} className={styles.helpItemIcon} aria-hidden="true" />
            Si tienes el segundo factor activo, ten a mano tu app de autenticación o un código de
            recuperación.
          </li>
        </ul>

        <Button
          variant="primary"
          block
          leftIcon={<ArrowLeft size={18} />}
          onClick={() => navigate("/login")}
        >
          Volver al inicio de sesión
        </Button>
      </div>
    </AuthLayout>
  );
}
