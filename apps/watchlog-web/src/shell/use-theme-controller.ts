import { useEffect } from "react";
import { applyThemeAttr, resolveTheme, useThemeStore } from "./theme-store.js";

/**
 * Mantiene el `data-theme` de <html> sincronizado con la preferencia y, en modo
 * `auto`, reacciona a los cambios del sistema (prefers-color-scheme). Se usa una
 * vez en la raíz de la app.
 */
export function useThemeController(): void {
  const preference = useThemeStore((s) => s.preference);
  useEffect(() => {
    applyThemeAttr(resolveTheme(preference));
    if (preference !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => applyThemeAttr(resolveTheme("auto"));
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);
}
