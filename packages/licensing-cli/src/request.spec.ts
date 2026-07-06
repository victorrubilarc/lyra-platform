import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  parseActivationRequest,
  parseRenewalRequest,
  readActivationRequest,
  readRenewalRequest,
  type RenewalRequest,
} from "./request.js";
import { makeRequestFixture } from "./test-fixtures.js";

function makeRenewalFixture(overrides: Partial<RenewalRequest> = {}): RenewalRequest {
  return {
    ...makeRequestFixture(),
    type: "renewal",
    licenseId: "lic_2026_minera_prueba_001",
    renewalCounter: 0,
    nonce: "nonce-local-presentado",
    ...overrides,
  };
}

describe("solicitud.lreq (validación de entrada de la CLI)", () => {
  let dir: string;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it("acepta la solicitud EXACTA que escribe LicenseService en L1", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-req-"));
    const path = join(dir, "solicitud.lreq");
    writeFileSync(path, JSON.stringify(makeRequestFixture(), null, 2), "utf8");
    const parsed = readActivationRequest(path);
    expect(parsed.installationId).toBe("inst_test_fixture");
    expect(parsed.fingerprint).toBe("0123456789abcdef0123456789abcdef");
  });

  it("rechaza producto ajeno, huella malformada y campos faltantes", () => {
    expect(() =>
      parseActivationRequest(makeRequestFixture({ product: "otro-producto" }), "req"),
    ).toThrow(/product/);
    expect(() =>
      parseActivationRequest(makeRequestFixture({ fingerprint: "XYZ" }), "req"),
    ).toThrow(/fingerprint/);
    expect(() =>
      parseActivationRequest(makeRequestFixture({ installationId: " " }), "req"),
    ).toThrow(/installationId/);
    expect(() => parseActivationRequest("no-es-objeto", "req")).toThrow(/objeto/);
    expect(() =>
      parseActivationRequest(makeRequestFixture({ generatedAt: "ayer" }), "req"),
    ).toThrow(/generatedAt/);
  });

  it("rechaza una solicitud de RENOVACIÓN donde se espera activación (y guía al comando correcto)", () => {
    expect(() => parseActivationRequest(makeRenewalFixture(), "req")).toThrow(
      /lyra-license renew/,
    );
  });
});

describe("renovacion.lreq (solicitud de renovación con linaje, L4)", () => {
  let dir: string;
  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it("acepta la solicitud EXACTA que escribe LicenseService en L4 (con linaje)", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-renew-"));
    const path = join(dir, "renovacion.lreq");
    writeFileSync(path, JSON.stringify(makeRenewalFixture(), null, 2), "utf8");
    const parsed = readRenewalRequest(path);
    expect(parsed.licenseId).toBe("lic_2026_minera_prueba_001");
    expect(parsed.renewalCounter).toBe(0);
    expect(parsed.nonce).toBe("nonce-local-presentado");
  });

  it("rechaza una solicitud de ACTIVACIÓN donde se espera renovación (y guía al comando correcto)", () => {
    expect(() => parseRenewalRequest(makeRequestFixture(), "req")).toThrow(/lyra-license issue/);
  });

  it("rechaza linaje inválido: counter negativo/no entero, nonce vacío, licenseId ausente", () => {
    expect(() => parseRenewalRequest(makeRenewalFixture({ renewalCounter: -1 }), "req")).toThrow(
      /renewalCounter/,
    );
    expect(() =>
      parseRenewalRequest(makeRenewalFixture({ renewalCounter: 1.5 }), "req"),
    ).toThrow(/renewalCounter/);
    expect(() => parseRenewalRequest(makeRenewalFixture({ nonce: "  " }), "req")).toThrow(/nonce/);
    expect(() => parseRenewalRequest(makeRenewalFixture({ licenseId: "" }), "req")).toThrow(
      /licenseId/,
    );
    expect(() =>
      parseRenewalRequest(makeRenewalFixture({ fingerprint: "XYZ" }), "req"),
    ).toThrow(/fingerprint/);
  });
});
