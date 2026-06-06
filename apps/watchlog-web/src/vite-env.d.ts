/// <reference types="vite/client" />

/**
 * Variables de entorno del frontend (Vite). Solo configuración NO sensible:
 * el branding de la empresa licenciataria de esta instalación on-premise.
 */
interface ImportMetaEnv {
  /** Nombre de la empresa licenciataria que se muestra en el login. */
  readonly VITE_LICENSEE_NAME?: string;
  /** Rubro/industria opcional (ej. "Minería"), como subtítulo del co-branding. */
  readonly VITE_LICENSEE_INDUSTRY?: string;
  /** URL opcional del logo de la empresa; si falta, se usa un monograma. */
  readonly VITE_LICENSEE_LOGO_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
