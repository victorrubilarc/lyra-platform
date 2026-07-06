import { describe, expect, it } from "vitest";

import { evaluateLineage, verifyLicense } from "@lyra/licensing";

import { findDuplicateLineage, lastEntryForInstallation, type LedgerEntry } from "./ledger.js";
import { renewLicense } from "./renew.js";
import type { RenewalRequest } from "./request.js";
import { FIXTURE_FINGERPRINT, makeKeyPair } from "./test-fixtures.js";

const NOW = new Date("2026-07-05T12:00:00Z");

/** Entrada de ledger de fixture (los hashes no participan de renewLicense). */
function makeLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    seq: 1,
    prevHash: "GENESIS",
    hash: "hash-fixture",
    type: "issue",
    issuedAt: "2026-01-05T12:00:00.000Z",
    licenseId: "lic_2026_minera_prueba_001",
    installationId: "inst_test_fixture",
    fingerprint: FIXTURE_FINGERPRINT,
    customer: "Minera Prueba",
    channelPartner: "SOCIO_TEST",
    edition: "professional",
    modules: ["core", "logbook", "incidents"],
    limits: { maxInstallations: 1, maxNodes: 200, maxNamedUsers: 80 },
    notBefore: "2026-01-04T12:00:00.000Z",
    expiresAt: "2026-08-01T00:00:00Z",
    graceDays: 14,
    issuer: "ITESICWS",
    whiteLabel: true,
    supportTier: "L2",
    renewalCounter: 0,
    licSha256: "sha-fixture",
    publicKeyId: "par-fixture",
    ...overrides,
  };
}

function makeRenewalRequestFixture(overrides: Partial<RenewalRequest> = {}): RenewalRequest {
  return {
    product: "lyra-watchlog",
    schemaVersion: 1,
    type: "renewal",
    installationId: "inst_test_fixture",
    fingerprint: FIXTURE_FINGERPRINT,
    licenseId: "lic_2026_minera_prueba_001",
    renewalCounter: 0,
    nonce: "nonce-presentado-por-la-instalacion",
    generatedAt: "2026-07-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("renewLicense — ciclo feliz", () => {
  it("hereda los términos del ledger, conserva el licenseId y ata el linaje (counter+1, nonce presentado)", () => {
    const { privateKeyPem, publicKeyPem } = makeKeyPair();
    const renewed = renewLicense({
      request: makeRenewalRequestFixture(),
      privateKeyPem,
      ledgerEntries: [makeLedgerEntry()],
      params: { expiresAt: "2036-10-01T00:00:00Z" },
      now: NOW,
    });

    const verified = verifyLicense(renewed.lic, publicKeyPem);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const p = verified.payload;
    expect(p.licenseId).toBe("lic_2026_minera_prueba_001"); // misma licencia
    expect(p.customer).toBe("Minera Prueba");
    expect(p.channelPartner).toBe("SOCIO_TEST");
    expect(p.edition).toBe("professional");
    expect(p.modules).toEqual(["core", "logbook", "incidents"]);
    expect(p.limits).toEqual({ maxInstallations: 1, maxNodes: 200, maxNamedUsers: 80 });
    expect(p.graceDays).toBe(14);
    expect(p.expiresAt).toBe("2036-10-01T00:00:00.000Z");
    expect(p.fingerprint).toBe(FIXTURE_FINGERPRINT); // misma huella (node-lock)
    expect(p.renewalCounter).toBe(1); // presentado + 1
    expect(p.nonce).toBe("nonce-presentado-por-la-instalacion"); // el binding
    expect(renewed.forcedDuplicate).toBe(false);
    expect(renewed.acceptedNewFingerprint).toBe(false);
  });

  it("la respuesta calza (ROTATE) SOLO en la instalación que presentó ese linaje — invariante T6", () => {
    const { privateKeyPem, publicKeyPem } = makeKeyPair();
    const renewed = renewLicense({
      request: makeRenewalRequestFixture(),
      privateKeyPem,
      ledgerEntries: [makeLedgerEntry()],
      params: { expiresAt: "2036-10-01T00:00:00Z" },
      now: NOW,
    });
    const verified = verifyLicense(renewed.lic, publicKeyPem);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    // La instalación que pidió (linaje 0 + su nonce) la acepta UNA vez…
    expect(
      evaluateLineage(verified.payload, {
        renewalCounter: 0,
        nonce: "nonce-presentado-por-la-instalacion",
      }),
    ).toBe("ROTATE");
    // …tras rotar (nonce fresco local) queda CURRENT, y en cualquier otra no calza.
    expect(
      evaluateLineage(verified.payload, { renewalCounter: 1, nonce: "nonce-fresco-local" }),
    ).toBe("CURRENT");
    expect(evaluateLineage(verified.payload, { renewalCounter: 0, nonce: "otro-nonce" })).toBe(
      "MISMATCH",
    );
    expect(evaluateLineage(verified.payload, { renewalCounter: 0, nonce: null })).toBe("MISMATCH");
  });

  it("los flags explícitos hacen UPGRADE sobre lo heredado (módulos/edición/límites)", () => {
    const { privateKeyPem, publicKeyPem } = makeKeyPair();
    const renewed = renewLicense({
      request: makeRenewalRequestFixture(),
      privateKeyPem,
      ledgerEntries: [makeLedgerEntry()],
      params: {
        expiresAt: "2036-10-01T00:00:00Z",
        edition: "enterprise",
        modules: ["core", "logbook", "incidents", "shift-handover"],
        maxNamedUsers: 150,
      },
      now: NOW,
    });
    const verified = verifyLicense(renewed.lic, publicKeyPem);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.payload.edition).toBe("enterprise");
    expect(verified.payload.modules).toContain("shift-handover");
    expect(verified.payload.limits.maxNamedUsers).toBe(150);
    expect(verified.payload.limits.maxNodes).toBe(200); // lo no tocado se hereda
  });
});

