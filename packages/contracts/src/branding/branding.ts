import { z } from "zod";
import { setupThemeModeSchema } from "../setup/setup.js";

/**
 * Branding RUNTIME de la instalación (OOBE S3, BACKLOG §2(5) — empalma con el
 * épico marca blanca §2(2)).
 *
 * `GET /api/branding` es PÚBLICO (la pantalla de login lo necesita SIN sesión):
 * este DTO es la LISTA COMPLETA de lo que un anónimo puede saber de la
 * instalación — solo lo presentable. Nada de licencia (estado/edición/módulos),
 * ni installationId/huella, ni versión, ni configuración. Si un campo nuevo
 * tienta entrar aquí, pasa primero por SECURITY.md §"branding público".
 */
export const brandingSchema = z.object({
  /** Nombre visible de la empresa (SystemSettings). null = sin personalizar (marca Lyra). */
  companyName: z.string().nullable(),
  /** ¿Hay logo subido? (se sirve en `GET /api/branding/logo`). */
  hasLogo: z.boolean(),
  /**
   * Versión del logo para cache-busting (`/api/branding/logo?v=<logoVersion>`):
   * cambia con cada subida. null sin logo. NO es un timestamp confiable para
   * el cliente, solo un token opaco de caché.
   */
  logoVersion: z.string().nullable(),
  /** Modo de tema por defecto de la instalación (fallback del theme-store). */
  defaultThemeMode: setupThemeModeSchema.nullable(),
  /**
   * Marca blanca EFECTIVA (gate L6d): `whiteLabel` del payload de licencia
   * VERIFICADO. Gobierna qué marca domina el login/shell (LICENSING.md §5.2).
   * Solo presentación: no revela estado ni datos de la licencia.
   */
  whiteLabel: z.boolean(),
});
export type BrandingDto = z.infer<typeof brandingSchema>;

/** Tope de subida del logo (es un asset de identidad, no evidencia). */
export const BRANDING_LOGO_MAX_BYTES = 512 * 1024;

/**
 * Tipos permitidos del logo. SVG se RECHAZA a propósito (decisión 2026-07-06):
 * servir SVG subido por usuarios es una clase entera de XSS (scripts embebidos)
 * y sanitizarlo es complejidad innecesaria — todo logo corporativo existe en
 * PNG. El backend valida por MAGIC BYTES, no solo por content-type declarado.
 */
export const BRANDING_LOGO_CONTENT_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type BrandingLogoContentType = (typeof BRANDING_LOGO_CONTENT_TYPES)[number];
