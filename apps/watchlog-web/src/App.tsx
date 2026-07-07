import { RouterProvider } from "react-router-dom";
import { ToastProvider } from "@lyra/ui";
import { AuthProvider } from "./auth/AuthProvider.js";
import { ForbiddenToastBridge } from "./shell/ForbiddenToastBridge.js";
import { useBrandingEffects } from "./shell/use-branding-effects.js";
import { useThemeController } from "./shell/use-theme-controller.js";
import { router } from "./routes/router.js";

/**
 * Raíz de la app: tema (claro/oscuro/auto) → branding runtime (título + fallback
 * de tema de la instalación) → notificaciones (toasts) → ciclo de vida de la
 * sesión (AuthProvider) → enrutado. El AuthProvider rehidrata la sesión al
 * arrancar, así que las rutas protegidas ya conocen el estado de auth.
 */
export function App() {
  useThemeController();
  useBrandingEffects();
  return (
    <ToastProvider>
      <ForbiddenToastBridge />
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ToastProvider>
  );
}
