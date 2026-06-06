import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Preferencia del usuario; `auto` sigue al sistema (prefers-color-scheme). */
export type ThemePreference = "dark" | "light" | "auto";
/** Tema efectivo realmente aplicado. */
export type EffectiveTheme = "dark" | "light";

function systemTheme(): EffectiveTheme {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function resolveTheme(pref: ThemePreference): EffectiveTheme {
  return pref === "auto" ? systemTheme() : pref;
}

/** Aplica el tema EFECTIVO como `data-theme` en <html> (lo lee el CSS de tokens). */
export function applyThemeAttr(theme: EffectiveTheme): void {
  if (typeof document !== "undefined") document.documentElement.dataset.theme = theme;
}

interface ThemeState {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

/** Preferencia de tema persistida (claro/oscuro/auto). No es un secreto. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      preference: "dark",
      setPreference: (preference) => {
        set({ preference });
        applyThemeAttr(resolveTheme(preference));
      },
    }),
    {
      name: "wl_theme",
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeAttr(resolveTheme(state.preference));
      },
    },
  ),
);

// Aplica el tema apenas se carga el módulo (evita parpadeo; el default CSS es oscuro).
applyThemeAttr(resolveTheme(useThemeStore.getState().preference));
