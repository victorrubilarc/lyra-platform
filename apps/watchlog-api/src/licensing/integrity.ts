import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

/**
 * Auto-verificación de INTEGRIDAD del artefacto crítico (Licenciamiento L5,
 * capa 3 de LICENSING_STRATEGY §5 / LICENSING.md §7.4).
 *
 * Cómo funciona el sello:
 *  - Este módulo declara el marcador `INTEGRITY_SEAL` con el hash EN CEROS
 *    (estado "sin sellar" = dev/CI/tests).
 *  - El build de release empaqueta TODA la API en un único `dist/main.js`
 *    minificado y luego `scripts/license/seal-integrity.mjs` calcula el
 *    SHA-256 del bundle CON LA REGIÓN DEL HASH NORMALIZADA A CEROS y escribe
 *    el hash real dentro del marcador. El sello vive DENTRO del artefacto
 *    sellado: no hay un archivo aparte que adulterar por separado.
 *  - En runtime, la constante en memoria ES el hash esperado (el loader la
 *    leyó del archivo sellado); verificar = releer el propio archivo desde
 *    disco, normalizar el marcador a ceros, hashear y comparar.
 *
 * Honestidad (LICENSING_STRATEGY §5): esto es CAPA DE REFUERZO, no bóveda.
 * Quien edite el bundle puede también re-sellarlo o extirpar el chequeo — el
 * objetivo es que eso exija entender un blob minificado y encontrar TODOS los
 * puntos de verificación (distribuidos), no cambiar un `if` en una tarde.
 *
 * Un fallo de integridad JAMÁS es destructivo: el consumidor (LicenseService /
 * worker) degrada a BLOQUEADA con reason `INTEGRITY_MISMATCH` = solo lectura +
 * exportación, igual que cualquier estado restringido de la máquina §5.
 */

/** Largo del hash embebido (SHA-256 en hex). */
export const SEAL_HASH_LENGTH = 64;

/**
 * Prefijo del marcador, construido EN RUNTIME (join) a propósito: así el texto
 * contiguo del marcador aparece UNA sola vez en el artefacto — solo en la
 * constante `INTEGRITY_SEAL` de abajo — y el sellador puede exigir unicidad.
 */
const SEAL_PREFIX = ["LYRA", "INTEGRITY", "SEAL"].join("-") + "::";

/**
 * EL marcador sellable (única ocurrencia literal del prefijo en todo el
 * código). El build de release reemplaza los 64 ceros por el SHA-256 real del
 * bundle; en dev/CI queda en ceros = "sin sello".
 */
export const INTEGRITY_SEAL =
  "LYRA-INTEGRITY-SEAL::0000000000000000000000000000000000000000000000000000000000000000";

const UNSEALED_HASH = "0".repeat(SEAL_HASH_LENGTH);

/**
 * Artefacto sellado = ESTE archivo en runtime: en la imagen de release,
 * `__filename` es `dist/main.js` (el bundle único donde este módulo quedó
 * inlineado); en dev es `dist/licensing/integrity.js` (sin sello, inerte).
 * Única constante con la ruta del artefacto — nada de strings regados.
 */
export const SEALED_ARTIFACT: string = __filename;

export type IntegrityOutcome = "SEALED_OK" | "UNSEALED" | "MISMATCH";

/** Hash esperado según el sello embebido (ceros = artefacto sin sellar). */
export function embeddedSealHash(): string {
  return INTEGRITY_SEAL.slice(SEAL_PREFIX.length);
}

/**
 * Normaliza el contenido del artefacto: TODA ocurrencia del marcador queda con
 * su región de hash en ceros, para hashear el archivo "como si no estuviera
 * sellado". La usan por igual el sellador del build y la verificación runtime
 * (una sola implementación del algoritmo).
 */
export function normalizeSealedContent(content: Buffer): Buffer {
  const out = Buffer.from(content);
  const prefix = Buffer.from(SEAL_PREFIX, "utf8");
  let idx = out.indexOf(prefix);
  while (idx !== -1) {
    const start = idx + prefix.length;
    out.fill(0x30 /* "0" */, start, Math.min(start + SEAL_HASH_LENGTH, out.length));
    idx = out.indexOf(prefix, start + SEAL_HASH_LENGTH);
  }
  return out;
}

/** SHA-256 (hex) del contenido normalizado — el valor que se sella. */
export function computeSealHash(content: Buffer): string {
  return createHash("sha256").update(normalizeSealedContent(content)).digest("hex");
}

export interface VerifyIntegrityOptions {
  /** Ruta del artefacto a verificar (default: el propio bundle/módulo). */
  artifactPath?: string;
  /** Hash esperado (default: el sello embebido en esta compilación). */
  expectedHash?: string;
  /**
   * Si el sello es OBLIGATORIO (build de producción): sin sello ⇒ MISMATCH.
   * En dev/CI/tests (false) un artefacto sin sellar es legítimo (UNSEALED).
   */
  requireSeal?: boolean;
  /** Lector inyectable (tests). */
  read?: (path: string) => Promise<Buffer>;
}

/**
 * Verifica la integridad del artefacto RELEYÉNDOLO desde disco en cada
 * llamada (sin booleano cacheado: cada punto de la verificación distribuida
 * recomputa por su cuenta, como `workersOperational` re-verifica la firma).
 * Nunca lanza: cualquier error de lectura con sello exigido degrada a
 * MISMATCH (restringido, jamás destructivo), y sin sello exigido a UNSEALED.
 */
export async function verifyArtifactIntegrity(
  options: VerifyIntegrityOptions = {},
): Promise<IntegrityOutcome> {
  const expected = options.expectedHash ?? embeddedSealHash();
  const requireSeal = options.requireSeal ?? false;
  if (expected === UNSEALED_HASH) {
    // Compilación sin sellar: legítima en dev/CI; en producción (donde el
    // build SIEMPRE sella) un sello en ceros es señal de adulteración.
    return requireSeal ? "MISMATCH" : "UNSEALED";
  }
  const read = options.read ?? ((path: string) => readFile(path));
  let content: Buffer;
  try {
    content = await read(options.artifactPath ?? SEALED_ARTIFACT);
  } catch {
    return requireSeal ? "MISMATCH" : "UNSEALED";
  }
  return computeSealHash(content) === expected ? "SEALED_OK" : "MISMATCH";
}
