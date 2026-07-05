import { describe, expect, it } from "vitest";

import {
  DEFAULT_WARN_DAYS,
  evaluateLicense,
  exceedsLimits,
  isExpired,
  isModuleLicensed,
  isWithinGrace,
} from "./evaluate.js";
import { makePayload } from "./test-fixtures.js";
import { LicenseState } from "./types.js";

// Fixture: notBefore 2026-07-01 · expiresAt 2026-10-01 · graceDays 14 (fin de
// gracia = 2026-10-15) · fingerprint "fp-servidor-a" · limits 1/200/80.
const FP_A = "fp-servidor-a";
const FP_B = "fp-servidor-b";
const en = (iso: string) => new Date(iso);

describe("máquina de estados LICENSING.md §5 — paridad con el PoC", () => {
  it("T1: licencia legítima, vigente y en su máquina → VALIDA", () => {
    const r = evaluateLicense(makePayload(), { now: en("2026-07-04T12:00:00Z"), fingerprint: FP_A });
    expect(r.state).toBe(LicenseState.VALIDA);
    expect(r.reason).toBeUndefined();
    expect(r.daysToExpiry).toBe(88);
  });

  it("T4: mismo archivo copiado a otra máquina (huella distinta) → BLOQUEADA", () => {
    const r = evaluateLicense(makePayload(), { now: en("2026-07-04T12:00:00Z"), fingerprint: FP_B });
    expect(r).toMatchObject({ state: LicenseState.BLOQUEADA, reason: "FINGERPRINT_MISMATCH" });
  });

  it("T5a: un día tras vencer → EN_GRACIA (sigue operando + aviso)", () => {
    const r = evaluateLicense(makePayload(), { now: en("2026-10-02T00:00:00Z"), fingerprint: FP_A });
    expect(r).toMatchObject({ state: LicenseState.EN_GRACIA, reason: "EXPIRED_IN_GRACE" });
  });

  it("T5b: pasada la gracia → SOLO_LECTURA (jamás borra ni cifra datos)", () => {
    const r = evaluateLicense(makePayload(), { now: en("2026-11-01T00:00:00Z"), fingerprint: FP_A });
    expect(r).toMatchObject({ state: LicenseState.SOLO_LECTURA, reason: "EXPIRED_BEYOND_GRACE" });
    expect(r.daysToExpiry).toBeLessThan(0);
  });
});

describe("bordes temporales", () => {
  it("notBefore futuro → BLOQUEADA (NOT_YET_VALID)", () => {
    const r = evaluateLicense(makePayload(), { now: en("2026-06-30T23:59:59Z"), fingerprint: FP_A });
    expect(r).toMatchObject({ state: LicenseState.BLOQUEADA, reason: "NOT_YET_VALID" });
  });

  it("el instante exacto de expiresAt aún NO está vencido (y cae en POR_VENCER)", () => {
    const r = evaluateLicense(makePayload(), { now: en("2026-10-01T00:00:00Z"), fingerprint: FP_A });
    expect(r).toMatchObject({ state: LicenseState.POR_VENCER, daysToExpiry: 0 });
  });

  it("el instante exacto del fin de gracia sigue EN_GRACIA; un ms después, SOLO_LECTURA", () => {
    const finGracia = en("2026-10-15T00:00:00Z");
    expect(
      evaluateLicense(makePayload(), { now: finGracia, fingerprint: FP_A }).state,
    ).toBe(LicenseState.EN_GRACIA);
    expect(
      evaluateLicense(makePayload(), { now: new Date(finGracia.getTime() + 1), fingerprint: FP_A })
        .state,
    ).toBe(LicenseState.SOLO_LECTURA);
  });

  it("POR_VENCER respeta warnDays (default 30, parametrizable)", () => {
    const ctx = { now: en("2026-09-15T00:00:00Z"), fingerprint: FP_A }; // faltan 16 días
    expect(evaluateLicense(makePayload(), ctx).state).toBe(LicenseState.POR_VENCER);
    expect(evaluateLicense(makePayload(), { ...ctx, warnDays: 10 }).state).toBe(LicenseState.VALIDA);
    expect(DEFAULT_WARN_DAYS).toBe(30);
  });

  it("fechas ilegibles o graceDays negativo → BLOQUEADA (INVALID_TEMPORAL_FIELDS)", () => {
    const ctx = { now: en("2026-07-04T00:00:00Z"), fingerprint: FP_A };
    expect(evaluateLicense(makePayload({ expiresAt: "no-es-fecha" }), ctx)).toMatchObject({
      state: LicenseState.BLOQUEADA,
      reason: "INVALID_TEMPORAL_FIELDS",
    });
    expect(evaluateLicense(makePayload({ graceDays: -1 }), ctx)).toMatchObject({
      state: LicenseState.BLOQUEADA,
      reason: "INVALID_TEMPORAL_FIELDS",
    });
  });
});

