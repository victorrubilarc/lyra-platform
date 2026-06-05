import { describe, expect, it } from "vitest";
import { healthStatusSchema } from "./health.js";

describe("healthStatusSchema", () => {
  it("acepta un estado válido", () => {
    const parsed = healthStatusSchema.parse({
      status: "ok",
      service: "watchlog-api",
      version: "0.0.0",
      timestamp: new Date().toISOString(),
    });
    expect(parsed.status).toBe("ok");
  });

  it("rechaza un status desconocido", () => {
    expect(() =>
      healthStatusSchema.parse({
        status: "explotó",
        service: "x",
        version: "0",
        timestamp: "now",
      }),
    ).toThrow();
  });
});
