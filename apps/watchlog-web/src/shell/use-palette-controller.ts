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
  useEffect(() => {
    if (data !== undefined) setActive(data.palette);
  }, [data, setActive]);
}
