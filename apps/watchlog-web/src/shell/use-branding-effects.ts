import { useEffect } from "react";
import { documentTitleFor, useBranding } from "../branding.js";
import { useThemeStore } from "./theme-store.js";

/**
 * Efectos globales del branding runtime (OOBE S3), una vez en la raíz:
 *  - `document.title` según la matriz de marca ("{empresa} · Lyra WatchLog" en
 *    co-branding; solo "{empresa}" en marca blanca).
 *  - Fallback `defaultThemeMode` de la instalación: se aplica SOLO mientras el
 *    usuario no haya elegido tema (no pisa preferencias explícitas).
 */
export function useBrandingEffects(): void {
  const branding = useBranding();
  const applyInstallDefault = useThemeStore((s) => s.applyInstallDefault);

  const title = documentTitleFor(branding);
  useEffect(() => {
    document.title = title;
  }, [title]);

  const installDefault = branding.defaultThemeMode;
  useEffect(() => {
    if (installDefault) applyInstallDefault(installDefault);
  }, [installDefault, applyInstallDefault]);
}
