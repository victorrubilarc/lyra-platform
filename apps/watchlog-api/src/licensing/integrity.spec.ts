import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  computeSealHash,
  embeddedSealHash,
  INTEGRITY_SEAL,
  normalizeSealedContent,
  SEAL_HASH_LENGTH,
  verifyArtifactIntegrity,
} from "./integrity";

const PREFIX = "LYRA-INTEGRITY-SEAL::";
const ZEROS = "0".repeat(SEAL_HASH_LENGTH);

/** Simula lo que hace scripts/license/seal-integrity.mjs sobre el bundle. */
function seal(content: string): { sealed: Buffer; hash: string } {
  const buffer = Buffer.from(content, "utf8");
  const hash = computeSealHash(buffer);
  return { sealed: Buffer.from(content.replace(PREFIX + ZEROS, PREFIX + hash), "utf8"), hash };
}

function artifact(body: string): string {
  return `"use strict";const S="${PREFIX}${ZEROS}";${body}`;
}

describe("integrity (L5) — sello y verificación", () => {
  it("el marcador embebido de esta compilación está SIN sellar (dev/tests)", () => {
    expect(INTEGRITY_SEAL).toBe(PREFIX + ZEROS);
    expect(embeddedSealHash()).toBe(ZEROS);
  });

  it("normalizeSealedContent deja el hash del marcador en ceros (idempotente)", () => {
    const { sealed } = seal(artifact("x()"));
    const normalized = normalizeSealedContent(sealed);
    expect(normalized.toString("utf8")).toContain(PREFIX + ZEROS);
    // Idempotencia: normalizar lo ya normalizado no cambia nada.
    expect(normalizeSealedContent(normalized).equals(normalized)).toBe(true);
    // No toca el resto del contenido.
    expect(normalized.toString("utf8")).toContain("x()");
  });

  it("round-trip: sellar y verificar ⇒ SEALED_OK", async () => {
    const { sealed, hash } = seal(artifact("op()"));
    await expect(
      verifyArtifactIntegrity({ expectedHash: hash, read: async () => sealed }),
    ).resolves.toBe("SEALED_OK");
    // El hash sellado coincide con recomputarlo sobre el archivo sellado
    // (la normalización hace que sellar no altere el valor).
    expect(computeSealHash(sealed)).toBe(hash);
  });

  it("artefacto adulterado tras el sellado ⇒ MISMATCH (un solo byte basta)", async () => {
    const { sealed, hash } = seal(artifact("if(licencia)permitir()"));
    const tampered = Buffer.from(
      sealed.toString("utf8").replace("permitir()", "permitir(1)"),
      "utf8",
    );
    await expect(
      verifyArtifactIntegrity({ expectedHash: hash, read: async () => tampered }),
    ).resolves.toBe("MISMATCH");
  });

  it("sin sello (ceros): UNSEALED en dev y MISMATCH cuando el sello es obligatorio", async () => {
    const read = async (): Promise<Buffer> => Buffer.from(artifact("x()"), "utf8");
    await expect(verifyArtifactIntegrity({ expectedHash: ZEROS, read })).resolves.toBe("UNSEALED");
    // En producción el build SIEMPRE sella: ceros = señal de adulteración
    // (cierra el bypass "borro el hash y quedo como dev").
    await expect(
      verifyArtifactIntegrity({ expectedHash: ZEROS, requireSeal: true, read }),
    ).resolves.toBe("MISMATCH");
  });

  it("artefacto sellado ilegible ⇒ MISMATCH con sello obligatorio (fail-closed, jamás lanza)", async () => {
    const read = async (): Promise<Buffer> => {
      throw new Error("EACCES");
    };
    const expected = createHash("sha256").update("cualquiera").digest("hex");
    await expect(
      verifyArtifactIntegrity({ expectedHash: expected, requireSeal: true, read }),
    ).resolves.toBe("MISMATCH");
    await expect(verifyArtifactIntegrity({ expectedHash: expected, read })).resolves.toBe(
      "UNSEALED",
    );
  });

  it("normaliza TODAS las ocurrencias del marcador (el sellador exige unicidad aparte)", () => {
    const twice = Buffer.from(
      `a="${PREFIX}${"f".repeat(64)}";b="${PREFIX}${"e".repeat(64)}"`,
      "utf8",
    );
    const normalized = normalizeSealedContent(twice).toString("utf8");
    expect(normalized).toBe(`a="${PREFIX}${ZEROS}";b="${PREFIX}${ZEROS}"`);
  });

  it("verificación real de ESTE módulo compilado: UNSEALED (dev, sin requireSeal)", async () => {
    // __filename en dev/tests apunta a este árbol sin sellar: el chequeo queda
    // inerte (UNSEALED), que es exactamente el comportamiento del carril dev.
    await expect(verifyArtifactIntegrity()).resolves.toBe("UNSEALED");
  });
});
