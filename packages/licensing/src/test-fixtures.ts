import { generateKeyPairSync } from "node:crypto";

import type { LicensePayload } from "./types.js";

/** Par de llaves Ed25519 en PEM, SOLO para tests (se generan al vuelo). */
export function makeKeyPairPem(): { privateKeyPem: string; publicKeyPem: string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

/** Payload completo de referencia (espejo del ejemplo de LICENSING.md §3). */
export function makePayload(overrides: Partial<LicensePayload> = {}): LicensePayload {
  return {
    licenseId: "lic_2026_ACME_001",
    issuer: "ITESICWS",
    issuedAt: "2026-07-01T00:00:00Z",
    notBefore: "2026-07-01T00:00:00Z",
    expiresAt: "2026-10-01T00:00:00Z",
    graceDays: 14,
    channelPartner: "SOCIO_XYZ",
    customer: "Minera Acme",
    installationId: "inst_acme_planta_norte",
    fingerprint: "fp-servidor-a",
    edition: "professional",
    modules: ["core", "incidents", "shift-handover"],
    limits: { maxInstallations: 1, maxNodes: 200, maxNamedUsers: 80 },
    whiteLabel: true,
    supportTier: "L2",
    schemaVersion: 1,
    renewalCounter: 1,
    nonce: "nonce-inicial-0001",
    ...overrides,
  };
}
