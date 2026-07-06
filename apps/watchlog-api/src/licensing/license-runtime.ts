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

/**
 * Motivo del estado runtime: los de evaluación/verificación de L0 + ausencia
 * de archivo + linaje que no calza (L4: la respuesta de renovación solo se
 * importa UNA vez y solo en la instalación que la pidió; una licencia cuyo
 * linaje no corresponde al local ⇒ BLOQUEADA con este motivo — restringido,
 * jamás destructivo) + integridad rota (L5: el artefacto sellado en el build
 * de release no calza con su sello ⇒ BLOQUEADA, también restringido: el
 * fallo de integridad NUNCA se vuelve destructivo).
 */
export type LicenseRuntimeReason =
  | EvaluationReason
  | VerifyFailureReason
  | "LICENSE_FILE_MISSING"
  | "LINEAGE_MISMATCH"
  | "INTEGRITY_MISMATCH";

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
  /**
   * Días que quedan de la ventana de gracia (solo en EN_GRACIA, L6): derivado
   * de `graceDays + daysToExpiry` (negativo). Alimenta el banner "renovar en X
   * días" — decisión L6a, único campo nuevo del DTO delgado.
   */
  graceDaysRemaining?: number;
  /** Gate LATENTE de marca blanca (L6d): `whiteLabel` del payload verificado. Hoy sin efecto visible. */
  whiteLabel?: boolean;
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
    // L6a: solo en EN_GRACIA ("renovar en X días"). `whiteLabel` NO viaja (gate latente).
    graceDaysRemaining: snap.graceDaysRemaining,
  };
}
