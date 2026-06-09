import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute.js";
import { AppShell } from "../shell/AppShell.js";
import { LoginPage } from "../features/auth/LoginPage.js";
import { ForgotPasswordPage } from "../features/auth/ForgotPasswordPage.js";
import { ResetPasswordPage } from "../features/auth/ResetPasswordPage.js";
import { ForcePasswordChangePage } from "../features/auth/ForcePasswordChangePage.js";
import { ForceMfaEnrollPage } from "../features/auth/ForceMfaEnrollPage.js";
import { ProfileSecurityPage } from "../features/security/ProfileSecurityPage.js";
import { SecurityLayout } from "../features/security/SecurityLayout.js";
import { SecurityIndexRedirect } from "../features/security/SecurityIndexRedirect.js";
import { UsersPage } from "../features/security/UsersPage.js";
import { RolesPage } from "../features/security/RolesPage.js";
import { PolicyPage } from "../features/security/PolicyPage.js";
import { AuditPage } from "../features/security/AuditPage.js";
import { HomePage } from "../features/home/HomePage.js";
import { StructurePage } from "../features/structure/StructurePage.js";
import { TemplatesPage } from "../features/templates/TemplatesPage.js";
import { TemplateBuilderPage } from "../features/templates/TemplateBuilderPage.js";

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
          { path: "/estructura", element: <StructurePage /> },
          { path: "/plantillas", element: <TemplatesPage /> },
          { path: "/plantillas/:id", element: <TemplateBuilderPage /> },
          {
            path: "/seguridad",
            element: <SecurityLayout />,
            children: [
              { index: true, element: <SecurityIndexRedirect /> },
              { path: "usuarios", element: <UsersPage /> },
              { path: "roles", element: <RolesPage /> },
              { path: "politica", element: <PolicyPage /> },
              { path: "auditoria", element: <AuditPage /> },
            ],
          },
          { path: "/perfil/seguridad", element: <ProfileSecurityPage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
