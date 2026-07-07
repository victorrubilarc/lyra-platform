import { useQuery } from "@tanstack/react-query";
import { brandingSchema, type BrandingDto, type SetupThemeMode } from "@lyra/contracts";
import { apiJson, API_BASE } from "./lib/api-client.js";

/**
 * Branding RUNTIME de la instalación (OOBE S3). Reemplaza al viejo co-branding
 * BUILD-TIME por `VITE_LICENSEE_*` (retirado 2026-07-06): la identidad (nombre,
 * logo, modo de tema por defecto) la configura el wizard de primer arranque /
 * /configuracion ▸ Identidad y se aplica EN VIVO — la misma imagen Docker sirve
 * a N clientes del canal sin rebuild.
 *
 * `GET /api/branding` es público (el login se co-marca SIN sesión) y mínimo:
 * nombre visible, si hay logo, tema por defecto y el gate `whiteLabel` del
 * payload de licencia VERIFICADO (L6d), que decide QUÉ marca domina.
 */

export const BRANDING_KEYS = {
  branding: ["branding"] as const,
};

/** La identidad cambia rarísimo: caché largo y sin refetch por foco. */
const BRANDING_STALE_MS = 5 * 60_000;

function fetchBranding(): Promise<BrandingDto> {
  return apiJson("/branding", brandingSchema);
}

/**
 * Modo de marca EFECTIVO (matriz decisión (b) 2026-07-06):
 *  - `lyra`: sin nombre configurado ⇒ marca Lyra WatchLog a secas.
 *  - `cobrand`: nombre configurado, `whiteLabel:false` ⇒ Lyra domina +
 *    "Licenciado para {empresa}".
 *  - `whitelabel`: nombre configurado y `whiteLabel:true` (payload verificado)
 *    ⇒ la marca del cliente domina; Lyra queda en "Operado con Lyra WatchLog".
 */
export type BrandMode = "lyra" | "cobrand" | "whitelabel";

export interface Branding {
  /** false mientras no llega el DTO: la UI cae a la marca Lyra base (sin parpadeo raro). */
  loaded: boolean;
  companyName: string | null;
  /** URL versionada del logo público, o null (la UI usa el monograma). */
  logoUrl: string | null;
  defaultThemeMode: SetupThemeMode | null;
  whiteLabel: boolean;
  mode: BrandMode;
}

const FALLBACK: Branding = {
  loaded: false,
  companyName: null,
  logoUrl: null,
  defaultThemeMode: null,
  whiteLabel: false,
  mode: "lyra",
};

/** Branding de la instalación (query pública compartida; funciona sin sesión). */
export function useBranding(): Branding {
  const { data } = useQuery({
    queryKey: BRANDING_KEYS.branding,
    queryFn: fetchBranding,
    staleTime: BRANDING_STALE_MS,
  });
  if (!data) return FALLBACK;
  return {
    loaded: true,
    companyName: data.companyName,
    logoUrl: data.hasLogo
      ? `${API_BASE}/branding/logo${data.logoVersion ? `?v=${data.logoVersion}` : ""}`
      : null,
    defaultThemeMode: data.defaultThemeMode,
    whiteLabel: data.whiteLabel,
    mode:
      data.companyName === null ? "lyra" : data.whiteLabel ? "whitelabel" : "cobrand",
  };
}

/** Título del documento según el modo de marca (decisión (b)). */
export function documentTitleFor(branding: Branding): string {
  if (branding.companyName === null) return "Lyra WatchLog";
  return branding.mode === "whitelabel"
    ? branding.companyName
    : `${branding.companyName} · Lyra WatchLog`;
}

/** Genera iniciales (1–2 letras) a partir del nombre de la empresa. */
export function licenseeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
