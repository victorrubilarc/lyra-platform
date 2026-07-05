import { readFileSync } from "node:fs";

import {
  evaluateLicense,
  verifyLicense,
  type LicenseEvaluation,
  type LicensePayload,
  type VerifyLicenseResult,
} from "@lyra/licensing";

/**
 * QA del emisor sobre un `license.lic` ya emitido (LICENSING.md §4): verifica
 * la firma contra una pública dada y evalúa la máquina de estados. Reusa
 * `verifyLicense`/`evaluateLicense` de `@lyra/licensing` tal cual — el estado
 * que muestre aquí es EXACTAMENTE el que verá la instalación.
 */
export interface InspectResult {
  verified: VerifyLicenseResult;
  payload?: LicensePayload;
  /**
   * Evaluación con la huella del PROPIO payload (autoconsistente): responde
   * "¿operaría en la máquina para la que se emitió?". Contra otra huella
   * (p. ej. la de un `solicitud.lreq`) se pasa `fingerprint`.
   */
  evaluation?: LicenseEvaluation;
}

export function inspectLicense(opts: {
  licPath: string;
  publicKeyPem: string;
  fingerprint?: string;
  now?: Date;
}): InspectResult {
  const lic = readFileSync(opts.licPath, "utf8").trim();
  const verified = verifyLicense(lic, opts.publicKeyPem);
  if (!verified.ok) {
    return { verified };
  }
  const evaluation = evaluateLicense(verified.payload, {
    now: opts.now ?? new Date(),
    fingerprint: opts.fingerprint ?? verified.payload.fingerprint,
  });
  return { verified, payload: verified.payload, evaluation };
}
