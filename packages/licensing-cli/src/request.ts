import { readFileSync } from "node:fs";

/**
 * `solicitud.lreq` — el archivo de activación que la instalación escribe sola
 * al arrancar sin licencia (L1, `LicenseService.writeActivationRequest`). Es la
 * mitad "challenge" de la ceremonia del runbook (LICENSING_PROCEDURE §2 Fase B):
 * la CLI toma de aquí el `installationId` y la HUELLA (node-lock real).
 */
export interface ActivationRequest {
  product: string;
  schemaVersion: number;
  installationId: string;
  fingerprint: string;
  generatedAt: string;
}

/**
 * `renovacion.lreq` — la solicitud de RENOVACIÓN que la instalación escribe y
 * refresca sola mientras exista una licencia verificada (L4). Además de la
 * identidad/huella de la activación, presenta el LINAJE local (counter + nonce
 * de `LicenseInstallation`) y el `licenseId` vigente: el insumo con el que el
 * emisor detecta el clon (linaje repetido en el ledger) y ata la respuesta
 * para que solo se pueda importar UNA vez (LICENSING_STRATEGY §4, PoC T6).
 */
export interface RenewalRequest extends ActivationRequest {
  type: "renewal";
  licenseId: string;
  renewalCounter: number;
  nonce: string;
}

const FINGERPRINT_RE = /^[0-9a-f]{32}$/;

function requireBaseRequest(value: unknown, source: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${source}: la solicitud no es un objeto JSON`);
  }
  const record = value as Record<string, unknown>;
  if (record.product !== "lyra-watchlog") {
    throw new Error(`${source}: campo "product" inválido (se esperaba "lyra-watchlog")`);
  }
  return record;
}

/** Valida un objeto ya parseado como solicitud de activación. */
export function parseActivationRequest(value: unknown, source: string): ActivationRequest {
  const record = requireBaseRequest(value, source);
  if (record.type === "renewal") {
    throw new Error(
      `${source}: es una solicitud de RENOVACIÓN (renovacion.lreq), no de activación — usa \`lyra-license renew\``,
    );
  }
  if (typeof record.schemaVersion !== "number" || !Number.isInteger(record.schemaVersion)) {
    throw new Error(`${source}: campo "schemaVersion" ausente o no es entero`);
  }
  if (typeof record.installationId !== "string" || record.installationId.trim().length === 0) {
    throw new Error(`${source}: campo "installationId" ausente o vacío`);
  }
  if (typeof record.fingerprint !== "string" || !FINGERPRINT_RE.test(record.fingerprint)) {
    throw new Error(`${source}: campo "fingerprint" inválido (se esperaban 32 hex minúsculas)`);
  }
  if (typeof record.generatedAt !== "string" || Number.isNaN(Date.parse(record.generatedAt))) {
    throw new Error(`${source}: campo "generatedAt" ausente o no es fecha ISO`);
  }
  return {
    product: "lyra-watchlog",
    schemaVersion: record.schemaVersion,
    installationId: record.installationId.trim(),
    fingerprint: record.fingerprint,
    generatedAt: record.generatedAt,
  };
}

/** Valida un objeto ya parseado como solicitud de renovación (con linaje). */
export function parseRenewalRequest(value: unknown, source: string): RenewalRequest {
  const record = requireBaseRequest(value, source);
  if (record.type !== "renewal") {
    throw new Error(
      `${source}: no es una solicitud de renovación (falta type="renewal") — para activar usa \`lyra-license issue\``,
    );
  }
  if (typeof record.schemaVersion !== "number" || !Number.isInteger(record.schemaVersion)) {
    throw new Error(`${source}: campo "schemaVersion" ausente o no es entero`);
  }
  if (typeof record.installationId !== "string" || record.installationId.trim().length === 0) {
    throw new Error(`${source}: campo "installationId" ausente o vacío`);
  }
  if (typeof record.fingerprint !== "string" || !FINGERPRINT_RE.test(record.fingerprint)) {
    throw new Error(`${source}: campo "fingerprint" inválido (se esperaban 32 hex minúsculas)`);
  }
  if (typeof record.licenseId !== "string" || record.licenseId.trim().length === 0) {
    throw new Error(`${source}: campo "licenseId" ausente o vacío`);
  }
  if (
    typeof record.renewalCounter !== "number" ||
    !Number.isInteger(record.renewalCounter) ||
    record.renewalCounter < 0
  ) {
    throw new Error(`${source}: campo "renewalCounter" ausente o no es entero ≥ 0`);
  }
  if (typeof record.nonce !== "string" || record.nonce.trim().length === 0) {
    throw new Error(`${source}: campo "nonce" ausente o vacío (linaje local sin inicializar)`);
  }
  if (typeof record.generatedAt !== "string" || Number.isNaN(Date.parse(record.generatedAt))) {
    throw new Error(`${source}: campo "generatedAt" ausente o no es fecha ISO`);
  }
  return {
    product: "lyra-watchlog",
    schemaVersion: record.schemaVersion,
    type: "renewal",
    installationId: record.installationId.trim(),
    fingerprint: record.fingerprint,
    licenseId: record.licenseId.trim(),
    renewalCounter: record.renewalCounter,
    nonce: record.nonce,
    generatedAt: record.generatedAt,
  };
}

function readRequestJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`no se pudo leer la solicitud ${path}: ${String(err)}`);
  }
}

/** Lee y valida un `solicitud.lreq` desde disco. */
export function readActivationRequest(path: string): ActivationRequest {
  return parseActivationRequest(readRequestJson(path), path);
}

/** Lee y valida un `renovacion.lreq` desde disco. */
export function readRenewalRequest(path: string): RenewalRequest {
  return parseRenewalRequest(readRequestJson(path), path);
}
