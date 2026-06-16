import { Bell, BookOpenCheck, CalendarClock, CalendarRange, FilePlus2, GitBranch, LayoutDashboard, Layers, ListChecks, ListTodo, Network, Route, Settings, ShieldCheck, UserCog, type LucideIcon } from "lucide-react";
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
    path: "/plantillas",
    labelKey: "nav.templates",
    icon: Layers,
    permission: "module:templates:view",
    inSidebar: true,
  },
  {
    path: "/nueva-entrada",
    labelKey: "nav.newEntry",
    icon: FilePlus2,
    // Crear entradas requiere `logentry:create`; quien solo llena/revisa (sin crear)
    // no ve este ítem y llega a las entradas por Bitácoras → Editar.
    permission: "logentry:create",
    inSidebar: true,
  },
  {
    path: "/bitacoras",
    labelKey: "nav.logbook",
    icon: BookOpenCheck,
    permission: "module:logbook:view",
    inSidebar: true,
  },
  // Worklist del OPERADOR (2.3.1): sus rondas para ejecutar. Gateado por el permiso
  // de ejecución, distinto del de planificación (schedule:view).
  {
    path: "/mis-rondas",
    labelKey: "nav.myRounds",
    icon: ListTodo,
    permission: "round:execute",
    inSidebar: true,
  },
  // Admin del PLANIFICADOR: CRUD de horarios (junto al resto de la configuración).
  {
    path: "/rondas",
    labelKey: "nav.rounds",
    icon: Route,
    permission: "schedule:view",
    inSidebar: true,
  },
  {
    path: "/flujos",
    labelKey: "nav.workflows",
    icon: GitBranch,
    permission: "module:workflows:view",
    inSidebar: true,
  },
  {
    path: "/datos-referencia",
    labelKey: "nav.referenceData",
    icon: ListChecks,
    permission: "module:referencedata:view",
    inSidebar: true,
  },
  {
    path: "/calendario-operacional",
    labelKey: "nav.opsCalendar",
    icon: CalendarClock,
    permission: "module:opscalendar:view",
    inSidebar: true,
  },
  {
    path: "/calendario-fiscal",
    labelKey: "nav.fiscalCalendar",
    icon: CalendarRange,
    permission: "module:opscalendar:view",
    inSidebar: true,
  },
  {
    path: "/seguridad",
    labelKey: "nav.security",
    icon: ShieldCheck,
    permission: "module:security:view",
    inSidebar: true,
  },
  // Motor de avisos por correo (Bloque N): plantillas + bandeja de salida + preferencias.
  {
    path: "/notificaciones",
    labelKey: "nav.notifications",
    icon: Bell,
    permission: "module:notifications:view",
    inSidebar: true,
  },
  {
    path: "/configuracion",
    labelKey: "nav.settings",
    icon: Settings,
    permission: "module:settings:view",
    inSidebar: true,
  },
  { path: "/perfil/seguridad", labelKey: "topbar.mySecurity", icon: UserCog },
  // Preferencias de aviso propias (accesible a todo usuario): vive en el menú de perfil.
  { path: "/mis-notificaciones", labelKey: "topbar.myNotifications", icon: Bell },
] as const;

export function routeByPath(path: string): NavRoute | undefined {
  return ROUTES.find((r) => r.path === path);
}

/**
 * Ruta de módulo que "posee" un pathname, por coincidencia exacta o de prefijo.
 * Permite que sub-rutas anidadas (ej. `/seguridad/usuarios`) se atribuyan al
 * módulo padre (`/seguridad`) para pestañas, breadcrumbs y estado activo del
 * sidebar, manteniendo UNA sola pestaña por módulo. Devuelve la coincidencia más
 * larga (la más específica).
 */
export function routeForPath(path: string): NavRoute | undefined {
  let best: NavRoute | undefined;
  for (const r of ROUTES) {
    if (r.path === "/") continue; // la Home solo casa exacto (la trata el caller)
    if (path === r.path || path.startsWith(`${r.path}/`)) {
      if (!best || r.path.length > best.path.length) best = r;
    }
  }
  return path === "/" ? routeByPath("/") : best;
}

/** ¿El pathname pertenece a esta ruta de módulo (exacto o sub-ruta)? */
export function isRouteActive(routePath: string, pathname: string): boolean {
  if (routePath === "/") return pathname === "/";
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

/** Ítems del sidebar (módulos). */
export const SIDEBAR_ROUTES = ROUTES.filter((r) => r.inSidebar);
