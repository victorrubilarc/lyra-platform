import { createHash, createPublicKey, randomUUID } from "node:crypto";

import { CORE_MODULE_KEY, LICENSED_MODULE_KEYS } from "@lyra/contracts";
import {
  LicenseState,
  evaluateLicense,
  signLicense,
  verifyLicense,
  type LicenseEdition,
  type LicensePayload,
} from "@lyra/licensing";

import type { ActivationRequest } from "./request.js";

/**
 * Emisión de licencias (LICENSING.md §6): arma el `LicensePayload` con la
 * huella de la SOLICITUD (node-lock real), lo firma con la privada de emisión
 * (que entra por parámetro, ya descifrada EN MEMORIA por el keystore) y
 * auto-verifica el resultado antes de entregarlo. TODA la criptografía es de
 * `@lyra/licensing` — aquí no se re-implementa nada.
 *
 * Esta pieza es LA implementación única de emisión: la usan la CLI
 * (`lyra-license issue`, par PROD bajo custodia) y el envoltorio DEV de la API
 * (`pnpm license:dev`, par DEV committeado).
 */

const DAY_MS = 86_400_000;

export const LICENSE_EDITIONS = ["starter", "professional", "enterprise"] as const;

const KNOWN_MODULES: ReadonlySet<string> = new Set(LICENSED_MODULE_KEYS);

export interface IssueParams {
  customer: string;
  channelPartner: string;
  edition: LicenseEdition;
  modules: string[];
  limits: { maxInstallations?: number; maxNodes: number; maxNamedUsers: number };
  /** Vencimiento ISO 8601 (fecha o fecha-hora). Debe ser futuro salvo `allowPast`. */
  expiresAt: string;
  graceDays?: number;
  notBefore?: string;
  licenseId?: string;
  issuer?: string;
  whiteLabel?: boolean;
  supportTier?: string;
  /** SOLO para dev/tests (licencias vencidas de smoke). La CLI lo expone como --allow-past. */
  allowPast?: boolean;
  /**
   * Linaje de RENOVACIÓN (L4): counter = presentado + 1 y nonce = el nonce
   * PRESENTADO en la solicitud (el binding que hace la respuesta importable
   * UNA sola vez — el nonce nuevo lo genera la instalación al rotar y nunca
   * viaja). Ausente = emisión de activación (counter 0, nonce fresco inerte).
   */
  lineage?: { renewalCounter: number; nonce: string };
}

export interface IssuedLicense {
  /** El JWS compacto listo para escribirse como `license.lic`. */
  lic: string;
  payload: LicensePayload;
  /** sha256 (hex) del archivo emitido — va al ledger. */
  licSha256: string;
  /** Identificador corto del par firmante (sha256 del SPKI de la pública). */
  publicKeyId: string;
}

function parseIsoInstant(value: string, field: string): number {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`"${field}" no es una fecha ISO 8601 válida: ${value}`);
  }
  return ms;
}

function requireText(value: string | undefined, field: string): string {
  const text = value?.trim();
  if (text === undefined || text.length === 0) {
    throw new Error(`falta el parámetro obligatorio "${field}"`);
  }
  return text;
}

function requirePositiveInt(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`"${field}" debe ser un entero positivo (recibido: ${value})`);
  }
  return value;
}

/**
 * Valida el entitlement pedido contra el catálogo canónico de `@lyra/contracts`
 * (LICENSING.md §5.1). `core` se incluye siempre: jamás se gatea y sin él la
 * instalación ni siquiera podría leer/exportar.
 */
export function normalizeModules(modules: string[]): string[] {
  const cleaned = modules.map((m) => m.trim()).filter((m) => m.length > 0);
  if (cleaned.length === 0) {
    throw new Error("se requiere al menos un módulo (--modules)");
  }
  const unknown = cleaned.filter((m) => !KNOWN_MODULES.has(m));
  if (unknown.length > 0) {
    throw new Error(
      `módulos desconocidos: ${unknown.join(", ")} (catálogo: ${LICENSED_MODULE_KEYS.join(", ")})`,
    );
  }
  const unique = [...new Set(cleaned)];
  if (!unique.includes(CORE_MODULE_KEY)) unique.unshift(CORE_MODULE_KEY);
  return unique;
}

/** Slug corto y estable del cliente para el `licenseId` por defecto. */
function customerSlug(customer: string): string {
  const slug = customer
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
  return slug.length > 0 ? slug : "cliente";
}

/**
 * Emite una licencia: valida parámetros comerciales, arma el payload con la
 * huella de la solicitud, firma y AUTO-VERIFICA (round-trip con la pública
 * derivada de la misma privada + node-lock contra la huella de la solicitud).
 * `now` es inyectable para tests; `sequence` alimenta el `licenseId` default.
 */
