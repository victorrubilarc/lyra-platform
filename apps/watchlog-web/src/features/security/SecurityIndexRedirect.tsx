import { Navigate } from "react-router-dom";
import { usePermissions } from "../../auth/use-permissions.js";
import { SECURITY_TABS } from "./security-tabs.js";

/**
 * Índice de `/seguridad`: redirige a la primera sub-sección a la que el usuario
 * tenga permiso. Si no tiene ninguna, cae en `usuarios` y el layout muestra el
 * estado "sin acceso" (la decisión real siempre la toma el backend).
 */
export function SecurityIndexRedirect() {
  const perms = usePermissions();
  const first = SECURITY_TABS.find((tab) => perms.can(tab.permission));
  return <Navigate to={first?.path ?? "/seguridad/usuarios"} replace />;
}