describe("límites y entitlement de módulos", () => {
  const vigente = { now: en("2026-07-04T12:00:00Z"), fingerprint: FP_A };

  it("actuals sobre los topes → LIMITE_EXCEDIDO con el detalle de cada tope", () => {
    const r = evaluateLicense(makePayload(), {
      ...vigente,
      actuals: { installations: 2, nodes: 250, namedUsers: 80 },
    });
    expect(r.state).toBe(LicenseState.LIMITE_EXCEDIDO);
    expect(r.reason).toBe("LIMITS_EXCEEDED");
    expect(r.exceeded).toEqual([
      { limit: "maxInstallations", max: 1, actual: 2 },
      { limit: "maxNodes", max: 200, actual: 250 },
    ]);
  });

  it("exactamente en el tope NO excede; conteos ausentes no se evalúan", () => {
    const r = evaluateLicense(makePayload(), { ...vigente, actuals: { nodes: 200 } });
    expect(r.state).toBe(LicenseState.VALIDA);
  });

  it("módulo fuera de modules[] → MODULO_NO_LICENCIADO; dentro → VALIDA", () => {
    expect(
      evaluateLicense(makePayload(), { ...vigente, moduleKey: "work-orders" }),
    ).toMatchObject({ state: LicenseState.MODULO_NO_LICENCIADO, reason: "MODULE_NOT_LICENSED" });
    expect(evaluateLicense(makePayload(), { ...vigente, moduleKey: "incidents" }).state).toBe(
      LicenseState.VALIDA,
    );
  });
});

describe("precedencia de estados (el peor gana; nunca destructivo)", () => {
  it("huella ajena manda sobre vencimiento y límites → BLOQUEADA", () => {
    const r = evaluateLicense(makePayload(), {
      now: en("2026-10-02T00:00:00Z"),
      fingerprint: FP_B,
      actuals: { nodes: 999 },
    });
    expect(r).toMatchObject({ state: LicenseState.BLOQUEADA, reason: "FINGERPRINT_MISMATCH" });
  });

  it("vencida en gracia manda sobre límites/módulo → EN_GRACIA", () => {
    const r = evaluateLicense(makePayload(), {
      now: en("2026-10-02T00:00:00Z"),
      fingerprint: FP_A,
      actuals: { nodes: 999 },
      moduleKey: "work-orders",
    });
    expect(r.state).toBe(LicenseState.EN_GRACIA);
  });

  it("el tope de degradación es SOLO_LECTURA: ningún estado borra ni cifra", () => {
    const estados = Object.values(LicenseState);
    expect(estados).toHaveLength(7);
    expect(estados).not.toContain("DESTRUIR_DATOS");
  });
});

describe("helpers puros reutilizables (verificación distribuida L1/L2)", () => {
  const payload = makePayload();

  it("isExpired / isWithinGrace", () => {
    expect(isExpired(payload, en("2026-09-30T00:00:00Z"))).toBe(false);
    expect(isExpired(payload, en("2026-10-01T00:00:01Z"))).toBe(true);
    expect(isWithinGrace(payload, en("2026-09-30T00:00:00Z"))).toBe(false); // aún no vence
    expect(isWithinGrace(payload, en("2026-10-10T00:00:00Z"))).toBe(true);
    expect(isWithinGrace(payload, en("2026-10-16T00:00:00Z"))).toBe(false);
  });

  it("isModuleLicensed", () => {
    expect(isModuleLicensed(payload, "core")).toBe(true);
    expect(isModuleLicensed(payload, "work-orders")).toBe(false);
  });

  it("exceedsLimits: lista vacía cuando todo calza o no hay conteos", () => {
    expect(exceedsLimits(payload.limits, {})).toEqual([]);
    expect(exceedsLimits(payload.limits, { namedUsers: 81 })).toEqual([
      { limit: "maxNamedUsers", max: 80, actual: 81 },
    ]);
  });
});
