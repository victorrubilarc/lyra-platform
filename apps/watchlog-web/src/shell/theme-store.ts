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
  /**
   * true = el usuario ELIGIÓ el tema (Topbar). Mientras sea false, la
   * preferencia visible es el `defaultThemeMode` de la instalación (OOBE S3):
   * si un admin cambia el default, los usuarios que nunca eligieron lo siguen.
   */
  explicit: boolean;
  setPreference: (preference: ThemePreference) => void;
  /** Fallback de la INSTALACIÓN: solo aplica si el usuario no ha elegido. */
  applyInstallDefault: (preference: ThemePreference) => void;
}

/** Preferencia de tema persistida (claro/oscuro/auto). No es un secreto. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      preference: "dark",
      explicit: false,
      setPreference: (preference) => {
        set({ preference, explicit: true });
        applyThemeAttr(resolveTheme(preference));
      },
      applyInstallDefault: (preference) => {
        if (get().explicit) return;
        set({ preference });
        applyThemeAttr(resolveTheme(preference));
      },
    }),
    {
      name: "wl_theme",
      version: 1,
      // El storage v0 (pre-S3) solo guardaba `preference` y SOLO existía si el
      // usuario había elegido tema alguna vez ⇒ se migra como explícita.
      migrate: (persisted) => ({
        ...(persisted as { preference: ThemePreference }),
        explicit: true,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeAttr(resolveTheme(state.preference));
      },
    },
  ),
);

// Aplica el tema apenas se carga el módulo (evita parpadeo; el default CSS es oscuro).
applyThemeAttr(resolveTheme(useThemeStore.getState().preference));
