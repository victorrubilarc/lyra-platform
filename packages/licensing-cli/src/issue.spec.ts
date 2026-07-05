import { describe, expect, it } from "vitest";

import { evaluateLicense, LicenseState, verifyLicense } from "@lyra/licensing";

import { issueLicense, normalizeModules } from "./issue.js";
import {
  FIXTURE_FINGERPRINT,
  makeIssueParamsFixture,
  makeKeyPair,
  makeRequestFixture,
} from "./test-fixtures.js";

const NOW = new Date("2026-07-05T12:00:00Z");

describe("issueLicense", () => {
  it("emite un license.lic que verifyLicense acepta y evaluateLicense da VALIDA con la huella de la solicitud", () => {
    const { privateKeyPem, publicKeyPem } = makeKeyPair();
    const issued = issueLicense({
      request: makeRequestFixture(),
      privateKeyPem,
      params: makeIssueParamsFixture(),
      now: NOW,
    });

    const verified = verifyLicense(issued.lic, publicKeyPem);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.payload.installationId).toBe("inst_test_fixture");
    expect(verified.payload.fingerprint).toBe(FIXTURE_FINGERPRINT);
    expect(verified.payload.renewalCounter).toBe(0); // linaje inicial (L4 rota)

    const evaluation = evaluateLicense(verified.payload, {
      now: NOW,
      fingerprint: FIXTURE_FINGERPRINT,
    });
    expect(evaluation.state).toBe(LicenseState.VALIDA);
  });

  it("una huella AJENA queda BLOQUEADA (node-lock): el producto no la acepta en otra máquina", () => {
    const { privateKeyPem, publicKeyPem } = makeKeyPair();
    const issued = issueLicense({
      request: makeRequestFixture(),
      privateKeyPem,
      params: makeIssueParamsFixture(),
      now: NOW,
    });
    const verified = verifyLicense(issued.lic, publicKeyPem);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    const evaluation = evaluateLicense(verified.payload, {
      now: NOW,
      fingerprint: "ffffffffffffffffffffffffffffffff",
    });
    expect(evaluation.state).toBe(LicenseState.BLOQUEADA);
    expect(evaluation.reason).toBe("FINGERPRINT_MISMATCH");
  });

  it("keygen del ATACANTE rechazado: la firma de otra privada no pasa contra la pública embebida (T3 del PoC)", () => {
    const attacker = makeKeyPair();
    const product = makeKeyPair(); // "la pública embebida" del build
    const forged = issueLicense({
      request: makeRequestFixture(),
      privateKeyPem: attacker.privateKeyPem,
      params: makeIssueParamsFixture(),
      now: NOW,
    });
    const verified = verifyLicense(forged.lic, product.publicKeyPem);
    expect(verified.ok).toBe(false);
    if (verified.ok) return;
    expect(verified.reason).toBe("INVALID_SIGNATURE");
  });

  it("valida la entrada comercial: edición fuera del enum, módulo desconocido, fechas malas", () => {
    const { privateKeyPem } = makeKeyPair();
    const base = { request: makeRequestFixture(), privateKeyPem, now: NOW };

    expect(() =>
      issueLicense({ ...base, params: makeIssueParamsFixture({ edition: "premium" as never }) }),
    ).toThrow(/edición inválida/);
    expect(() =>
      issueLicense({ ...base, params: makeIssueParamsFixture({ modules: ["core", "warp-drive"] }) }),
    ).toThrow(/módulos desconocidos/);
    expect(() =>
      issueLicense({ ...base, params: makeIssueParamsFixture({ expiresAt: "mañana" }) }),
    ).toThrow(/ISO 8601/);
    expect(() =>
      issueLicense({ ...base, params: makeIssueParamsFixture({ expiresAt: "2020-01-01T00:00:00Z" }) }),
    ).toThrow(/ya pasó/);
    expect(() =>
      issueLicense({
        ...base,
        params: makeIssueParamsFixture({ limits: { maxNodes: 0, maxNamedUsers: 10 } }),
      }),
    ).toThrow(/max-nodes/);
    expect(() =>
      issueLicense({ ...base, params: makeIssueParamsFixture({ customer: "  " }) }),
    ).toThrow(/customer/);
  });

  it("--allow-past permite emitir vencidas (smokes) y el producto las degrada a SOLO_LECTURA, no borra nada", () => {
    const { privateKeyPem, publicKeyPem } = makeKeyPair();
    const issued = issueLicense({
      request: makeRequestFixture(),
      privateKeyPem,
      params: makeIssueParamsFixture({
        expiresAt: "2026-05-01T00:00:00Z", // venció hace 65 días, gracia 14
        allowPast: true,
      }),
      now: NOW,
    });
    const verified = verifyLicense(issued.lic, publicKeyPem);
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    const evaluation = evaluateLicense(verified.payload, {
      now: NOW,
      fingerprint: FIXTURE_FINGERPRINT,
    });
    expect(evaluation.state).toBe(LicenseState.SOLO_LECTURA);
  });

  it("licenseId por defecto usa año + slug del cliente + correlativo del ledger", () => {
    const { privateKeyPem } = makeKeyPair();
    const issued = issueLicense({
      request: makeRequestFixture(),
      privateKeyPem,
      params: makeIssueParamsFixture({ customer: "Minera Río Ácido S.A." }),
      now: NOW,
      sequence: 7,
    });
    expect(issued.payload.licenseId).toBe("lic_2026_minera_rio_acido_s_a_007");
  });
});

describe("normalizeModules", () => {
  it("incluye `core` siempre (jamás se gatea) y deduplica", () => {
    expect(normalizeModules(["logbook", "logbook", "incidents"])).toEqual([
      "core",
      "logbook",
      "incidents",
    ]);
  });
  it("rechaza lista vacía", () => {
    expect(() => normalizeModules(["  "])).toThrow(/al menos un módulo/);
  });
});
