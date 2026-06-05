import type { ReactNode } from "react";
import type { Permission } from "@lyra/permissions";
import { usePermissions } from "./use-permissions.js";

interface CanProps {
  /** Permiso único requerido. */
  perform?: Permission;
  /** Requiere TODOS estos permisos. */
  all?: readonly Permission[];
  /** Requiere AL MENOS UNO de estos permisos. */
  any?: readonly Permission[];
  /** Contenido a mostrar cuando NO se cumple (por defecto: nada). */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renderiza `children` solo si la sesión cumple los permisos indicados.
 * Combina `perform`/`all`/`any` con AND. Pensado para ocultar secciones de UI;
 * la autorización real la aplica el backend.
 */
export function Can({ perform, all, any, fallback = null, children }: CanProps) {
  const perms = usePermissions();
  const ok =
    (perform === undefined || perms.can(perform)) &&
    (all === undefined || perms.canAll(all)) &&
    (any === undefined || perms.canAny(any));
  return <>{ok ? children : fallback}</>;
}
