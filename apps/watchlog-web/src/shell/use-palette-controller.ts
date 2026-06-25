import { useEffect } from "react";
import { useMyTheme } from "../features/settings/theme-queries.js";
import { usePaletteStore } from "./palette-store.js";

/**
 * Carga la paleta EFECTIVA del usuario (la elegida, o la por defecto de la instalación)
 * y la aplica como capa de override. Se usa una vez en el shell autenticado. El login NO
 * monta esto, así que la entrada conserva la identidad oscura de marca.
 */
export function usePaletteController(): void {
  const { data } = useMyTheme();
  const setActive = usePaletteStore((s) => s.setActive);

  // Marca el DOCUMENTO (<html>) como "workspace tematizable" mientras el shell esté
  // montado. El override CSS de la paleta se scopea a `[data-wl-themed][data-theme=…]`
  // —ambos atributos en <html>, el mismo elemento que ya lleva `data-theme`— para que
  // gane a los tokens base y cubra TODO (incluidos los portales de menús/modales/toasts
  // que se montan en <body>, fuera del árbol del shell). El login NO monta el shell ⇒
  // el atributo se retira al desmontar ⇒ la entrada conserva la identidad oscura de marca.
  useEffect(() => {
    document.documentElement.setAttribute("data-wl-themed", "");
    return () => document.documentElement.removeAttribute("data-wl-themed");
  }, []);

  useEffect(() => {
    if (data !== undefined) setActive(data.palette);
  }, [data, setActive]);
}
