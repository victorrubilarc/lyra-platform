import type { LicensePayload } from "./types.js";

/**
 * Linaje rotatorio (capa 4 de LICENSING_STRATEGY §4, patrón CodeMeter;
 * PoC T6). Helper ADITIVO de L4: no toca `signLicense`/`verifyLicense`/
 * `evaluateLicense` (congelados desde L0).
 *
 * El contrato del linaje:
 *  - La instalación guarda LOCALMENTE `{ renewalCounter, nonce }`
 *    (`LicenseInstallation` en Postgres). El nonce vigente se genera en la
 *    máquina y NUNCA viaja a nadie hasta la próxima solicitud de renovación.
 *  - La solicitud de renovación (`renovacion.lreq`) presenta ese linaje al
 *    emisor. La respuesta (la licencia renovada) vuelve ATADA a él:
 *    `payload.renewalCounter = presentado + 1` y `payload.nonce = nonce
 *    presentado` (el binding que la hace importable UNA sola vez y SOLO en
 *    la instalación que la pidió).
 *  - Al aceptarla por primera vez (ROTATE), la instalación rota su linaje:
 *    persiste el counter nuevo y un nonce local FRESCO. Desde ahí ni la
 *    licencia anterior ni una respuesta re-importada calzan (MISMATCH).
 */

/** Linaje local de la instalación (columnas de `LicenseInstallation`). */
export interface LocalLineage {
  renewalCounter: number;
  /** null hasta la primera solicitud de renovación (instalaciones L1–L3). */
  nonce: string | null;
}

/**
 * Veredicto puro del contraste payload ↔ linaje local:
 *  - CURRENT:  la licencia YA aceptada por esta instalación (idempotente entre
 *              reinicios). Incluye el caso retrocompatible counter 0 === 0:
 *              una licencia L3 sobre una instalación que jamás renovó evalúa
 *              EXACTAMENTE como antes de L4 (sin escrituras ni rotación).
 *  - ROTATE:   respuesta de renovación legítima para ESTE linaje, vista por
 *              primera vez: quien llama debe rotar el linaje local
 *              (counter := payload.renewalCounter, nonce := fresco local,
 *              lastRenewalAt := ahora) y recién ahí queda CURRENT.
 *  - MISMATCH: el linaje no calza — licencia vieja tras una rotación,
 *              respuesta re-importada, respuesta de OTRA instalación (clon) o
 *              intento de resetear el linaje con una licencia counter=0 sobre
 *              una instalación ya renovada. El consumidor la trata como
 *              BLOQUEADA (restringido, jamás destructivo — LICENSING.md §5).
 */
export type LineageOutcome = "CURRENT" | "ROTATE" | "MISMATCH";

/**
 * Contrasta el linaje del payload (ya VERIFICADO en firma — esto es política,
 * no criptografía) contra el linaje local. PURO: sin I/O ni reloj; la
 * rotación es un efecto de quien llama (L1 la persiste y audita).
 */
export function evaluateLineage(
  payload: Pick<LicensePayload, "renewalCounter" | "nonce">,
  local: LocalLineage,
): LineageOutcome {
  const presented = payload.renewalCounter;
  if (!Number.isInteger(presented) || presented < 0 || !Number.isInteger(local.renewalCounter)) {
    return "MISMATCH";
  }
  if (presented === local.renewalCounter) {
    return "CURRENT";
  }
  if (
    presented === local.renewalCounter + 1 &&
    local.nonce !== null &&
    payload.nonce === local.nonce
  ) {
    return "ROTATE";
  }
  return "MISMATCH";
}
