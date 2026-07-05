/**
 * Contratos del licenciamiento Lyra WatchLog (LICENSING.md §3/§5).
 *
 * Estos tipos viven en `@lyra/licensing` (NO en `@lyra/contracts`) a propósito:
 * el web nunca debe consumir el `LicensePayload` completo (contiene huella y
 * linaje); el banner de estado del front (L6) consumirá un DTO delgado que se
 * definirá en contracts recién en L2/L6, mapeado desde `LicenseEvaluation`.
 * Ver DECISIONS 2026-07-04 (L0).
 *
 * El licenciamiento gobierna la INSTALACIÓN (entitlement): es un eje distinto
 * del RBAC/ABAC, que gobierna al USUARIO (LICENSING.md §1).
 */

/** Paquete comercial; mapea a `modules` + `limits` al emitir (LICENSING.md §3). */
export type LicenseEdition = "starter" | "professional" | "enterprise";

/**
 * Clave de módulo licenciable (ej. "core", "incidents", "work-orders").
 * Es DATO del payload emitido, no una constante del código: agregar un módulo
 * al producto no exige tocar esta librería.
 */
export type LicenseModule = string;

/** Topes duros de la instalación (evitan el sobre-despliegue). */
export interface LicenseLimits {
  maxInstallations: number;
  maxNodes: number;
  maxNamedUsers: number;
}

/**
 * Payload JSON que viaja firmado dentro del JWS compacto (`license.lic`).
 * La firma va en el sobre JWS, NUNCA dentro del payload; el algoritmo vive
 * solo en la cabecera JWS y el verificador lo fija a EdDSA (RFC 8725).
 */
export interface LicensePayload {
  licenseId: string;
  issuer: string;
  /** Fechas en ISO 8601 UTC (ej. "2026-07-01T00:00:00Z"). */
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  /** Días de gracia tras `expiresAt` antes de degradar a solo lectura. */
  graceDays: number;

  channelPartner: string;
  customer: string;
  /** Identifica ESTA instalación; junto a `fingerprint` forma el node-lock. */
  installationId: string;
  /** Huella de máquina emitida (`deriveFingerprint`); debe calzar en runtime. */
  fingerprint: string;

  edition: LicenseEdition;
  modules: LicenseModule[];
  limits: LicenseLimits;

  whiteLabel: boolean;
  supportTier: string;
  schemaVersion: number;

  /**
   * Linaje rotatorio (capa 4 — detección de sobre-despliegue). Declarados
   * desde ya para no re-versionar el esquema; su FLUJO (challenge-response
   * de renovación por USB) se construye en L4.
   */
  renewalCounter: number;
  nonce: string;
}

/** Motivo tipado por el que `verifyLicense` rechaza un archivo de licencia. */
export type VerifyFailureReason =
  | "MALFORMED_JWS"
  | "UNSUPPORTED_ALG"
  | "INVALID_SIGNATURE"
  | "INVALID_PAYLOAD";

/** Resultado tipado de `verifyLicense`: nunca lanza por entrada corrupta. */
export type VerifyLicenseResult =
  | { ok: true; payload: LicensePayload }
  | { ok: false; reason: VerifyFailureReason; detail?: string };

/**
 * Señales del host con las que se deriva la huella (node-lock, capa 2).
 * PURAS: L1 las recolecta del SO; esta librería solo las hashea.
 */
export interface MachineSignals {
  /** /etc/machine-id (Linux) o MachineGuid (Windows). */
  machineId?: string;
  cpuModel?: string;
  diskSerial?: string;
  /** El orden no importa: se canonicaliza (se ordena) antes de hashear. */
  macAddresses?: string[];
  hostname?: string;
  osPlatform?: string;
  /** Señales adicionales que L1 quiera sumar (ej. TPM físico si existe). */
  extra?: Record<string, string | undefined>;
}

/** Conteos reales de la instalación, contrastados contra `limits`. */
export interface LicenseActuals {
  installations?: number;
  nodes?: number;
  namedUsers?: number;
}

/**
 * Estados de la máquina de estados de LICENSING.md §5.
 * NUNCA hay un estado destructivo: el peor caso operacional es
 * SOLO_LECTURA/BLOQUEADA = solo lectura + exportación. Los datos son del
 * cliente; jamás se borran ni se cifran por licencia.
 */
export const LicenseState = {
  VALIDA: "VALIDA",
  POR_VENCER: "POR_VENCER",
  EN_GRACIA: "EN_GRACIA",
  SOLO_LECTURA: "SOLO_LECTURA",
  LIMITE_EXCEDIDO: "LIMITE_EXCEDIDO",
  MODULO_NO_LICENCIADO: "MODULO_NO_LICENCIADO",
  BLOQUEADA: "BLOQUEADA",
} as const;
export type LicenseState = (typeof LicenseState)[keyof typeof LicenseState];

/** Motivo legible-por-máquina que acompaña al estado evaluado. */
export type EvaluationReason =
  | "INVALID_TEMPORAL_FIELDS"
  | "FINGERPRINT_MISMATCH"
  | "NOT_YET_VALID"
  | "EXPIRED_IN_GRACE"
  | "EXPIRED_BEYOND_GRACE"
  | "LIMITS_EXCEEDED"
  | "MODULE_NOT_LICENSED"
  | "EXPIRING_SOON";

/** Un límite superado: qué tope, cuál era el máximo y cuánto hay realmente. */
export interface ExceededLimit {
  limit: keyof LicenseLimits;
  max: number;
  actual: number;
}

/**
 * Contexto de evaluación. TODO lo temporal entra por `now` (nada de
 * `Date.now()` interno) para que la evaluación sea pura y testeable.
 */
export interface EvaluationContext {
  now: Date;
  /** Huella derivada en runtime, a contrastar con `payload.fingerprint`. */
  fingerprint: string;
  actuals?: LicenseActuals;
  /** Si viene, se evalúa además el entitlement de ese módulo. */
  moduleKey?: LicenseModule;
  /** Umbral en días para POR_VENCER (default: DEFAULT_WARN_DAYS). */
  warnDays?: number;
}

/** Resultado de `evaluateLicense`. */
export interface LicenseEvaluation {
  state: LicenseState;
  reason?: EvaluationReason;
  /** Días (enteros, piso) hasta `expiresAt`; negativo si ya venció. */
  daysToExpiry?: number;
  /** Presente solo cuando `state === LIMITE_EXCEDIDO`. */
  exceeded?: ExceededLimit[];
}