describe("renewLicense — detección de clon (deniega por defecto, PoC T6)", () => {
  const renewalIssued = makeLedgerEntry({
    seq: 2,
    type: "renewal",
    renewalCounter: 1,
    presentedCounter: 0,
    presentedNonce: "nonce-de-la-primera-solicitud",
    issuedAt: "2026-07-01T12:00:00.000Z",
  });

  it("dos solicitudes con el MISMO linaje ⇒ CLON DETECTADO (la segunda se deniega)", () => {
    const { privateKeyPem } = makeKeyPair();
    expect(() =>
      renewLicense({
        request: makeRenewalRequestFixture({ renewalCounter: 0, nonce: "nonce-del-clon" }),
        privateKeyPem,
        ledgerEntries: [makeLedgerEntry(), renewalIssued],
        params: { expiresAt: "2036-10-01T00:00:00Z" },
        now: NOW,
      }),
    ).toThrow(/CLON DETECTADO/);
  });

  it("--force-duplicate emite igual pero queda MARCADO (evidencia auditada)", () => {
    const { privateKeyPem } = makeKeyPair();
    const renewed = renewLicense({
      request: makeRenewalRequestFixture({ renewalCounter: 0, nonce: "nonce-del-clon" }),
      privateKeyPem,
      ledgerEntries: [makeLedgerEntry(), renewalIssued],
      params: { expiresAt: "2036-10-01T00:00:00Z", forceDuplicate: true },
      now: NOW,
    });
    expect(renewed.forcedDuplicate).toBe(true);
    expect(renewed.payload.renewalCounter).toBe(1);
  });

  it("linaje DESFASADO (presenta un counter que no es el último emitido) también se deniega", () => {
    const { privateKeyPem } = makeKeyPair();
    expect(() =>
      renewLicense({
        request: makeRenewalRequestFixture({ renewalCounter: 0 }),
        privateKeyPem,
        // La última emisión para la instalación fue counter=1 (ya renovó una vez):
        ledgerEntries: [makeLedgerEntry(), renewalIssued],
        params: { expiresAt: "2036-10-01T00:00:00Z" },
        now: NOW,
      }),
    ).toThrow(/CLON DETECTADO|linaje desfasado/);
    expect(() =>
      renewLicense({
        request: makeRenewalRequestFixture({ renewalCounter: 5 }),
        privateKeyPem,
        ledgerEntries: [makeLedgerEntry(), renewalIssued],
        params: { expiresAt: "2036-10-01T00:00:00Z" },
        now: NOW,
      }),
    ).toThrow(/linaje desfasado/);
  });

  it("instalación sin emisiones en el ledger ⇒ no hay nada que renovar", () => {
    const { privateKeyPem } = makeKeyPair();
    expect(() =>
      renewLicense({
        request: makeRenewalRequestFixture({ installationId: "inst_desconocida" }),
        privateKeyPem,
        ledgerEntries: [makeLedgerEntry()],
        params: { expiresAt: "2036-10-01T00:00:00Z" },
        now: NOW,
      }),
    ).toThrow(/no tiene emisiones en el ledger/);
  });

  it("licenseId presentado ≠ ledger ⇒ deniega", () => {
    const { privateKeyPem } = makeKeyPair();
    expect(() =>
      renewLicense({
        request: makeRenewalRequestFixture({ licenseId: "lic_otra_cosa" }),
        privateKeyPem,
        ledgerEntries: [makeLedgerEntry()],
        params: { expiresAt: "2036-10-01T00:00:00Z" },
        now: NOW,
      }),
    ).toThrow(/licenseId/);
  });

  it("huella distinta ⇒ deniega salvo --accept-new-fingerprint (migración legítima, auditada)", () => {
    const { privateKeyPem, publicKeyPem } = makeKeyPair();
    const otraHuella = "ffffffffffffffffffffffffffffffff";
    expect(() =>
      renewLicense({
        request: makeRenewalRequestFixture({ fingerprint: otraHuella }),
        privateKeyPem,
        ledgerEntries: [makeLedgerEntry()],
        params: { expiresAt: "2036-10-01T00:00:00Z" },
        now: NOW,
      }),
    ).toThrow(/huella/);

    const renewed = renewLicense({
      request: makeRenewalRequestFixture({ fingerprint: otraHuella }),
      privateKeyPem,
      ledgerEntries: [makeLedgerEntry()],
      params: { expiresAt: "2036-10-01T00:00:00Z", acceptNewFingerprint: true },
      now: NOW,
    });
    expect(renewed.acceptedNewFingerprint).toBe(true);
    const verified = verifyLicense(renewed.lic, publicKeyPem);
    expect(verified.ok && verified.payload.fingerprint === otraHuella).toBe(true);
  });

  it("entradas L3 (sin type/renewalCounter) cuentan como activación counter=0 — retrocompatibilidad", () => {
    const { privateKeyPem } = makeKeyPair();
    const preL4 = makeLedgerEntry();
    delete (preL4 as Partial<LedgerEntry>).type;
    delete (preL4 as Partial<LedgerEntry>).renewalCounter;
    delete (preL4 as Partial<LedgerEntry>).whiteLabel;
    delete (preL4 as Partial<LedgerEntry>).supportTier;
    const renewed = renewLicense({
      request: makeRenewalRequestFixture(),
      privateKeyPem,
      ledgerEntries: [preL4],
      params: { expiresAt: "2036-10-01T00:00:00Z" },
      now: NOW,
    });
    expect(renewed.payload.renewalCounter).toBe(1);
    expect(renewed.payload.whiteLabel).toBe(true); // defaults del emisor
    expect(renewed.payload.supportTier).toBe("L2");
  });
});

