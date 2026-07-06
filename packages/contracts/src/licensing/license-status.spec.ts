import { describe, expect, it } from "vitest";
import { licenseStatusSchema } from "./license-status.js";
import { CORE_MODULE_KEY, LICENSED_MODULE_KEYS } from "./modules.js";

describe("catálogo de módulos licenciables", () => {
  it("incluye core y no tiene claves duplicadas", () => {
    expect(LICENSED_MODULE_KEYS).toContain(CORE_MODULE_KEY);
    expect(new Set(LICENSED_MODULE_KEYS).size).toBe(LICENSED_MODULE_KEYS.length);
  });

  it("las claves son kebab-case simple (idioma de la licencia)", () => {
    for (const key of LICENSED_MODULE_KEYS) {
      expect(key).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });
});

describe("licenseStatusSchema (DTO delgado)", () => {
  const valid = {
    status: "VALIDA",
    edition: "professional",
    modules: ["core", "incidents"],
    expiresAt: "2027-07-01T00:00:00Z",
    daysToExpiry: 361,
  };

  it("acepta el DTO completo y el mínimo (sin licencia: modules null)", () => {
    expect(licenseStatusSchema.parse(valid)).toEqual(valid);
    const pending = { status: "PENDIENTE_ACTIVACION", reason: "LICENSE_FILE_MISSING", modules: null };
    expect(licenseStatusSchema.parse(pending)).toEqual(pending);
  });

  it("acepta claves de módulo DESCONOCIDAS (licencia más nueva que el build)", () => {
    const parsed = licenseStatusSchema.parse({
      ...valid,
      modules: ["core", "modulo-del-futuro"],
    });
    expect(parsed.modules).toContain("modulo-del-futuro");
  });

  it("rechaza estados fuera de la máquina de estados", () => {
    expect(() => licenseStatusSchema.parse({ ...valid, status: "PIRATA" })).toThrow();
  });

  it("graceDaysRemaining (L6): entero ≥ 0 opcional; rechaza negativos", () => {
    const grace = {
      status: "EN_GRACIA",
      reason: "EXPIRED_IN_GRACE",
      modules: ["core"],
      daysToExpiry: -5,
      graceDaysRemaining: 9,
    };
    expect(licenseStatusSchema.parse(grace)).toEqual(grace);
    expect(licenseStatusSchema.parse(valid)).not.toHaveProperty("graceDaysRemaining");
    expect(() =>
      licenseStatusSchema.parse({ ...grace, graceDaysRemaining: -1 }),
    ).toThrow();
  });

  it("limits (L2b): cupo contratado + uso vivo, opcional y solo enteros ≥ 0", () => {
    const withLimits = {
      ...valid,
      limits: {
        nodes: { max: 200, inUse: 37 },
        namedUsers: { max: 80, inUse: 80 },
      },
    };
    expect(licenseStatusSchema.parse(withLimits)).toEqual(withLimits);
    // Sin payload verificado el cupo simplemente no viaja (como modules null).
    expect(licenseStatusSchema.parse(valid)).not.toHaveProperty("limits");
    expect(() =>
      licenseStatusSchema.parse({
        ...valid,
        limits: { nodes: { max: -1, inUse: 0 }, namedUsers: { max: 1, inUse: 0 } },
      }),
    ).toThrow();
  });

  it("mínimo privilegio: strip de campos sensibles si llegaran (huella/linaje/installationId)", () => {
    const leaked = {
      ...valid,
      fingerprint: "3f9c",
      installationId: "inst_x",
      nonce: "n",
      renewalCounter: 3,
      customer: "Minera Acme",
    };
    const parsed = licenseStatusSchema.parse(leaked);
    expect(parsed).not.toHaveProperty("fingerprint");
    expect(parsed).not.toHaveProperty("installationId");
    expect(parsed).not.toHaveProperty("nonce");
    expect(parsed).not.toHaveProperty("renewalCounter");
    expect(parsed).not.toHaveProperty("customer");
  });
});