export function issueLicense(opts: {
  request: ActivationRequest;
  privateKeyPem: string;
  params: IssueParams;
  now?: Date;
  /** Número correlativo (típicamente `ledger.length + 1`) para el licenseId default. */
  sequence?: number;
}): IssuedLicense {
  const { request, privateKeyPem, params } = opts;
  const now = opts.now ?? new Date();

  const customer = requireText(params.customer, "customer");
  const channelPartner = requireText(params.channelPartner, "channel-partner");
  if (!LICENSE_EDITIONS.includes(params.edition)) {
    throw new Error(
      `edición inválida "${String(params.edition)}" (válidas: ${LICENSE_EDITIONS.join(", ")})`,
    );
  }
  const modules = normalizeModules(params.modules);

  const lineage = params.lineage;
  if (lineage !== undefined) {
    if (!Number.isInteger(lineage.renewalCounter) || lineage.renewalCounter < 1) {
      throw new Error(
        `"lineage.renewalCounter" debe ser un entero ≥ 1 (recibido: ${lineage.renewalCounter})`,
      );
    }
    if (lineage.nonce.trim().length === 0) {
      throw new Error('"lineage.nonce" no puede estar vacío');
    }
  }

  const expiresMs = parseIsoInstant(params.expiresAt, "expires");
  if (!params.allowPast && expiresMs <= now.getTime()) {
    throw new Error(`"expires" ya pasó (${params.expiresAt}); usa --allow-past solo para pruebas`);
  }
  const graceDays = params.graceDays ?? 14;
  if (!Number.isInteger(graceDays) || graceDays < 0) {
    throw new Error(`"grace-days" debe ser un entero ≥ 0 (recibido: ${graceDays})`);
  }
  // notBefore: 24 h hacia atrás por defecto, tolera desfases de reloj de la
  // planta (y si se emite vencida a propósito, 24 h antes del vencimiento).
  const notBeforeMs =
    params.notBefore !== undefined
      ? parseIsoInstant(params.notBefore, "not-before")
      : Math.min(now.getTime(), expiresMs) - DAY_MS;
  if (notBeforeMs >= expiresMs) {
    throw new Error(`"not-before" debe ser anterior a "expires"`);
  }

  const limits = {
    maxInstallations: requirePositiveInt(params.limits.maxInstallations ?? 1, "max-installations"),
    maxNodes: requirePositiveInt(params.limits.maxNodes, "max-nodes"),
    maxNamedUsers: requirePositiveInt(params.limits.maxNamedUsers, "max-named-users"),
  };

  const payload: LicensePayload = {
    licenseId:
      params.licenseId?.trim() ||
      `lic_${now.toISOString().slice(0, 4)}_${customerSlug(customer)}_${String(opts.sequence ?? 1).padStart(3, "0")}`,
    issuer: params.issuer?.trim() || "ITESICWS",
    issuedAt: now.toISOString(),
    notBefore: new Date(notBeforeMs).toISOString(),
    expiresAt: new Date(expiresMs).toISOString(),
    graceDays,
    channelPartner,
    customer,
    installationId: request.installationId,
    fingerprint: request.fingerprint,
    edition: params.edition,
    modules,
    limits,
    whiteLabel: params.whiteLabel ?? true,
    supportTier: params.supportTier?.trim() || "L2",
    schemaVersion: 1,
    // Linaje (capa 4): la activación parte en 0 con nonce fresco (inerte para
    // el runtime); la renovación viene atada al linaje presentado (`lineage`).
    renewalCounter: lineage?.renewalCounter ?? 0,
    nonce: lineage?.nonce ?? randomUUID(),
  };

  const lic = signLicense(payload, privateKeyPem);

  // Auto-verificación (QA del emisor): la pública derivada de ESTA privada debe
  // aceptar la firma y el node-lock debe calzar con la huella de la solicitud.
  const publicKeyPem = createPublicKey(privateKeyPem)
    .export({ type: "spki", format: "pem" })
    .toString();
  const verified = verifyLicense(lic, publicKeyPem);
  if (!verified.ok) {
    throw new Error(`auto-verificación falló (${verified.reason}): emisión abortada`);
  }
  const evaluation = evaluateLicense(verified.payload, {
    now,
    fingerprint: request.fingerprint,
  });
  if (
    evaluation.state === LicenseState.BLOQUEADA &&
    !params.allowPast // una licencia vencida a propósito evalúa SOLO_LECTURA, no BLOQUEADA
  ) {
    throw new Error(`auto-verificación falló (${evaluation.reason ?? "?"}): emisión abortada`);
  }

  return {
    lic,
    payload,
    licSha256: createHash("sha256").update(lic, "utf8").digest("hex"),
    publicKeyId: createHash("sha256")
      .update(createPublicKey(privateKeyPem).export({ type: "spki", format: "der" }))
      .digest("hex")
      .slice(0, 16),
  };
}
