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

const FINGERPRINT_RE = /^[0-9a-f]{32}$/;

/** Valida un objeto ya parseado como solicitud de activación. */
export function parseActivationRequest(value: unknown, source: string): ActivationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${source}: la solicitud no es un objeto JSON`);
  }
  const record = value as Record<string, unknown>;
  if (record.product !== "lyra-watchlog") {
    throw new Error(`${source}: campo "product" inválido (se esperaba "lyra-watchlog")`);
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
    product: record.product,
    schemaVersion: record.schemaVersion,
    installationId: record.installationId.trim(),
    fingerprint: record.fingerprint,
    generatedAt: record.generatedAt,
  };
}

/** Lee y valida un `solicitud.lreq` desde disco. */
export function readActivationRequest(path: string): ActivationRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new Error(`no se pudo leer la solicitud ${path}: ${String(err)}`);
  }
  return parseActivationRequest(parsed, path);
}
