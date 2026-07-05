import type {
  EvaluationContext,
  ExceededLimit,
  LicenseActuals,
  LicenseEvaluation,
  LicenseLimits,
  LicenseModule,
  LicensePayload,
} from "./types.js";
import { LicenseState } from "./types.js";

const DAY_MS = 86_400_000;

/** Umbral por defecto (días antes de `expiresAt`) para el estado POR_VENCER. */
export const DEFAULT_WARN_DAYS = 30;

/** ¿`now` ya pasó `expiresAt`? (el instante exacto de vencimiento aún vale). */
export function isExpired(payload: Pick<LicensePayload, "expiresAt">, now: Date): boolean {
  return now.getTime() > Date.parse(payload.expiresAt);
}

/** ¿Venció pero sigue dentro de la ventana de gracia (`graceDays`)? */
export function isWithinGrace(
  payload: Pick<LicensePayload, "expiresAt" | "graceDays">,
  now: Date,
): boolean {
  const expiresAt = Date.parse(payload.expiresAt);
  const nowMs = now.getTime();
  return nowMs > expiresAt && nowMs <= expiresAt + payload.graceDays * DAY_MS;
}

/** ¿El módulo está dentro del entitlement (`modules[]`) de la licencia? */
export function isModuleLicensed(
  payload: Pick<LicensePayload, "modules">,
  moduleKey: LicenseModule,
): boolean {
  return payload.modules.includes(moduleKey);
}

/**
 * Contrasta los conteos reales contra los topes de la licencia. Un conteo
 * ausente (undefined) no se evalúa: L1 pasa solo lo que puede medir.
 */
export function exceedsLimits(limits: LicenseLimits, actuals: LicenseActuals): ExceededLimit[] {
  const exceeded: ExceededLimit[] = [];
  const compare = (limit: keyof LicenseLimits, max: number, actual: number | undefined): void => {
    if (actual !== undefined && actual > max) exceeded.push({ limit, max, actual });
  };
  compare("maxInstallations", limits.maxInstallations, actuals.installations);
  compare("maxNodes", limits.maxNodes, actuals.nodes);
  compare("maxNamedUsers", limits.maxNamedUsers, actuals.namedUsers);
  return exceeded;
}

/**
 * Máquina de estados de LICENSING.md §5, PURA. Asume que el payload ya pasó
 * `verifyLicense` (firma OK): aquí solo se evalúa la POLÍTICA. Se separan a
 * propósito — la verificación distribuida (L1/L2) reusa cada pieza por
 * separado, sin un único `if` desactivable.
 *
 * Precedencia (de peor a mejor): BLOQUEADA (huella no calza / aún no válida /
 * campos temporales inválidos) → SOLO_LECTURA (vencida pasada la gracia) →
 * EN_GRACIA → LIMITE_EXCEDIDO → MODULO_NO_LICENCIADO (solo si viene
 * `moduleKey`) → POR_VENCER → VALIDA.
 *
 * NUNCA hay un estado destructivo: BLOQUEADA/SOLO_LECTURA significan, para
 * quien consume esta evaluación, "solo lectura + exportación". Los datos son
 * del cliente; jamás se borran ni se cifran por licencia.
 */
export function evaluateLicense(
  payload: LicensePayload,
  ctx: EvaluationContext,
): LicenseEvaluation {
  const nowMs = ctx.now.getTime();
  const notBefore = Date.parse(payload.notBefore);
  const expiresAt = Date.parse(payload.expiresAt);
  if (
    !Number.isFinite(nowMs) ||
    Number.isNaN(notBefore) ||
    Number.isNaN(expiresAt) ||
    !Number.isFinite(payload.graceDays) ||
    payload.graceDays < 0
  ) {
    return { state: LicenseState.BLOQUEADA, reason: "INVALID_TEMPORAL_FIELDS" };
  }
  const daysToExpiry = Math.floor((expiresAt - nowMs) / DAY_MS);

  if (payload.fingerprint !== ctx.fingerprint) {
    return { state: LicenseState.BLOQUEADA, reason: "FINGERPRINT_MISMATCH", daysToExpiry };
  }
  if (nowMs < notBefore) {
    return { state: LicenseState.BLOQUEADA, reason: "NOT_YET_VALID", daysToExpiry };
  }
  if (isExpired(payload, ctx.now)) {
    if (isWithinGrace(payload, ctx.now)) {
      return { state: LicenseState.EN_GRACIA, reason: "EXPIRED_IN_GRACE", daysToExpiry };
    }
    return { state: LicenseState.SOLO_LECTURA, reason: "EXPIRED_BEYOND_GRACE", daysToExpiry };
  }

  const exceeded = exceedsLimits(payload.limits, ctx.actuals ?? {});
  if (exceeded.length > 0) {
    return { state: LicenseState.LIMITE_EXCEDIDO, reason: "LIMITS_EXCEEDED", daysToExpiry, exceeded };
  }
  if (ctx.moduleKey !== undefined && !isModuleLicensed(payload, ctx.moduleKey)) {
    return { state: LicenseState.MODULO_NO_LICENCIADO, reason: "MODULE_NOT_LICENSED", daysToExpiry };
  }
  if (daysToExpiry <= (ctx.warnDays ?? DEFAULT_WARN_DAYS)) {
    return { state: LicenseState.POR_VENCER, reason: "EXPIRING_SOON", daysToExpiry };
  }
  return { state: LicenseState.VALIDA, daysToExpiry };
}
