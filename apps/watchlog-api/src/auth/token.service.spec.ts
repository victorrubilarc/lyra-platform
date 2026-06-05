import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TokenService } from "./token.service";
import type { ConfigService } from "@nestjs/config";
import type { JwtService } from "@nestjs/jwt";
import type { EncryptionService } from "../crypto/encryption.service";
import type { PrismaService } from "../prisma/prisma.service";

const future = new Date(Date.now() + 60_000);

function build() {
  const refreshToken = {
    findUnique: vi.fn(),
    create: vi.fn().mockResolvedValue({ id: "new-token" }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    findMany: vi.fn().mockResolvedValue([{ sessionId: "s1" }]),
  };
  const session = { update: vi.fn().mockResolvedValue({}), create: vi.fn() };
  const prisma = { refreshToken, session } as unknown as PrismaService;
  const jwt = { signAsync: vi.fn().mockResolvedValue("access.jwt.token") } as unknown as JwtService;
  const enc = { sha256: (v: string) => `hash:${v}` } as unknown as EncryptionService;
  const config = {
    get: (key: string) => (key === "JWT_ACCESS_TTL" ? 900 : 2_592_000),
  } as unknown as ConfigService<never, true>;
  const service = new TokenService(prisma, jwt, enc, config);
  return { service, prisma, refreshToken, session, jwt };
}

describe("TokenService — rotación de refresh", () => {
  let ctx: ReturnType<typeof build>;
  beforeEach(() => {
    ctx = build();
  });

  it("rota un token válido y marca el anterior como usado", async () => {
    ctx.refreshToken.findUnique.mockResolvedValue({
      id: "t1",
      sessionId: "s1",
      userId: "u1",
      familyId: "f1",
      usedAt: null,
      revokedAt: null,
      expiresAt: future,
      session: { revokedAt: null },
      user: { id: "u1", email: "e@x.cl" },
    });

    const issued = await ctx.service.rotate("raw-token", {});
    expect(issued.accessToken).toBe("access.jwt.token");
    expect(issued.expiresIn).toBe(900);
    expect(ctx.refreshToken.create).toHaveBeenCalledOnce();
    // El token anterior queda marcado como usado y enlazado al nuevo.
    expect(ctx.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: expect.objectContaining({ replacedById: "new-token" }),
      }),
    );
    expect(ctx.refreshToken.update.mock.calls[0]![0].data.usedAt).toBeInstanceOf(Date);
  });

  it("detecta el reuso de un token ya rotado y revoca la familia", async () => {
    ctx.refreshToken.findUnique.mockResolvedValue({
      id: "t1",
      sessionId: "s1",
      userId: "u1",
      familyId: "f1",
      usedAt: new Date(), // ya fue rotado
      revokedAt: null,
      expiresAt: future,
      session: { revokedAt: null },
      user: { id: "u1", email: "e@x.cl" },
    });

    await expect(ctx.service.rotate("raw-token", {})).rejects.toThrow(UnauthorizedException);
    // Revocó toda la familia y no emitió token nuevo.
    expect(ctx.refreshToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { familyId: "f1", revokedAt: null } }),
    );
    expect(ctx.session.update).toHaveBeenCalled();
    expect(ctx.refreshToken.create).not.toHaveBeenCalled();
  });

  it("rechaza un token inexistente", async () => {
    ctx.refreshToken.findUnique.mockResolvedValue(null);
    await expect(ctx.service.rotate("x", {})).rejects.toThrow(UnauthorizedException);
  });

  it("rechaza un token revocado", async () => {
    ctx.refreshToken.findUnique.mockResolvedValue({
      id: "t1",
      familyId: "f1",
      usedAt: null,
      revokedAt: new Date(),
      expiresAt: future,
      session: { revokedAt: null },
      user: { id: "u1", email: "e@x.cl" },
    });
    await expect(ctx.service.rotate("x", {})).rejects.toThrow(UnauthorizedException);
  });

  it("rechaza un token expirado", async () => {
    ctx.refreshToken.findUnique.mockResolvedValue({
      id: "t1",
      sessionId: "s1",
      familyId: "f1",
      usedAt: null,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      session: { revokedAt: null },
      user: { id: "u1", email: "e@x.cl" },
    });
    await expect(ctx.service.rotate("x", {})).rejects.toThrow(UnauthorizedException);
  });
});
