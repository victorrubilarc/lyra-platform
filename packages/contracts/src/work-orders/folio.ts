import {
  type ResolvedFolioScheme,
  resolveFolioSchemeWith,
} from "../shared/folio.js";

/**
 * FOLIO de OT — DEFAULTS del dominio de órdenes de trabajo.
 *
 * El MOTOR puro (schema, scopes/resets, `buildFolioSeqKey`, `renderFolio`,
 * `folioSchemeWarnings`) vive en `../shared/folio.ts` (neutral, reutilizado también
 * por el folio-por-plantilla de bitácora). Aquí sólo quedan las constantes propias
 * de OT y un `resolveFolioScheme` con el default de OT ya aplicado (retro-compat: los
 * llamadores de OT lo invocan con 1 argumento).
 *
 * El motor compartido se exporta por el barrel vía `./shared/folio.js` (no se
 * re-exporta aquí para no duplicar nombres en `@lyra/contracts`).
 */

/**
 * Default OT: **serie ÚNICA GLOBAL** con reinicio ANUAL → "OT-2026-0001", "OT-2026-0002"…
 * (estándar SAP PM / Maximo: un solo rango de número de OT). *Corrección 2026-07-02:* el
 * default de W4 era `scope: "type"`, pero el folio renderizado NO incluye el tipo y
 * `WorkOrder.folio` es único GLOBAL ⇒ dos tipos distintos colisionaban en "OT-2026-0001".
 * `global` numera una sola serie por año, siempre única. Si un cliente quiere serie por
 * tipo, debe usar una `mask`/prefijo que incluya el tipo (`folioScheme` por `WorkOrderType`).
 */
export const DEFAULT_WORK_ORDER_FOLIO_SCHEME: ResolvedFolioScheme = {
  prefix: "OT",
  mask: null,
  padding: 4,
  start: 1,
  scope: "global",
  reset: "annual",
};

/** Estado del flujo al que, al ENTRAR, se emite el folio (si el tipo no declara otro). */
export const DEFAULT_WORK_ORDER_FOLIO_STATE_KEY = "aprobada";

/**
 * Valida y resuelve un `folioScheme` crudo de un `WorkOrderType` aplicando el default OT.
 * null/undefined ⇒ default OT completo. Lanza ZodError si el JSON no es válido.
 */
export function resolveFolioScheme(raw: unknown): ResolvedFolioScheme {
  return resolveFolioSchemeWith(raw, DEFAULT_WORK_ORDER_FOLIO_SCHEME);
}
