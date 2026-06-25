import { create } from "zustand";
import { buildPaletteOverrideCss, type PaletteTokens } from "@lyra/contracts";

/**
 * Capa de OVERRIDE de la paleta activa (EST-TEMAS). Inyecta un único `<style>` en
 * <head> con las variables CSS que la paleta sobreescribe, scopeado a `[data-wl-themed]`
 * (el workspace) para NO tocar el login (identidad oscura de marca, regla CLAUDE.md).
 * Construye SOBRE los tokens base: lo no sobreescrito cae a la marca Lyra.
 *
 * Dos capas: `active` = la paleta elegida por el usuario; `preview` = un borrador del
 * builder admin (override temporal mientras se edita). El CSS efectivo aplicado es
 * `preview ?? active`, de modo que el builder muestra el resultado EN VIVO sin guardar.
 */

const STYLE_ID = "wl-palette-override";

/** Cualquier cosa con tokens por variante (DTO público, admin o borrador). */
export interface PaletteOverride {
  tokensDark: PaletteTokens;
  tokensLight: PaletteTokens;
}

function injectCss(css: string): void {
  if (typeof document === "undefined") return;
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!css) {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = css;
}

function cssFor(p: PaletteOverride | null): string {
  return p ? buildPaletteOverrideCss(p) : "";
}

interface PaletteState {
  active: PaletteOverride | null;
  preview: PaletteOverride | null;
  /** Aplica la paleta del usuario (si no hay un preview del builder pisándola). */
  setActive: (palette: PaletteOverride | null) => void;
  /** El builder muestra un borrador EN VIVO (pisa a `active` temporalmente). */
  setPreview: (palette: PaletteOverride | null) => void;
  /** Termina el preview y restaura la paleta activa del usuario. */
  clearPreview: () => void;
}

export const usePaletteStore = create<PaletteState>((set, get) => ({
  active: null,
  preview: null,
  setActive: (palette) => {
    set({ active: palette });
    if (!get().preview) injectCss(cssFor(palette));
  },
  setPreview: (palette) => {
    set({ preview: palette });
    injectCss(cssFor(palette));
  },
  clearPreview: () => {
    set({ preview: null });
    injectCss(cssFor(get().active));
  },
}));
