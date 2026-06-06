import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute.js";
import { AppShell } from "../shell/AppShell.js";
import { LoginPage } from "../features/auth/LoginPage.js";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage.js";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage.js";
import { ForcePasswordChangePage } from "../features/auth/ForcePasswordChangePage.js";
import { ForceMfaEnrollPage } from "../features/auth/ForceMfaEnrollPage.js";
import { ProfileSecurityPage } from "../features/security/ProfileSecurityPage.js";
import { ComingSoonPage } from "../features/placeholder/ComingSoonPage.js";
import { HomePage } from "../features/home/HomePage.js";

/**
 * Mapa de rutas. `/login` es pública; todo lo demás cuelga de `ProtectedRoute`
 * (exige sesión y desvía a cambio forzado de contraseña / enrolamiento MFA). Las
 * pantallas full-screen (cambio de contraseña, activar MFA) van FUERA del
 * `AppShell`; los módulos cuelgan del shell premium (sidebar + topbar + pestañas).
 */
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/recuperar-contrasena", element: <ForgotPasswordPage /> },
  { path: "/restablecer-contrasena", element: <ResetPasswordPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/cambiar-contrasena", element: <ForcePasswordChangePage /> },
      { path: "/activar-mfa", element: <ForceMfaEnrollPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: "/estructura", element: <ComingSoonPage /> },
          { path: "/seguridad", element: <ComingSoonPage /> },
          { path: "/perfil/seguridad", element: <ProfileSecurityPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
