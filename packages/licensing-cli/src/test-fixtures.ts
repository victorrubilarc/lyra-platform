import { generateKeyPairSync } from "node:crypto";

import type { IssueParams } from "./issue.js";
import type { ActivationRequest } from "./request.js";

/** Fixtures compartidos de los tests de la CLI (no se compilan a dist). */

export const FIXTURE_FINGERPRINT = "0123456789abcdef0123456789abcdef";

export function makeRequestFixture(overrides: Partial<ActivationRequest> = {}): ActivationRequest {
  return {
    product: "lyra-watchlog",
    schemaVersion: 1,
    installationId: "inst_test_fixture",
    fingerprint: FIXTURE_FINGERPRINT,
    generatedAt: "2026-07-05T12:00:00.000Z",
    ...overrides,
  };
}

export function makeIssueParamsFixture(overrides: Partial<IssueParams> = {}): IssueParams {
  return {
    customer: "Minera Prueba",
    channelPartner: "SOCIO_TEST",
    edition: "professional",
    modules: ["core", "logbook", "incidents"],
    limits: { maxNodes: 200, maxNamedUsers: 80 },
    expiresAt: "2036-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Par Ed25519 efímero EN CLARO para tests (equivalente al par DEV). */
export function makeKeyPair(): { privateKeyPem: string; publicKeyPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519", {
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  return { privateKeyPem: privateKey, publicKeyPem: publicKey };
}
