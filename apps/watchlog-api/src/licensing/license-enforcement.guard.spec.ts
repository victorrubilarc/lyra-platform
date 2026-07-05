import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { LicenseEnforcementGuard } from "./license-enforcement.guard";
import type { LicenseRuntimeStatus } from "./license-runtime";

function makeCtx(method: string, url: string) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ method, url }) }),
  } as never;
}

function build(status: LicenseRuntimeStatus): LicenseEnforcementGuard {
  const license = { getEvaluation: () => ({ status }) };
  return new LicenseEnforcementGuard(license as never);
}

function blocked(guard: LicenseEnforcementGuard, method: string, url: string): boolean {
  try {
    guard.canActivate(makeCtx(method, url));
    return false;
  } catch (err) {
    expect(err).toBeInstanceOf(ForbiddenException);
    return true;
  }
}

describe("LicenseEnforcementGuard", () => {
  it("VALIDA / POR_VENCER / EN_GRACIA / LIMITE_EXCEDIDO no bloquean nada", () => {
    for (const status of ["VALIDA", "POR_VENCER", "EN_GRACIA", "LIMITE_EXCEDIDO"] as const) {
      const guard = build(status);
      expect(blocked(guard, "POST", "/api/log-entries")).toBe(false);
      expect(blocked(guard, "DELETE", "/api/templates/t1")).toBe(false);
    }
  });

  it("SOLO_LECTURA: bloquea TODAS las mutaciones fuera de la lista blanca", () => {
    const guard = build("SOLO_LECTURA");
    expect(blocked(guard, "POST", "/api/log-entries")).toBe(true);
    expect(blocked(guard, "PUT", "/api/templates/t1")).toBe(true);
    expect(blocked(guard, "PATCH", "/api/incidents/i1")).toBe(true);
    expect(blocked(guard, "DELETE", "/api/saved-views/v1")).toBe(true);
  });

  it("SOLO_LECTURA: la lectura y la exportación (GET/HEAD/OPTIONS) pasan SIEMPRE — jamás se secuestran datos", () => {
    const guard = build("SOLO_LECTURA");
    expect(blocked(guard, "GET", "/api/log-entries")).toBe(false);
    expect(blocked(guard, "GET", "/api/shift-handover/h1/acta.pdf")).toBe(false);
    expect(blocked(guard, "GET", "/api/security/audit/export")).toBe(false);
    expect(blocked(guard, "HEAD", "/api/log-entries")).toBe(false);
    expect(blocked(guard, "OPTIONS", "/api/log-entries")).toBe(false);
  });

  it("lista blanca: los POST de auth pasan (sin ellos ni siquiera se podría leer)", () => {
    const guard = build("BLOQUEADA");
    expect(blocked(guard, "POST", "/api/auth/login")).toBe(false);
    expect(blocked(guard, "POST", "/api/auth/refresh")).toBe(false);
    expect(blocked(guard, "POST", "/api/auth/logout")).toBe(false);
    expect(blocked(guard, "POST", "/api/auth/change-password")).toBe(false);
    expect(blocked(guard, "POST", "/api/auth/mfa/verify")).toBe(false);
    // El querystring no confunde el prefijo.
    expect(blocked(guard, "POST", "/api/auth/login?x=1")).toBe(false);
  });

  it("la lista blanca NO se presta para prefijos disfrazados", () => {
    const guard = build("BLOQUEADA");
    expect(blocked(guard, "POST", "/api/authz-fake/login")).toBe(true);
    expect(blocked(guard, "POST", "/api/log-entries?path=/api/auth/login")).toBe(true);
  });

  it("BLOQUEADA se comporta igual que SOLO_LECTURA (nunca peor que solo lectura)", () => {
    const guard = build("BLOQUEADA");
    expect(blocked(guard, "POST", "/api/log-entries")).toBe(true);
    expect(blocked(guard, "GET", "/api/log-entries")).toBe(false);
  });

  it("PENDIENTE_ACTIVACION: bloquea operar con mensaje propio y deja leer + autenticarse", () => {
    const guard = build("PENDIENTE_ACTIVACION");
    expect(blocked(guard, "GET", "/api/structure/nodes")).toBe(false);
    expect(blocked(guard, "POST", "/api/auth/login")).toBe(false);
    try {
      guard.canActivate(makeCtx("POST", "/api/log-entries"));
      expect.unreachable("debió bloquear");
    } catch (err) {
      const body = (err as ForbiddenException).getResponse() as Record<string, unknown>;
      expect(body.code).toBe("LICENSE_RESTRICTED");
      expect(body.licenseStatus).toBe("PENDIENTE_ACTIVACION");
      expect(String(body.message)).toContain("pendiente de activación");
    }
  });
});
