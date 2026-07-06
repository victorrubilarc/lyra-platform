import { describe, expect, it, vi } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { LicenseLimits } from "@lyra/licensing";
import { LicenseLimitsService } from "./license-limits.service";

/**
 * Enforcement de límites numéricos (L2b). El helper es la pieza que llaman los
 * servicios de creación: aquí se afirma la política (borde, lote, precedencia
 * sin payload) con Prisma y LicenseService falsos.
 */
function build(opts: { limits?: LicenseLimits; nodes?: number; users?: number }) {
  const prisma = {
    orgNode: { count: vi.fn(async () => opts.nodes ?? 0) },
    user: { count: vi.fn(async () => opts.users ?? 0) },
  };
  const license = { verifiedLimits: vi.fn(() => opts.limits) };
  return {
    service: new LicenseLimitsService(prisma as never, license as never),
    prisma,
    license,
  };
}

const LIMITS: LicenseLimits = { maxInstallations: 1, maxNodes: 10, maxNamedUsers: 5 };

async function forbidden(promise: Promise<void>): Promise<Record<string, unknown>> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ForbiddenException);
    return (err as ForbiddenException).getResponse() as Record<string, unknown>;
  }
  throw new Error("se esperaba ForbiddenException");
}

describe("LicenseLimitsService", () => {
  it("con holgura: crear pasa (current + requested <= max)", async () => {
    const { service } = build({ limits: LIMITS, nodes: 8, users: 3 });
    await expect(service.assertHeadroom("maxNodes")).resolves.toBeUndefined();
    await expect(service.assertHeadroom("maxNamedUsers")).resolves.toBeUndefined();
  });

  it("llegar JUSTO al tope pasa; el siguiente se rechaza (borde current == max)", async () => {
    const { service: conCupo } = build({ limits: LIMITS, nodes: 9 });
    await expect(conCupo.assertHeadroom("maxNodes")).resolves.toBeUndefined();

    const { service: alTope } = build({ limits: LIMITS, nodes: 10 });
    const body = await forbidden(alTope.assertHeadroom("maxNodes"));
    expect(body).toMatchObject({
      code: "LICENSE_LIMIT_EXCEEDED",
      limit: "maxNodes",
      max: 10,
      current: 10,
      requested: 1,
    });
    expect(body.message).toContain("hasta 10 nodos de estructura");
    expect(body.message).toContain("tu proveedor");
  });

  it("usuarios: el tope es de usuarios ACTIVOS y el mensaje sugiere deshabilitar", async () => {
    const { service, prisma } = build({ limits: LIMITS, users: 5 });
    const body = await forbidden(service.assertHeadroom("maxNamedUsers"));
    expect(body).toMatchObject({ limit: "maxNamedUsers", max: 5, current: 5 });
    expect(body.message).toContain("usuarios activos");
    expect(body.message).toContain("deshabilita usuarios");
    expect(prisma.user.count).toHaveBeenCalledWith({ where: { status: "ACTIVE" } });
    expect(prisma.orgNode.count).toHaveBeenCalledWith({ where: { deletedAt: null } });
  });

  it("LOTE (wizard provision): o cabe completo o se rechaza, diciendo cuántos caben", async () => {
    const { service } = build({ limits: LIMITS, nodes: 8 });
    await expect(service.assertHeadroom("maxNodes", 2)).resolves.toBeUndefined();

    const body = await forbidden(service.assertHeadroom("maxNodes", 3));
    expect(body).toMatchObject({ requested: 3, max: 10, current: 8 });
    expect(body.message).toContain("solicita 3");
    expect(body.message).toContain("caben 2");
  });

  it("YA sobre el tope (downgrade): crear se rechaza con current > max — lo existente no es asunto de este helper", async () => {
    const { service } = build({ limits: LIMITS, nodes: 14 });
    const body = await forbidden(service.assertHeadroom("maxNodes"));
    expect(body).toMatchObject({ max: 10, current: 14 });
    expect(body.message).toContain("Todo lo existente sigue operando");
  });

  it("SIN payload verificado NO opina (precedencia: gobierna el guard global de L1)", async () => {
    const { service, prisma } = build({ limits: undefined, nodes: 999 });
    await expect(service.assertHeadroom("maxNodes")).resolves.toBeUndefined();
    // Ni siquiera cuenta: no hay tope que contrastar.
    expect(prisma.orgNode.count).not.toHaveBeenCalled();
  });

  it("currentUsage: conteo VIVO de ambos recursos (para el DTO del hint web)", async () => {
    const { service } = build({ limits: LIMITS, nodes: 7, users: 4 });
    await expect(service.currentUsage()).resolves.toEqual({ nodes: 7, namedUsers: 4 });
  });
});
