import { useMemo } from "react";
import { createPermissionChecker, type PermissionChecker } from "@lyra/permissions";
import { useAuthStore } from "./auth-store.js";

/**
 * Devuelve un `PermissionChecker` derivado de los permisos efectivos de la
 * sesión. Se usa para OCULTAR o DESHABILITAR controles; el backend sigue siendo
 * la única fuente de verdad (ver docs/SECURITY.md).
 */
export function usePermissions(): PermissionChecker {
  const permissions = useAuthStore((s) => s.session?.permissions);
  return useMemo(() => createPermissionChecker(permissions ?? []), [permissions]);
}
