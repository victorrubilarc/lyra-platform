import { BadRequestException, UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReauthService } from "./reauth.service";
import type { MfaService } from "./mfa.service";
import type { PasswordService } from "../crypto/password.service";
import type { PrismaService } from "../prisma/prisma.service";

function make(userOver: Record<string, unknown> = {}, opts: { passOk?: boolean; mfaThrows?: boolean } = {}) {
  const user = { id: "u1", email: "u@x.cl", displayName: "Demo User", passwordHash: "hash", mfaEnabled: false, ...userOver };
  const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user) } } as unknown as PrismaService;
  const passwords = { verify: vi.fn().mockResolvedValue(opts.passOk ?? true) } as unknown as PasswordService;
  const mfa = {
    assertSecondFactor: vi.fn().mockImplementation(() => (opts.mfaThrows ? Promise.reject(new UnauthorizedException()) : Promise.resolve())),
  } as unknown as MfaService;
  return { service: new ReauthService(prisma, passwords, mfa), passwords, mfa };
}

describe("ReauthService.verifyForSignature", () => {
  beforeEach(() => vi.clearAllMocks());

  it("re-autentica con contraseña (método PASSWORD) cuando no se exige MFA", async () => {
    const { service } = make();
    const res = await service.verifyForSignature("u1", { password: "good" }, { requireMfa: false });
    expect(res).toEqual({ method: "PASSWORD", signerName: "Demo User" });
  });

  it("rechaza una contraseña inválida", async () => {
    const { service } = make({}, { passOk: false });
    await expect(service.verifyForSignature("u1", { password: "bad" }, { requireMfa: false })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rechaza si no se entrega contraseña", async () => {
    const { service } = make();
    await expect(service.verifyForSignature("u1", {}, { requireMfa: false })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("exige segundo factor cuando requireMfa y devuelve método PASSWORD_MFA", async () => {
    const { service, mfa } = make({ mfaEnabled: true });
    const res = await service.verifyForSignature("u1", { password: "good", mfaCode: "123456" }, { requireMfa: true });
    expect(mfa.assertSecondFactor).toHaveBeenCalledWith("u1", "123456");
    expect(res.method).toBe("PASSWORD_MFA");
  });

  it("rechaza step-up si el usuario no tiene MFA activo", async () => {
    const { service } = make({ mfaEnabled: false });
    await expect(
      service.verifyForSignature("u1", { password: "good", mfaCode: "123456" }, { requireMfa: true }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rechaza un segundo factor inválido", async () => {
    const { service } = make({ mfaEnabled: true }, { mfaThrows: true });
    await expect(
      service.verifyForSignature("u1", { password: "good", mfaCode: "000000" }, { requireMfa: true }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
