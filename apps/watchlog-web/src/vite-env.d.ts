/// <reference types="vite/client" />

/**
 * Variables de entorno del frontend (Vite). Las `VITE_LICENSEE_*` fueron
 * RETIRADAS (OOBE S3, 2026-07-06): el branding es RUNTIME vía GET /api/branding.
 */

/** Metadatos de versión inyectados por Vite (`define`) en tiempo de build. */
declare const __APP_VERSION__: string;
declare const __GIT_SHA__: string;
declare const __BUILD_DATE__: string;
