/**
 * Branding de la empresa licenciataria (co-branding del producto).
 *
 * Lyra WatchLog es single-tenant on-premise: cada instalación se licencia a una
 * empresa. Su nombre/rubro/logo se configuran por entorno (NUNCA hardcodeados),
 * de modo que el mismo build sirva a cualquier cliente cambiando el `.env`.
 *
 * Si no hay logo, la UI usa un monograma con las iniciales del nombre.
 */

export interface Licensee {
  /** Nombre visible de la empresa licenciataria. */
  name: string;
  /** Rubro/industria opcional (subtítulo del co-branding). */
  industry: string | null;
  /** URL del logo, o `null` para usar el monograma de iniciales. */
  logoUrl: string | null;
}

/** Genera iniciales (1–2 letras) a partir del nombre de la empresa. */
export function licenseeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** Empresa licenciataria de esta instalación (resuelta desde el entorno). */
export const licensee: Licensee = {
  name: import.meta.env.VITE_LICENSEE_NAME?.trim() || "Empresa Demo",
  industry: import.meta.env.VITE_LICENSEE_INDUSTRY?.trim() || null,
  logoUrl: import.meta.env.VITE_LICENSEE_LOGO_URL?.trim() || null,
};
