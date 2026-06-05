import { describe, expect, it } from "vitest";
import { PasswordService } from "./password.service";

describe("PasswordService (Argon2id)", () => {
  const service = new PasswordService();

  it("hashea y verifica correctamente", async () => {
    const hash = await service.hash("Sup3rSecret!");
    expect(hash).not.toBe("Sup3rSecret!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await service.verify(hash, "Sup3rSecret!")).toBe(true);
  });

  it("rechaza una contraseña incorrecta", async () => {
    const hash = await service.hash("correcta");
    expect(await service.verify(hash, "incorrecta")).toBe(false);
  });

  it("no lanza con un hash malformado, devuelve false", async () => {
    expect(await service.verify("no-es-un-hash", "x")).toBe(false);
  });

  it("verifyDummy siempre devuelve false (timing constante)", async () => {
    expect(await service.verifyDummy("cualquier-cosa")).toBe(false);
  });
});
