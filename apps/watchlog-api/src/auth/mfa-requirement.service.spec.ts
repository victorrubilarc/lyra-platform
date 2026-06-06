import { beforeEach, describe, expect, it, vi } from "vitest";
import { MfaRequirementService } from "./mfa-requirement.service";

function build(opts: { mode?: string | null; roleCount?: number; enabled?: boolean } = {}) {
  const prisma = {
    passwordPolicy: {
      findUnique: vi.fn().mockResolvedValue(opts.mode === undefined ? { mfaMode: "OPTIONAL" } : opts.mode ? { mfaMode: opts.mode } : null),
    },
    userRole: { count: vi.fn().mockResolvedValue(opts.roleCount ?? 0) },
    user: { findUnique: vi.fn().mockResolvedValue({ mfaEnabled: opts.enabled ?? false }) },
  };
  return { service: new MfaRequirementService(prisma as never), prisma };
}

describe("MfaRequirementService", () => {
  it("OPTIONAL: nadie es requerido", async () => {
    const { service } = build({ mode: "OPTIONAL", roleCount: 5 });
    expect(await service.isRequiredForUser("u1")).toBe(false);
  });

  it("sin política sembrada cae a OPTIONAL", async () => {
    const { service } = build({ mode: null, roleCount: 5 });
    expect(await service.isRequiredForUser("u1")).toBe(false);
  });

  it("REQUIRED_FOR_ALL: siempre requerido, sin mirar roles", async () => {
    const { service, prisma } = build({ mode: "REQUIRED_FOR_ALL", roleCount: 0 });
    expect(await service.isRequiredForUser("u1")).toBe(true);
    expect(prisma.userRole.count).not.toHaveBeenCalled();
  });

  it("REQUIRED_BY_ROLE: requerido solo si algún rol lo exige", async () => {
    expect(await build({ mode: "REQUIRED_BY_ROLE", roleCount: 0 }).service.isRequiredForUser("u1")).toBe(false);
    expect(await build({ mode: "REQUIRED_BY_ROLE", roleCount: 1 }).service.isRequiredForUser("u1")).toBe(true);
  });

  describe("isEnrollmentPending", () => {
    it("requerido y sin MFA activo ⇒ pendiente", async () => {
      const { service } = build({ mode: "REQUIRED_FOR_ALL" });
      expect(await service.isEnrollmentPending({ id: "u1", mfaEnabled: false })).toBe(true);
    });

    it("requerido pero ya tiene MFA ⇒ NO pendiente (corta sin consultar política)", async () => {
      const { service, prisma } = build({ mode: "REQUIRED_FOR_ALL" });
      expect(await service.isEnrollmentPending({ id: "u1", mfaEnabled: true })).toBe(false);
      expect(prisma.passwordPolicy.findUnique).not.toHaveBeenCalled();
    });

    it("no requerido y sin MFA ⇒ NO pendiente", async () => {
      const { service } = build({ mode: "OPTIONAL" });
      expect(await service.isEnrollmentPending({ id: "u1", mfaEnabled: false })).toBe(false);
    });
  });
});

// Silencia mocks colgados entre tests.
beforeEach(() => vi.clearAllMocks());
