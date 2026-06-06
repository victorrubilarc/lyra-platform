import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { MfaEnrollmentGuard } from "./mfa-enrollment.guard";
import { ALLOW_PENDING_ENROLLMENT_KEY, IS_PUBLIC_KEY } from "./authz.decorators";

function makeCtx(user: { mfaPending?: boolean } | undefined) {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as never;
}

function build(opts: { isPublic?: boolean; allowed?: boolean }) {
  const reflector = {
    getAllAndOverride: vi.fn((key: string) =>
      key === IS_PUBLIC_KEY ? Boolean(opts.isPublic) : key === ALLOW_PENDING_ENROLLMENT_KEY ? Boolean(opts.allowed) : undefined,
    ),
  };
  return new MfaEnrollmentGuard(reflector as never);
}

describe("MfaEnrollmentGuard", () => {
  it("deja pasar rutas públicas aunque haya enrolamiento pendiente", () => {
    expect(build({ isPublic: true }).canActivate(makeCtx({ mfaPending: true }))).toBe(true);
  });

  it("deja pasar si no hay usuario (lo cubren los guards previos)", () => {
    expect(build({}).canActivate(makeCtx(undefined))).toBe(true);
  });

  it("deja pasar si el usuario NO está pendiente", () => {
    expect(build({}).canActivate(makeCtx({ mfaPending: false }))).toBe(true);
  });

  it("deja pasar endpoints whitelisted con @AllowPendingEnrollment", () => {
    expect(build({ allowed: true }).canActivate(makeCtx({ mfaPending: true }))).toBe(true);
  });

  it("bloquea (403) cualquier otro endpoint con enrolamiento pendiente", () => {
    expect(() => build({ allowed: false }).canActivate(makeCtx({ mfaPending: true }))).toThrow(
      ForbiddenException,
    );
  });
});
