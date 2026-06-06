import { BadRequestException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordResetService } from "./password-reset.service";

/** Usuario elegible por defecto (activo, con contraseña local). */
const ELIGIBLE_USER = {
  id: "u1",
  email: "op@x.cl",
  status: "ACTIVE" as const,
  passwordHash: "old-hash",
};

function build(opts: { user?: Record<string, unknown> | null } = {}) {
  const user = opts.user === undefined ? ELIGIBLE_USER : opts.user;

  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({}),
    },
    passwordResetToken: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "t1" }),
      findUnique: vi.fn(),
    },
    passwordHistory: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const enc = { sha256: vi.fn((v: string) => `h:${v}`) };
  const passwords = { hash: vi.fn().mockResolvedValue("new-hash") };
  const policy = {
    assertComplexity: vi.fn().mockResolvedValue(undefined),
    assertNotReused: vi.fn().mockResolvedValue(undefined),
  };
  const tokens = { revokeAllForUser: vi.fn().mockResolvedValue(undefined) };
  const email = { send: vi.fn().mockResolvedValue(undefined) };
  const cache = { get: vi.fn().mockResolvedValue(null), set: vi.fn().mockResolvedValue(undefined) };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const config = {
    get: (k: string) => (k === "PASSWORD_RESET_TTL" ? 1800 : "http://localhost:5173"),
  };

  const service = new PasswordResetService(
    prisma as never,
    enc as never,
    passwords as never,
    policy as never,
    tokens as never,
    email as never,
    cache as never,
    audit as never,
    config as never,
  );
  return { service, prisma, enc, passwords, policy, tokens, email, cache, audit };
}

const meta = { ip: "127.0.0.1", userAgent: "test" };

/** Espera a que se vacíe la microcola (el correo se envía sin await). */
const flush = () => new Promise((r) => setImmediate(r));

describe("PasswordResetService.requestReset", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("usuario elegible: crea token y envía correo (respuesta neutra)", async () => {
    await ctx.service.requestReset("OP@x.cl", meta);
    await flush();
    expect(ctx.prisma.passwordResetToken.create).toHaveBeenCalledOnce();
    expect(ctx.email.send).toHaveBeenCalledOnce();
    expect(ctx.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "auth.password.reset_requested",
        metadata: { delivered: true },
      }),
    );
  });

  it("usuario desconocido: no crea token ni envía correo (delivered=false)", async () => {
    const c = build({ user: null });
    await c.service.requestReset("nadie@x.cl", meta);
    await flush();
    expect(c.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(c.email.send).not.toHaveBeenCalled();
    expect(c.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { delivered: false } }),
    );
  });

  it("usuario deshabilitado: no envía correo", async () => {
    const c = build({ user: { ...ELIGIBLE_USER, status: "DISABLED" } });
    await c.service.requestReset("op@x.cl", meta);
    await flush();
    expect(c.email.send).not.toHaveBeenCalled();
  });

  it("usuario solo-OIDC (sin contraseña local): no envía correo", async () => {
    const c = build({ user: { ...ELIGIBLE_USER, passwordHash: null } });
    await c.service.requestReset("op@x.cl", meta);
    await flush();
    expect(c.email.send).not.toHaveBeenCalled();
  });

  it("supera el rate-limit: no crea token ni envía, audita throttle", async () => {
    const c = build();
    c.cache.get.mockResolvedValue("99"); // por encima del tope
    await c.service.requestReset("op@x.cl", meta);
    await flush();
    expect(c.prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(c.email.send).not.toHaveBeenCalled();
    expect(c.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.password.reset_throttled" }),
    );
  });
});

describe("PasswordResetService.resetPassword", () => {
  function withToken(token: Record<string, unknown> | null) {
    const c = build();
    c.prisma.passwordResetToken.findUnique.mockResolvedValue(token);
    return c;
  }
  const validToken = () => ({
    id: "t1",
    userId: "u1",
    usedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    user: { ...ELIGIBLE_USER },
  });

  it("token válido: fija la contraseña, revoca sesiones y notifica", async () => {
    const c = withToken(validToken());
    await c.service.resetPassword("raw-token", "NewPass123", meta);
    await flush();
    expect(c.policy.assertComplexity).toHaveBeenCalledWith("NewPass123");
    expect(c.policy.assertNotReused).toHaveBeenCalled();
    expect(c.passwords.hash).toHaveBeenCalledWith("NewPass123");
    expect(c.tokens.revokeAllForUser).toHaveBeenCalledWith("u1");
    expect(c.email.send).toHaveBeenCalledOnce(); // notificación de cambio
    expect(c.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.password.reset_completed" }),
    );
  });

  it("token inexistente: error genérico y auditoría de fallo", async () => {
    const c = withToken(null);
    await expect(c.service.resetPassword("x", "NewPass123", meta)).rejects.toThrow(
      BadRequestException,
    );
    expect(c.tokens.revokeAllForUser).not.toHaveBeenCalled();
    expect(c.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auth.password.reset_failed" }),
    );
  });

  it("token ya usado (single-use): rechaza", async () => {
    const c = withToken({ ...validToken(), usedAt: new Date() });
    await expect(c.service.resetPassword("x", "NewPass123", meta)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("token expirado: rechaza", async () => {
    const c = withToken({ ...validToken(), expiresAt: new Date(Date.now() - 1000) });
    await expect(c.service.resetPassword("x", "NewPass123", meta)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("contraseña que no cumple la política: propaga el error y no cambia nada", async () => {
    const c = withToken(validToken());
    c.policy.assertComplexity.mockRejectedValue(new BadRequestException("débil"));
    await expect(c.service.resetPassword("x", "weak", meta)).rejects.toThrow(BadRequestException);
    expect(c.prisma.user.update).not.toHaveBeenCalled();
    expect(c.tokens.revokeAllForUser).not.toHaveBeenCalled();
  });

  it("reutilización de contraseña reciente: rechaza", async () => {
    const c = withToken(validToken());
    c.policy.assertNotReused.mockRejectedValue(new BadRequestException("reutilizada"));
    await expect(c.service.resetPassword("x", "NewPass123", meta)).rejects.toThrow(
      BadRequestException,
    );
    expect(c.passwords.hash).not.toHaveBeenCalled();
  });
});
