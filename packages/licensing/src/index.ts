/**
 * @lyra/licensing — núcleo PURO del licenciamiento Lyra WatchLog (L0).
 *
 * Librería sin NestJS, sin Prisma, sin I/O de red ni de disco y con cero
 * dependencias externas (solo `node:crypto`). Las llaves, señales de máquina
 * y el reloj (`now`) entran SIEMPRE por parámetro. La consumen la API (L1) y
 * la futura CLI de emisión (L3).
 *
 * Fuentes de verdad: docs/LICENSING_STRATEGY.md (el porqué — Opción C, 6
 * capas), docs/LICENSING.md (la spec) y docs/poc/licencia-poc.mjs (el PoC
 * 9/9 del que este paquete es la versión endurecida).
 */

export { signLicense, verifyLicense } from "./signature.js";
export { deriveFingerprint } from "./fingerprint.js";
export {
  DEFAULT_WARN_DAYS,
  evaluateLicense,
  exceedsLimits,
  isExpired,
  isModuleLicensed,
  isWithinGrace,
} from "./evaluate.js";
export { LicenseState } from "./types.js";
export type {
  EvaluationContext,
  EvaluationReason,
  ExceededLimit,
  LicenseActuals,
  LicenseEdition,
  LicenseEvaluation,
  LicenseLimits,
  LicenseModule,
  LicensePayload,
  MachineSignals,
  VerifyFailureReason,
  VerifyLicenseResult,
} from "./types.js";
