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
import { WorkflowsPage } from "../features/workflows/WorkflowsPage.js";
import { WorkflowBuilderPage } from "../features/workflows/WorkflowBuilderPage.js";
import { ReferenceDataPage } from "../features/reference-data/ReferenceDataPage.js";
import { OperationalCalendarPage } from "../features/operational-calendar/OperationalCalendarPage.js";
import { FiscalCalendarPage } from "../features/fiscal-calendar/FiscalCalendarPage.js";
import { SettingsPage } from "../features/settings/SettingsPage.js";
import { NewEntryPage } from "../features/log-entries/NewEntryPage.js";
import { EntryFillPage } from "../features/log-entries/EntryFillPage.js";
import { LogbookPage } from "../features/logbook/LogbookPage.js";
import { EntryViewerPage } from "../features/logbook/EntryViewerPage.js";
import { SchedulesPage } from "../features/schedules/SchedulesPage.js";
import { MyRoundsPage } from "../features/schedules/MyRoundsPage.js";
import { NotificationsPage } from "../features/notifications/NotificationsPage.js";
import { MyNotificationsPage } from "../features/notifications/MyNotificationsPage.js";

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
          { path: "/nueva-entrada", element: <NewEntryPage /> },
          // Modo COMPOSE (2.8.2): abrir el formulario de una entrada NUEVA sin
          // crearla; se materializa recién al primer guardado. Va antes de "/:id".
          { path: "/nueva-entrada/comenzar/:templateId", element: <EntryFillPage /> },
          { path: "/nueva-entrada/:id", element: <EntryFillPage /> },
          { path: "/bitacoras", element: <LogbookPage /> },
          { path: "/mis-rondas", element: <MyRoundsPage /> },
          { path: "/rondas", element: <SchedulesPage /> },
          { path: "/notificaciones", element: <NotificationsPage /> },
          { path: "/mis-notificaciones", element: <MyNotificationsPage /> },
          { path: "/bitacoras/:id", element: <EntryViewerPage /> },
          // Ruta de EDICIÓN dedicada de una entrada existente (2.8.2), separada del
          // flujo de creación/compose de /nueva-entrada. Reusa EntryFillPage.
          { path: "/bitacoras/:id/editar", element: <EntryFillPage /> },
          { path: "/flujos", element: <WorkflowsPage /> },
          { path: "/flujos/:id", element: <WorkflowBuilderPage /> },
          { path: "/datos-referencia", element: <ReferenceDataPage /> },
          { path: "/calendario-operacional", element: <OperationalCalendarPage /> },
          { path: "/calendario-fiscal", element: <FiscalCalendarPage /> },
          { path: "/configuracion", element: <SettingsPage /> },
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
