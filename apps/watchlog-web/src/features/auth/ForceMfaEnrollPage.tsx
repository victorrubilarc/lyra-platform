import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../../auth/use-auth.js";
import { refreshAccessToken } from "../../lib/api-client.js";
import { MfaEnrollFlow } from "../security/MfaEnrollFlow.js";
import { AuthLayout } from "./AuthLayout.js";
import styles from "./AuthLayout.module.css";

/**
 * Gate de ENROLAMIENTO FORZADO de MFA (análogo a la pantalla de cambio forzado
 * de contraseña). Se muestra cuando el rol del usuario exige MFA y aún no lo
 * tiene activo. El backend además bloquea el resto de la API mientras esto esté
 * pendiente (`MfaEnrollmentGuard`), así que no es solo cosmético.
 */
export function ForceMfaEnrollPage() {
  const { user, refreshSession, signOut } = useAuth();
  const navigate = useNavigate();

  // Si ya no se exige (o no hay sesión), esta pantalla no corresponde.
  if (user && !user.mfaEnrollmentRequired) return <Navigate to="/" replace />;

  return (
    <AuthLayout
      title="Activa la verificación en dos pasos"
      subtitle="Tu rol exige MFA. Configúralo una vez para poder continuar."
      footer={
        <button type="button" className={styles.linkButton} onClick={() => void signOut()}>
          ¿No es tu cuenta? Cerrar sesión
        </button>
      }
    >
      <MfaEnrollFlow
        startLabel="Comenzar configuración"
        onFinish={async () => {
          // El token ya quedó sin `mfaPending` tras verificar; refrescamos el
          // perfil (baja `mfaEnrollmentRequired`) y entramos a la app.
          await refreshAccessToken();
          await refreshSession();
          navigate("/", { replace: true });
        }}
      />
    </AuthLayout>
  );
}
