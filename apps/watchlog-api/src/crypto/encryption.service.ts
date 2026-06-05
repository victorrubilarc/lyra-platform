import { Injectable, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { Env } from "../config/env.schema";

/**
 * Cifrado simétrico de secretos en reposo (AES-256-GCM) y utilidades de hash.
 * La clave proviene de APP_ENC_KEY (base64 de 32 bytes). Usado para el secreto
 * TOTP del MFA; reutilizable para otros secretos (orígenes de datos, Fase 3).
 *
 * Formato del texto cifrado: base64( iv(12) || authTag(16) || ciphertext ).
 */
@Injectable()
export class EncryptionService implements OnModuleInit {
  private key!: Buffer;

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const raw = this.config.get("APP_ENC_KEY", { infer: true });
    const key = Buffer.from(raw, "base64");
    if (key.length !== 32) {
      throw new Error(
        "APP_ENC_KEY debe ser 32 bytes en base64 (genera con: openssl rand -base64 32)",
      );
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
  }

  decrypt(payload: string): string {
    const buf = Buffer.from(payload, "base64");
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const ciphertext = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  }

  /** SHA-256 en hex. Para hashear refresh tokens y recovery codes (no reversible). */
  sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  /** Comparación en tiempo constante de dos hashes hex del mismo largo. */
  safeEqualHex(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  }
}
