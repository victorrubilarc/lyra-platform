import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Tope de pestañas de trabajo abiertas (paradigma "acotado", no MDI). */
export const MAX_TABS = 6;

/**
 * Una pestaña = una ruta. Solo guardamos datos serializables (la etiqueta/ícono
 * se resuelven del registro de navegación al renderizar). El estado de la vista
 * NO se mantiene en memoria: lo preserva la caché de TanStack Query, por eso
 * re-abrir una pestaña es instantáneo y sin refrescos.
 */
export interface WorkTab {
  path: string;
  /** Título opcional para rutas dinámicas (si falta, se usa el registro). */
  title?: string;
  pinned?: boolean;
}

interface WorkspaceState {
  tabs: WorkTab[];
  /** Usuario dueño de las pestañas actuales. Aísla el workspace por cuenta:
   *  si entra otro usuario en el mismo navegador, las pestañas no se filtran. */
  ownerUserId: string | null;
  /** Abre (o asegura) una pestaña para la ruta. Si se excede el tope, descarta
   *  la más antigua no fijada. */
  openTab: (tab: WorkTab) => void;
  /** Cierra una pestaña; devuelve la ruta vecina a la que navegar (o null). */
  closeTab: (path: string) => string | null;
  togglePin: (path: string) => void;
  /** Sincroniza el dueño de las pestañas. Si cambió respecto del actual (login
   *  de otra cuenta, o logout con `null`), entra LIMPIO (descarta las ajenas). */
  syncOwner: (userId: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      tabs: [],
      ownerUserId: null,
      openTab: (tab) =>
        set((s) => {
          const existing = s.tabs.find((t) => t.path === tab.path);
          if (existing) {
            // Actualiza el título si llega uno nuevo (rutas dinámicas).
            return tab.title
              ? { tabs: s.tabs.map((t) => (t.path === tab.path ? { ...t, title: tab.title } : t)) }
              : {};
          }
          let tabs = [...s.tabs, { path: tab.path, title: tab.title }];
          if (tabs.length > MAX_TABS) {
            const idx = tabs.findIndex((t) => !t.pinned && t.path !== tab.path);
            if (idx >= 0) tabs = tabs.filter((_, i) => i !== idx);
          }
          return { tabs };
        }),
      closeTab: (path) => {
        const { tabs } = get();
        const idx = tabs.findIndex((t) => t.path === path);
        if (idx < 0) return null;
        const neighbor = tabs[idx + 1] ?? tabs[idx - 1] ?? null;
        set({ tabs: tabs.filter((t) => t.path !== path) });
        return neighbor?.path ?? null;
      },
      togglePin: (path) =>
        set((s) => ({
          tabs: s.tabs.map((t) => (t.path === path ? { ...t, pinned: !t.pinned } : t)),
        })),
      syncOwner: (userId) =>
        set((s) => (s.ownerUserId === userId ? {} : { ownerUserId: userId, tabs: [] })),
    }),
    { name: "wl_tabs" },
  ),
);
