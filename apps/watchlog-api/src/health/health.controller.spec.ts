import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";
import type { PrismaService } from "../prisma/prisma.service";

describe("HealthController", () => {
  it("liveness devuelve estado ok", () => {
    const controller = new HealthController({} as PrismaService);
    const res = controller.liveness();
    expect(res.status).toBe("ok");
    expect(res.service).toBe("watchlog-api");
    expect(typeof res.timestamp).toBe("string");
  });

  it("readiness devuelve down si la base de datos falla", async () => {
    const failingPrisma = {
      $queryRaw: () => Promise.reject(new Error("sin conexión")),
    } as unknown as PrismaService;
    const controller = new HealthController(failingPrisma);
    const res = await controller.readiness();
    expect(res.status).toBe("down");
  });
});
