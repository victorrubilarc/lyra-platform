import type {
  EvaluationReason,
  LicenseEvaluation,
  LicenseState,
  VerifyFailureReason,
} from "@lyra/licensing";
import type { LicenseStatus } from "@lyra/contracts";

/**
 * Estado de licencia en RUNTIME de la API. Extiende los 7 estados puros de
 * `@lyra/licensing` (que siempre evalúan UN payload) con el caso "no hay
 * archivo de licencia todavía": PENDIENTE_ACTIVACION, la variante presentable
 * de BLOQUEADA del runbook (LICENSING_PROCEDURE.md §2 — la instalación recién
 * desplegada deja configurar lo mínimo pero no opera). NO se agrega al enum de
 * L0 a propósito: no es la evaluación de una licencia, es la ausencia de una.
 */
export const PENDING_ACTIVATION = "PENDIENTE_ACTIVACION" as const;
export type LicenseRuntimeStatus = LicenseState | typeof PENDING_ACTIVATION;

/** Motivo del estado runtime: los de evaluación/verificación de L0 + ausencia. */
export type LicenseRuntimeReason =
  | EvaluationReason
  | VerifyFailureReason
  | "LICENSE_FILE_MISSING";

/**
 * Estados en los que la instalación queda RESTRINGIDA: se bloquean las
 * mutaciones y se permite lectura + exportación (la licencia NUNCA secuestra
 * datos — LICENSING.md §5). EN_GRACIA / POR_VENCER / LIMITE_EXCEDIDO /
 * MODULO_NO_LICENCIADO no restringen en L1 (se registran; el enforcement por
 * recurso/módulo es L2).
 */
export const RESTRICTED_STATUSES: ReadonlySet<LicenseRuntimeStatus> = new Set([
  "SOLO_LECTURA",
  "BLOQUEADA",
  PENDING_ACTIVATION,
]);

/**
 * Foto cacheada del estado de licencia que consumen el guard global y los
 * chequeos distribuidos. Es el resultado de la última (re)evaluación.
 */
export interface LicenseSnapshot {
  status: LicenseRuntimeStatus;
  reason?: LicenseRuntimeReason;
  /** Evaluación completa de L0 (solo cuando hubo payload verificado). */
  evaluation?: LicenseEvaluation;
  /** Módulos habilitados por la licencia (para `isModuleLicensed`, L2). */
  licensedModules?: readonly string[];
  /** Datos presentables (log/auditoría; a la web solo viaja `toLicenseStatus`). */
  licenseId?: string;
  customer?: string;
  edition?: string;
  expiresAt?: string;
  /** Huella derivada de la máquina real en este arranque. */
  fingerprint: string;
  installationId: string;
  checkedAt: Date;
}

/**
 * Mapea el snapshot interno al DTO DELGADO que consume la web (L2; cimiento
 * del banner L6). MÍNIMO PRIVILEGIO (DECISIONS 2026-07-05): construye el
 * objeto campo a campo — jamás un spread del snapshot — para que huella,
 * linaje, installationId, licenseId y customer NO puedan filtrarse aunque el
 * snapshot crezca. `modules: null` = sin payload verificado (el front entonces
 * no oculta por módulo; los estados restringidos ya los gobierna el guard L1).
 */
export function toLicenseStatus(snap: LicenseSnapshot): LicenseStatus {
  return {
    status: snap.status,
    reason: snap.reason,
    edition: snap.edition,
    modules: snap.licensedModules === undefined ? null : [...snap.licensedModules],
    expiresAt: snap.expiresAt,
    daysToExpiry: snap.evaluation?.daysToExpiry,
  };
}
