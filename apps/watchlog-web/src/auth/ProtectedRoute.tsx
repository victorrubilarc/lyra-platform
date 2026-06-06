import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Spinner } from "@lyra/ui";
import { useAuthStore } from "./auth-store.js";

/** Pantalla de espera mientras se resuelve el arranque de la sesión. */
function SessionBootstrapScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-accent-primary)",
      }}
    >
      <Spinner size={28} thickness={3} label="Cargando sesión" />
    </div>
  );
}

/**
 * Protege las rutas privadas: exige sesión iniciada y, si el usuario debe
 * cambiar su contraseña (admin de arranque / reset), lo desvía al flujo de
 * cambio forzado antes de dejarlo operar.
 */
export function ProtectedRoute() {
  const status = useAuthStore((s) => s.status);
  const session = useAuthStore((s) => s.session);
  const location = useLocation();

  if (status === "loading") return <SessionBootstrapScreen />;
  if (status === "unauthenticated") {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // 1) El cambio forzado de contraseña tiene prioridad: hasta completarlo, no se
  //    evalúa el gate de MFA (evita desviar a /activar-mfa a mitad del cambio).
  if (session?.user.forcePasswordChange) {
    return location.pathname === "/cambiar-contrasena" ? (
      <Outlet />
    ) : (
      <Navigate to="/cambiar-contrasena" replace />
    );
  }

  // 2) Enrolamiento forzado de MFA (el backend además lo hace cumplir vía guard).
  if (session?.user.mfaEnrollmentRequired && location.pathname !== "/activar-mfa") {
    return <Navigate to="/activar-mfa" replace />;
  }

  return <Outlet />;
}
