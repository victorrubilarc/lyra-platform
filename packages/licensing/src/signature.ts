import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";

import { fromBase64Url, toBase64Url } from "./jws.js";
import type { LicensePayload, VerifyLicenseResult } from "./types.js";

/**
 * Firma y verificación Ed25519 del archivo de licencia (capa 1 de
 * LICENSING_STRATEGY §6): solo ITESICWS puede EMITIR (clave privada, jamás en
 * repo/imagen/.env — aquí entra por parámetro); cualquier instalación puede
 * VERIFICAR (clave pública embebida en la app).
 *
 * El algoritmo lo fija el VERIFICADOR (EdDSA): la cabecera del archivo no se
 * obedece, solo se valida que coincida — mitiga la confusión de algoritmo
 * (RFC 8725 §3.1). Por lo mismo el payload NO lleva campo de algoritmo.
 */
const JWS_ALG = "EdDSA";
const JWS_HEADER = { alg: JWS_ALG, typ: "JWT" } as const;

function assertEd25519Key(key: KeyObject, role: "privada" | "pública"): void {
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(
      `Se esperaba una clave ${role} Ed25519 y se recibió "${key.asymmetricKeyType ?? "desconocida"}"`,
    );
  }
}

/**
 * Emite el JWS compacto (`license.lic`) firmando el payload con la clave
 * privada de emisión. La usará la CLI de emisión (L3).
 *
 * Lanza si el PEM es inválido o no es Ed25519: eso es un error de quien llama
 * (misconfiguración del emisor), no un estado de licencia.
 */
export function signLicense(payload: LicensePayload, privateKeyPem: string): string {
  const key = createPrivateKey(privateKeyPem);
  assertEd25519Key(key, "privada");
  const header = toBase64Url(JSON.stringify(JWS_HEADER));
  const body = toBase64Url(JSON.stringify(payload));
  const signature = sign(null, Buffer.from(`${header}.${body}`), key);
  return `${header}.${body}.${toBase64Url(signature)}`;
}

/**
 * Verifica la firma de un `license.lic` con la clave pública embebida.
 * Resultado tipado, sin excepciones tragadas: entrada corrupta/adulterada
 * devuelve `{ ok: false, reason }`; un PEM público inválido sí lanza
 * (misconfiguración del build, no un ataque).
 *
 * Orden deliberado: cabecera → algoritmo → FIRMA → recién ahí se interpreta
 * el payload (no se parsea contenido cuya firma no calza).
 */
export function verifyLicense(lic: string, publicKeyPem: string): VerifyLicenseResult {
  const publicKey = createPublicKey(publicKeyPem);
  assertEd25519Key(publicKey, "pública");

  const parts = lic.split(".");
  if (parts.length !== 3 || parts.some((part) => part.length === 0)) {
    return {
      ok: false,
      reason: "MALFORMED_JWS",
      detail: "se esperaban 3 segmentos no vacíos: cabecera.payload.firma",
    };
  }
  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  let header: unknown;
  try {
    header = JSON.parse(fromBase64Url(headerB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "MALFORMED_JWS", detail: "la cabecera no es JSON válido" };
  }
  if (typeof header !== "object" || header === null || (header as { alg?: unknown }).alg !== JWS_ALG) {
    return { ok: false, reason: "UNSUPPORTED_ALG", detail: `solo se acepta alg=${JWS_ALG}` };
  }

  let signatureOk = false;
  try {
    signatureOk = verify(
      null,
      Buffer.from(`${headerB64}.${payloadB64}`),
      publicKey,
      fromBase64Url(signatureB64),
    );
  } catch {
    signatureOk = false;
  }
  if (!signatureOk) {
    return {
      ok: false,
      reason: "INVALID_SIGNATURE",
      detail: "la firma no corresponde al contenido o a la clave pública embebida",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fromBase64Url(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "INVALID_PAYLOAD", detail: "el payload firmado no es JSON válido" };
  }
  const structuralError = payloadShapeError(parsed);
  if (structuralError !== null) {
    return { ok: false, reason: "INVALID_PAYLOAD", detail: structuralError };
  }
  return { ok: true, payload: parsed as LicensePayload };
}

const STRING_FIELDS = [
  "licenseId",
  "issuer",
  "issuedAt",
  "notBefore",
  "expiresAt",
  "channelPartner",
  "customer",
  "installationId",
  "fingerprint",
  "edition",
  "supportTier",
  "nonce",
] as const;

const NUMBER_FIELDS = ["graceDays", "schemaVersion", "renewalCounter"] as const;

const LIMIT_FIELDS = ["maxInstallations", "maxNodes", "maxNamedUsers"] as const;

/** Valida la forma mínima de `LicensePayload`; retorna el defecto o null. */
function payloadShapeError(value: unknown): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return "el payload no es un objeto";
  }
  const record = value as Record<string, unknown>;
  for (const field of STRING_FIELDS) {
    if (typeof record[field] !== "string" || record[field] === "") {
      return `campo "${field}" ausente o no es string`;
    }
  }
  for (const field of NUMBER_FIELDS) {
    if (typeof record[field] !== "number" || !Number.isFinite(record[field])) {
      return `campo "${field}" ausente o no es número`;
    }
  }
  if (typeof record.whiteLabel !== "boolean") {
    return 'campo "whiteLabel" ausente o no es booleano';
  }
  const modules = record.modules;
  if (!Array.isArray(modules) || modules.some((m) => typeof m !== "string")) {
    return 'campo "modules" ausente o no es arreglo de strings';
  }
  const limits = record.limits;
  if (typeof limits !== "object" || limits === null) {
    return 'campo "limits" ausente o no es objeto';
  }
  for (const field of LIMIT_FIELDS) {
    const limit = (limits as Record<string, unknown>)[field];
    if (typeof limit !== "number" || !Number.isFinite(limit)) {
      return `campo "limits.${field}" ausente o no es número`;
    }
  }
  return null;
}
