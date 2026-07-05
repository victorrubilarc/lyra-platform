import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it } from "vitest";
import type { LicensedModuleKey } from "@lyra/contracts";
import { ModuleEntitlementGuard, REQUIRED_MODULE_KEY, RequireModule } from "./module-entitlement.guard";
import { toLicenseStatus, type LicenseSnapshot } from "./license-runtime";

/** LicenseService falso con la MISMA semántica del real sobre el snapshot. */
function fakeLicense(licensedModules?: readonly string[]) {
  return {
    getEvaluation: () => ({ licensedModules }),
    isModuleLicensed: (key: string) =>
      licensedModules !== undefined && licensedModules.includes(key),
  };
}

function makeCtx(method: string, moduleKey?: LicensedModuleKey) {
  // El reflector real lee metadata de clase/handler; aquí lo simulamos con
  // un handler decorado de verdad (así el spec también prueba el decorator).
  class Dummy {
    handler(): void {}
  }
  if (moduleKey !== undefined) {
    RequireModule(moduleKey)(Dummy);
  }
  return {
    getHandler: () => Dummy.prototype.handler,
    getClass: () => Dummy,
    switchToHttp: () => ({ getRequest: () => ({ method, url: "/api/x" }) }),
  } as never;
}

function build(licensedModules?: readonly string[]): ModuleEntitlementGuard {
  return new ModuleEntitlementGuard(new Reflector(), fakeLicense(licensedModules) as never);
}

function blocked(
  guard: ModuleEntitlementGuard,
  method: string,
  moduleKey?: LicensedModuleKey,
): boolean {
  try {
    guard.canActivate(makeCtx(method, moduleKey));
    return false;
  } catch (err) {
    expect(err).toBeInstanceOf(ForbiddenException);
    return true;
  }
}

describe("RequireModule (decorator)", () => {
  it("graba la clave del catálogo como metadata de clase", () => {
    class C {}
    RequireModule("incidents")(C);
    expect(new Reflector().get(REQUIRED_MODULE_KEY, C)).toBe("incidents");
  });
});

describe("ModuleEntitlementGuard", () => {
  it("módulo licenciado ⇒ pasa todo (mutación incluida)", () => {
    const guard = build(["core", "incidents"]);
    expect(blocked(guard, "POST", "incidents")).toBe(false);
    expect(blocked(guard, "DELETE", "incidents")).toBe(false);
  });

  it("módulo NO licenciado ⇒ mutaciones 403 MODULE_NOT_LICENSED con la clave", () => {
    const guard = build(["core", "incidents"]);
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      try {
        guard.canActivate(makeCtx(method, "work-orders"));
        expect.unreachable(`debió bloquear ${method}`);
      } catch (err) {
        const body = (err as ForbiddenException).getResponse() as Record<string, unknown>;
        expect(body.code).toBe("MODULE_NOT_LICENSED");
        expect(body.module).toBe("work-orders");
      }
    }
  });

  it("módulo NO licenciado ⇒ lectura y exportación (GET/HEAD/OPTIONS) pasan SIEMPRE — jamás se secuestran datos", () => {
    const guard = build(["core"]);
    expect(blocked(guard, "GET", "work-orders")).toBe(false);
    expect(blocked(guard, "HEAD", "work-orders")).toBe(false);
    expect(blocked(guard, "OPTIONS", "work-orders")).toBe(false);
  });

  it("core NUNCA se gatea, ni siquiera con una licencia sin core en modules[]", () => {
    const guard = build([]);
    expect(blocked(guard, "POST", "core")).toBe(false);
  });

  it("endpoint sin @RequireModule ⇒ no opina (pasa)", () => {
    const guard = build([]);
    expect(blocked(guard, "POST", undefined)).toBe(false);
  });

  it("SIN payload verificado (licensedModules undefined) ⇒ no opina: gobierna el guard de estados L1", () => {
    const guard = build(undefined);
    expect(blocked(guard, "POST", "work-orders")).toBe(false);
  });
});

describe("toLicenseStatus (DTO delgado — mínimo privilegio)", () => {
  const snapshot: LicenseSnapshot = {
    status: "VALIDA",
    evaluation: { state: "VALIDA", daysToExpiry: 200 },
    licensedModules: ["core", "incidents"],
    licenseId: "lic_x",
    customer: "Minera Acme",
    edition: "professional",
    expiresAt: "2027-07-01T00:00:00Z",
    fingerprint: "3f9c-secreta",
    installationId: "inst_secreta",
    checkedAt: new Date("2026-07-05T00:00:00Z"),
  };

  it("mapea exactamente los campos públicos", () => {
    expect(toLicenseStatus(snapshot)).toEqual({
      status: "VALIDA",
      reason: undefined,
      edition: "professional",
      modules: ["core", "incidents"],
      expiresAt: "2027-07-01T00:00:00Z",
      daysToExpiry: 200,
    });
  });

  it("JAMÁS filtra huella, linaje, installationId, licenseId ni customer", () => {
    const dto = toLicenseStatus(snapshot) as unknown as Record<string, unknown>;
    for (const sensitive of [
      "fingerprint",
      "installationId",
      "licenseId",
      "customer",
      "nonce",
      "renewalCounter",
      "evaluation",
      "checkedAt",
    ]) {
      expect(dto).not.toHaveProperty(sensitive);
    }
  });

  it("sin payload verificado ⇒ modules null (el front no oculta por módulo)", () => {
    const dto = toLicenseStatus({
      status: "PENDIENTE_ACTIVACION",
      reason: "LICENSE_FILE_MISSING",
      fingerprint: "x",
      installationId: "y",
      checkedAt: new Date(),
    });
    expect(dto.modules).toBeNull();
    expect(dto.status).toBe("PENDIENTE_ACTIVACION");
    expect(dto.reason).toBe("LICENSE_FILE_MISSING");
    expect(dto.edition).toBeUndefined();
  });
});
