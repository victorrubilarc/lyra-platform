import { LayoutDashboard, Network, ShieldCheck, UserCog, type LucideIcon } from "lucide-react";
import type { Permission } from "@lyra/permissions";

/**
 * Registro central de rutas del shell: una sola fuente de verdad para sidebar,
 * pestañas de trabajo, breadcrumbs y command palette. El label es una CLAVE i18n
 * (se resuelve al renderizar). Los íconos viven aquí (no en stores persistidos).
 */
export interface NavRoute {
  path: string;
  /** Clave i18n del nombre legible. */
  labelKey: string;
  icon: LucideIcon;
  /** Permiso de módulo que habilita la sección (la UI solo oculta). */
  permission?: Permission;
  /** Aparece en la lista de módulos del sidebar. */
  inSidebar?: boolean;
  /** Módulo aún no construido: muestra badge "Próximamente". */
  soon?: boolean;
}

export const ROUTES: readonly NavRoute[] = [
  { path: "/", labelKey: "nav.home", icon: LayoutDashboard, inSidebar: true },
  {
    path: "/estructura",
    labelKey: "nav.structure",
    icon: Network,
    permission: "module:structure:view",
    inSidebar: true,
  },
  {
    path: "/seguridad",
    labelKey: "nav.security",
    icon: ShieldCheck,
    permission: "module:security:view",
    inSidebar: true,
    soon: true,
  },
  { path: "/perfil/seguridad", labelKey: "topbar.mySecurity", icon: UserCog },
] as const;

export function routeByPath(path: string): NavRoute | undefined {
  return ROUTES.find((r) => r.path === path);
}

/** Ítems del sidebar (módulos). */
export const SIDEBAR_ROUTES = ROUTES.filter((r) => r.inSidebar);
