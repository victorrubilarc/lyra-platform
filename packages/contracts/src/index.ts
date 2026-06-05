/**
 * @lyra/contracts — contratos compartidos entre el backend (NestJS) y el
 * frontend (React). Tipos y esquemas Zod que viajan por la API viven aquí,
 * de modo que ambos lados hablan exactamente el mismo idioma.
 */

export const WATCHLOG_CONTRACTS_VERSION = "0.0.0";

export * from "./health.js";