describe("helpers de linaje del ledger", () => {
  it("lastEntryForInstallation devuelve la ÚLTIMA emisión de esa instalación", () => {
    const a1 = makeLedgerEntry({ seq: 1 });
    const b = makeLedgerEntry({ seq: 2, installationId: "inst_b" });
    const a2 = makeLedgerEntry({ seq: 3, type: "renewal", renewalCounter: 1 });
    expect(lastEntryForInstallation([a1, b, a2], "inst_test_fixture")?.seq).toBe(3);
    expect(lastEntryForInstallation([a1, b, a2], "inst_b")?.seq).toBe(2);
    expect(lastEntryForInstallation([a1, b, a2], "inst_nada")).toBeUndefined();
  });

  it("findDuplicateLineage solo acusa RENOVACIONES con el mismo counter presentado", () => {
    const issue = makeLedgerEntry({ seq: 1 });
    const renewal = makeLedgerEntry({ seq: 2, type: "renewal", renewalCounter: 1, presentedCounter: 0 });
    expect(findDuplicateLineage([issue, renewal], "inst_test_fixture", 0)?.seq).toBe(2);
    expect(findDuplicateLineage([issue, renewal], "inst_test_fixture", 1)).toBeUndefined();
    expect(findDuplicateLineage([issue], "inst_test_fixture", 0)).toBeUndefined();
  });
});
