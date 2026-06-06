/**
 * Catálogo es-CL (idioma por defecto). Todos los textos de la UI viven como
 * claves: agregar otro idioma = añadir un archivo análogo y registrarlo en
 * `i18n.ts`. Los catálogos de otros idiomas se completan en Fase 7.
 */
export const esCL = {
  common: {
    search: "Buscar",
    close: "Cerrar",
    cancel: "Cancelar",
    save: "Guardar",
    loading: "Cargando…",
    comingSoon: "Próximamente",
    underConstruction: "Estamos construyendo esta sección.",
  },
  nav: {
    sectionLabel: "Módulos",
    home: "Inicio",
    structure: "Estructura",
    security: "Seguridad",
    templates: "Plantillas",
    dataSources: "Orígenes de datos",
    incidents: "Incidencias",
  },
  shell: {
    brandTagline: "Bitácora operacional",
    collapse: "Colapsar menú",
    expand: "Expandir menú",
    favorites: "Favoritos",
    recents: "Recientes",
    noFavorites: "Marca pantallas con la estrella para acceder rápido.",
    pin: "Fijar a favoritos",
    unpin: "Quitar de favoritos",
    closeTab: "Cerrar pestaña",
    pinTab: "Fijar pestaña",
    unpinTab: "Desfijar pestaña",
    newTab: "Abrir pestaña",
    tabsFull: "Máximo de pestañas abiertas. Cierra una para abrir otra.",
  },
  topbar: {
    commandHint: "Buscar o saltar a…",
    notifications: "Notificaciones",
    noNotifications: "Sin notificaciones nuevas.",
    openProfileMenu: "Abrir menú de perfil",
    mySecurity: "Mi seguridad",
    preferences: "Preferencias",
    signOut: "Cerrar sesión",
    language: "Idioma",
    density: "Densidad",
    densityComfortable: "Cómoda",
    densityCompact: "Compacta",
  },
  palette: {
    placeholder: "Escribe un comando o busca…",
    navigate: "Ir a",
    actions: "Acciones",
    preferences: "Preferencias",
    noResults: "Sin resultados.",
    toggleDensity: "Cambiar densidad",
    toggleSidebar: "Colapsar/expandir menú",
    signOut: "Cerrar sesión",
  },
  languages: {
    "es-CL": "Español (Chile)",
    en: "English",
  },
} as const;

export type AppResources = typeof esCL;
