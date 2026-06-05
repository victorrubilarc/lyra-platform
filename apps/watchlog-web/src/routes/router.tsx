import { createBrowserRouter, Navigate } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute.js";
import { AppLayout } from "./AppLayout.js";
import { LoginPage } from "../features/auth/LoginPage.js";
import { ForcePasswordChangePage } from "../features/auth/ForcePasswordChangePage.js";
import { HomePage } from "../features/home/HomePage.js";

/**
 * Mapa de rutas. `/login` es pública; todo lo demás cuelga de `ProtectedRoute`
 * (exige sesión y desvía al cambio forzado de contraseña cuando aplica). El
 * cambio de contraseña va fuera del `AppLayout` (pantalla completa, sin sidebar).
 */
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    element: <ProtectedRoute />,
    children: [
      { path: "/cambiar-contrasena", element: <ForcePasswordChangePage /> },
      {
        element: <AppLayout />,
        children: [{ index: true, element: <HomePage /> }],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
