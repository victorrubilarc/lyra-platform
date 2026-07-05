/**
 * Catálogo CANÓNICO de claves de módulo licenciable del producto (L2).
 *
 * Única fuente de verdad del vocabulario de entitlement: el `modules[]` de la
 * licencia (LICENSING.md §3), el gate del backend (`@RequireModule`) y el gate
 * del frontend (`SIDEBAR_ROUTES`) hablan ESTE idioma. Regla de CLAUDE.md:
 * «todo módulo nuevo nace entitlement-aware» ⇒ al crear un módulo de producto
 * se registra aquí su clave.
 *
 * Vive en `@lyra/contracts` (NO en `@lyra/licensing`) a propósito: el web
 * necesita las claves para ocultar módulos y `@lyra/licensing` es server-only
 * (node:crypto, se hornea anti-tamper en L5). Las claves NO son secreto: son
 * el vocabulario del paquete comercial (edition → modules). El payload de la
 * licencia sigue siendo dato LIBRE (`LicenseModule = string` en
 * `@lyra/licensing`): una licencia emitida en el futuro puede traer claves que
 * este build no conoce y el verificador/evaluador no debe romperse por eso.
 *
 * El mapeo módulo→controladores del backend está documentado en
 * `docs/LICENSING.md` (§5.1). Lo transversal (auth, seguridad, configuración,
 * calendarios, flujos, vistas guardadas, auditoría) es `core` y NUNCA se gatea.
 */
export const LICENSED_MODULE_KEYS = [
  "core",
  "structure",
  "templates",
  "logbook",
  "schedules",
  "incidents",
  "exceptions",
  "work-orders",
  "shift-handover",
  "notifications",
  "themes",
  "ai",
  "dashboards",
] as const;

/** Clave de módulo licenciable conocida por ESTE build. */
export type LicensedModuleKey = (typeof LICENSED_MODULE_KEYS)[number];

/**
 * El módulo base: SIEMPRE encendido, jamás se gatea por licencia (sin él ni
 * siquiera se podría leer/exportar, y la licencia nunca secuestra datos).
 */
export const CORE_MODULE_KEY: LicensedModuleKey = "core";
