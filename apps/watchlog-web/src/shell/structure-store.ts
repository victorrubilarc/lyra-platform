import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Estructura organizacional ACTIVA (multi-estructura, 2026-06-23). Una instalación
 * puede tener varias estructuras (cada una con sus niveles y su árbol); el usuario
 * trabaja sobre UNA a la vez, elegida en el selector del shell. El id activo cambia
 * qué árbol/niveles/calendarios ve TODA la app: las queries `useOrgTree`/`useOrgLevels`
 * (y por ende todos los pickers de nodo) lo incluyen en su clave y lo pasan al backend.
 *
 * `null` = sin elección explícita → el backend cae a la estructura por defecto
 * (back-compat total). Se persiste y se AÍSLA por usuario (igual que las pestañas):
 * si entra otra cuenta en el mismo navegador, la selección no se filtra.
 */
interface StructureState {
  activeStructureId: string | null;
  /** Usuario dueño de la selección actual (aísla por cuenta). */
  ownerUserId: string | null;
  setActiveStructure: (id: string | null) => void;
  /** Sincroniza el dueño; si cambió (otro login / logout), entra LIMPIO. */
  syncOwner: (userId: string | null) => void;
}

export const useStructureStore = create<StructureState>()(
  persist(
    (set) => ({
      activeStructureId: null,
      ownerUserId: null,
      setActiveStructure: (id) => set({ activeStructureId: id }),
      syncOwner: (userId) =>
        set((s) => (s.ownerUserId === userId ? {} : { ownerUserId: userId, activeStructureId: null })),
    }),
    { name: "wl_active_structure" },
  ),
);
