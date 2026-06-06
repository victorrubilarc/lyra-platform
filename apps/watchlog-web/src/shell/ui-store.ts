import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Densidad de la interfaz: cómoda (por defecto) o compacta para data densa. */
export type Density = "comfortable" | "compact";

interface UIState {
  /** Sidebar colapsado a riel de íconos. */
  sidebarCollapsed: boolean;
  density: Density;
  toggleSidebar: () => void;
  setSidebarCollapsed: (value: boolean) => void;
  setDensity: (density: Density) => void;
  toggleDensity: () => void;
}

/**
 * Preferencias de UI persistidas en localStorage (NO secretos): estado del
 * sidebar y densidad. La preferencia sobrevive recargas y cierres de pestaña.
 */
export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      density: "comfortable",
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      setDensity: (density) => set({ density }),
      toggleDensity: () =>
        set((s) => ({ density: s.density === "comfortable" ? "compact" : "comfortable" })),
    }),
    { name: "wl_ui" },
  ),
);
