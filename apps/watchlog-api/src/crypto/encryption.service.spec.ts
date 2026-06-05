import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env.schema";
import { EncryptionService } from "./encryption.service";

function makeService(key = randomBytes(32).toString("base64")): EncryptionService {
  const config = { get: () => key } as unknown as ConfigService<Env, true>;
  const service = new EncryptionService(config);
  service.onModuleInit();
  return service;
}

describe("EncryptionService (AES-256-GCM)", () => {
  it("cifra y descifra (roundtrip)", () => {
    const service = makeService();
    const secret = "JBSWY3DPEHPK3PXP";
    const enc = service.encrypt(secret);
    expect(enc).not.toContain(secret);
    expect(service.decrypt(enc)).toBe(secret);
  });

  it("produce ciphertext distinto cada vez (IV aleatorio)", () => {
    const service = makeService();
    expect(service.encrypt("x")).not.toBe(service.encrypt("x"));
  });

  it("falla al descifrar si el contenido fue alterado (authTag)", () => {
    const service = makeService();
    const enc = service.encrypt("dato");
    const tampered = Buffer.from(enc, "base64");
    const last = tampered.length - 1;
    tampered[last] = (tampered[last] ?? 0) ^ 0xff;
    expect(() => service.decrypt(tampered.toString("base64"))).toThrow();
  });

  it("rechaza una clave que no mide 32 bytes", () => {
    expect(() => makeService(randomBytes(16).toString("base64"))).toThrow(/32 bytes/);
  });

  it("sha256 es determinista y safeEqualHex compara bien", () => {
    const service = makeService();
    const a = service.sha256("token");
    const b = service.sha256("token");
    expect(a).toBe(b);
    expect(service.safeEqualHex(a, b)).toBe(true);
    expect(service.safeEqualHex(a, service.sha256("otro"))).toBe(false);
  });
});
