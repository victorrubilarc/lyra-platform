import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth.service";

/** Construye un AuthService con todas sus dependencias mockeadas. */
function build(overrides: { user?: Record<string, unknown> | null; maxFailed?: number } = {}) {
  const user =
    overrides.user === undefined
      ? {
          id: "u1",
          email: "op@x.cl",
          passwordHash: "hash",
          status: "ACTIVE",
          mfaEnabled: false,
          failedLoginCount: 0,
          lockedUntil: null,
        }
      : overrides.user;

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: "u1",
        email: "op@x.cl",
        displayName: "Operador",
        mfaEnabled: false,
        forcePasswordChange: false,
      }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const local = {
    burnTiming: vi.fn().mockResolvedValue(undefined),
    verifyCredentials: vi.fn().mockResolvedValue(true),
  };
  const tokens = {
    issueSession: vi
      .fn()
      .mockResolvedValue({ accessToken: "a", refreshToken: "r", expiresIn: 900, sessionId: "s1" }),
  };
  const mfa = { assertSecondFactor: vi.fn() };
  const mfaRequirement = {
    isEnrollmentPending: vi.fn().mockResolvedValue(false),
    isRequiredForUser: vi.fn().mockResolvedValue(false),
  };
  const policy = {
    getPolicy: vi.fn().mockResolvedValue({ maxFailedAttempts: overrides.maxFailed ?? 5, lockoutMinutes: 15 }),
  };
  const resets = { invalidatePending: vi.fn().mockResolvedValue(undefined) };
  const passwords = {};
  const permissions = { getEffectivePermissions: vi.fn().mockResolvedValue(new Set(["user:read"])) };
  const scope = { getAccessibleNodeIds: vi.fn().mockResolvedValue(null) };
  const jwt = { signAsync: vi.fn().mockResolvedValue("mfa.jwt") };
  const config = { get: () => "secret" };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };

  const service = new AuthService(
    prisma as never,
    local as never,
    tokens as never,
    mfa as never,
    mfaRequirement as never,
    policy as never,
    resets as never,
    passwords as never,
    permissions as never,
    scope as never,
    jwt as never,
    config as never,
    audit as never,
  );
  return { service, prisma, local, tokens, mfa, audit };
}

const meta = { ip: "127.0.0.1", userAgent: "test" };

describe("AuthService.login", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("usuario desconocido: gasta timing y falla genérico", async () => {
    const c = build({ user: null });
    await expect(c.service.login({ email: "no@x.cl", password: "x" }, meta)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(c.local.burnTiming).toHaveBeenCalledOnce();
  });

  it("login exitoso devuelve sesión autenticada", async () => {
    const result = await ctx.service.login({ email: "op@x.cl", password: "ok" }, meta);
    expect(result.kind).toBe("authenticated");
    if (result.kind === "authenticated") {
      expect(result.refreshToken).toBe("r");
      expect(result.session.permissions).toContain("user:read");
      expect(result.session.scope.orgNodeIds).toBeNull();
    }
  });

  it("contraseña incorrecta incrementa el contador de fallos", async () => {
    ctx.local.verifyCredentials.mockResolvedValue(false);
    await expect(ctx.service.login({ email: "op@x.cl", password: "mala" }, meta)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(ctx.prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ failedLoginCount: 1 }) }),
    );
  });

  it("al alcanzar el máximo de intentos, bloquea la cuenta (lockedUntil)", async () => {
    const c = build({ user: { id: "u1", email: "op@x.cl", passwordHash: "h", status: "ACTIVE", mfaEnabled: false, failedLoginCount: 4, lockedUntil: null }, maxFailed: 5 });
    c.local.verifyCredentials.mockResolvedValue(false);
    await expect(c.service.login({ email: "op@x.cl", password: "mala" }, meta)).rejects.toThrow();
    const call = c.prisma.user.update.mock.calls[0]![0];
    expect(call.data.lockedUntil).toBeInstanceOf(Date);
  });

  it("rechaza una cuenta bloqueada temporalmente", async () => {
    const c = build({ user: { id: "u1", email: "op@x.cl", passwordHash: "h", status: "ACTIVE", mfaEnabled: false, failedLoginCount: 0, lockedUntil: new Date(Date.now() + 60_000) } });
    await expect(c.service.login({ email: "op@x.cl", password: "x" }, meta)).rejects.toThrow(
      /bloqueada/,
    );
  });

  it("rechaza con 403 una cuenta deshabilitada (tras password correcto)", async () => {
    const c = build({ user: { id: "u1", email: "op@x.cl", passwordHash: "h", status: "DISABLED", mfaEnabled: false, failedLoginCount: 0, lockedUntil: null } });
    await expect(c.service.login({ email: "op@x.cl", password: "ok" }, meta)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("con MFA activo y sin TOTP, exige segundo factor", async () => {
    const c = build({ user: { id: "u1", email: "op@x.cl", passwordHash: "h", status: "ACTIVE", mfaEnabled: true, failedLoginCount: 0, lockedUntil: null } });
    const result = await c.service.login({ email: "op@x.cl", password: "ok" }, meta);
    expect(result.kind).toBe("mfa_required");
  });
});

describe("AuthService — throttle del segundo factor", () => {
  const mfaUser = (over: Record<string, unknown> = {}) => ({
    id: "u1",
    email: "op@x.cl",
    passwordHash: "h",
    status: "ACTIVE",
    mfaEnabled: true,
    failedLoginCount: 0,
    lockedUntil: null,
    mfaFailedCount: 0,
    mfaLockedUntil: null,
    ...over,
  });

  it("TOTP inválido incrementa el contador PROPIO de MFA (no el de contraseña)", async () => {
    const c = build({ user: mfaUser() });
    c.mfa.assertSecondFactor.mockRejectedValue(new UnauthorizedException("x"));
    await expect(
      c.service.login({ email: "op@x.cl", password: "ok", totp: "000000" }, meta),
    ).rejects.toThrow(UnauthorizedException);
    const call = c.prisma.user.update.mock.calls.at(-1)![0];
    expect(call.data.mfaFailedCount).toBe(1);
    expect(call.data.failedLoginCount).toBeUndefined();
  });

  it("al alcanzar el máximo de intentos de MFA, bloquea (mfaLockedUntil)", async () => {
    const c = build({ user: mfaUser({ mfaFailedCount: 4 }), maxFailed: 5 });
    c.mfa.assertSecondFactor.mockRejectedValue(new UnauthorizedException("x"));
    await expect(
      c.service.login({ email: "op@x.cl", password: "ok", totp: "000000" }, meta),
    ).rejects.toThrow();
    const call = c.prisma.user.update.mock.calls.at(-1)![0];
    expect(call.data.mfaLockedUntil).toBeInstanceOf(Date);
    expect(call.data.mfaFailedCount).toBe(0);
  });

  it("rechaza la verificación si el segundo factor está bloqueado temporalmente", async () => {
    const c = build({ user: mfaUser({ mfaLockedUntil: new Date(Date.now() + 60_000) }) });
    await expect(
      c.service.login({ email: "op@x.cl", password: "ok", totp: "000000" }, meta),
    ).rejects.toThrow(/Demasiados intentos/);
    expect(c.mfa.assertSecondFactor).not.toHaveBeenCalled();
  });
});
