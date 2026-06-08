import { ScrollText, SlidersHorizontal, UserCog, Users, type LucideIcon } from "lucide-react";
import type { Permission } from "@lyra/permissions";

/**
 * Sub-secciones del módulo de Seguridad. Cada una es una sub-ruta anidada bajo
 * `/seguridad` y se gatea por su propio permiso (la UI solo oculta; el backend
 * decide). El label es una clave i18n.
 */
export interface SecurityTab {
  path: string;
  labelKey: string;
  icon: LucideIcon;
  permission: Permission;
}

export const SECURITY_TABS: readonly SecurityTab[] = [
  { path: "/seguridad/usuarios", labelKey: "security.tabs.users", icon: Users, permission: "user:read" },
  { path: "/seguridad/roles", labelKey: "security.tabs.roles", icon: UserCog, permission: "role:read" },
  {
    path: "/seguridad/politica",
    labelKey: "security.tabs.policy",
    icon: SlidersHorizontal,
    permission: "security:policy:manage",
  },
  { path: "/seguridad/auditoria", labelKey: "security.tabs.audit", icon: ScrollText, permission: "audit:read" },
] as const;
