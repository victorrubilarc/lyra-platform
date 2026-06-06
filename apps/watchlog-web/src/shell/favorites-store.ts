import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_RECENTS = 8;

interface FavoritesState {
  /** Rutas marcadas como favoritas (acceso rápido). */
  favorites: string[];
  /** Rutas recientes, la más reciente primero. */
  recents: string[];
  toggleFavorite: (path: string) => void;
  pushRecent: (path: string) => void;
}

/**
 * Favoritos y recientes del usuario (rutas), persistidos en localStorage. No son
 * secretos; mejoran la comodidad de re-entrar a pantallas frecuentes.
 */
export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set) => ({
      favorites: [],
      recents: [],
      toggleFavorite: (path) =>
        set((s) => ({
          favorites: s.favorites.includes(path)
            ? s.favorites.filter((p) => p !== path)
            : [...s.favorites, path],
        })),
      pushRecent: (path) =>
        set((s) => ({
          recents: [path, ...s.recents.filter((p) => p !== path)].slice(0, MAX_RECENTS),
        })),
    }),
    { name: "wl_fav" },
  ),
);
