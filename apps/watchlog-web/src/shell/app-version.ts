/**
 * Versión de la plataforma, expuesta al usuario (para que sepa qué versión usa y de
 * cuándo es). Los valores los inyecta Vite en build (`define`, ver `vite.config.ts`):
 * en producción desde el tag git del release; en desarrollo, "dev" + commit local.
 */
export const APP_VERSION: string = __APP_VERSION__;
export const GIT_SHA: string = __GIT_SHA__;
export const BUILD_DATE: string = __BUILD_DATE__;

/** Commit corto (7 chars) para mostrar; vacío si no se conoce. */
export const SHORT_SHA: string = GIT_SHA ? GIT_SHA.slice(0, 7) : "";

/** True cuando se corre desde el código (sin tag de release). */
export const IS_DEV: boolean = APP_VERSION === "dev";

/** Etiqueta compacta de versión para chips/menús (ej. "v0.1.6" o "dev"). */
export const VERSION_LABEL: string = IS_DEV ? "dev" : APP_VERSION;
