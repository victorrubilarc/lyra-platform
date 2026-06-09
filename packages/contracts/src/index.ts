/**
 * @lyra/contracts — contratos compartidos entre el backend (NestJS) y el
 * frontend (React). Tipos y esquemas Zod que viajan por la API viven aquí,
 * de modo que ambos lados hablan exactamente el mismo idioma.
 */

export const WATCHLOG_CONTRACTS_VERSION = "0.0.0";

export * from "./health.js";

// Seguridad (Fase 1)
export * from "./security/permissions.js";
export * from "./security/auth.js";
export * from "./security/users.js";
export * from "./security/roles.js";
export * from "./security/audit.js";

// Estructura organizacional (Fase 1)
export * from "./structure/org.js";
export * from "./structure/equipment.js";

// Plantillas / Form Builder (Fase 2.1)
export * from "./templates/field-types.js";
export * from "./templates/templates.js";
