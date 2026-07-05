import { createPrivateKey, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Custodia de la clave privada de emisión (decisión (b), DECISIONS 2026-07-05).
 *
 * La privada se guarda como **PKCS#8 CIFRADO con passphrase (aes-256-cbc)** vía
 * `node:crypto` — formato estándar, recuperable con `openssl pkcs8` si esta CLI
 * no existiera. El KDF de PKCS#8 es modesto, por eso `keygen` GENERA una
 * passphrase de alta entropía (128 bits) que el emisor guarda en su gestor de
 * contraseñas: contra fuerza bruta manda la entropía de la passphrase, no el KDF.
 *
 * Reglas nucleares: la privada JAMÁS se escribe en claro a disco, JAMÁS entra
 * al repo/imagen/.env, y solo se descifra EN MEMORIA en el instante de firmar.
 */

/** Alfabeto legible (sin 0/O, 1/l/I) para passphrases dictables por humanos. */
const PASSPHRASE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ";
const PASSPHRASE_GROUPS = 5;
const PASSPHRASE_GROUP_LEN = 5;

/**
 * Genera una passphrase aleatoria de alta entropía (~29 bits por grupo de 5,
 * ~145 bits total), agrupada para poder dictarla/transcribirla sin errores.
 */
export function generatePassphrase(): string {
  const groups: string[] = [];
  for (let g = 0; g < PASSPHRASE_GROUPS; g += 1) {
    let group = "";
    // Rechazo por rango para no sesgar el módulo (el alfabeto no divide a 256).
    while (group.length < PASSPHRASE_GROUP_LEN) {
      const byte = randomBytes(1)[0]!;
      if (byte < PASSPHRASE_ALPHABET.length * Math.floor(256 / PASSPHRASE_ALPHABET.length)) {
        group += PASSPHRASE_ALPHABET[byte % PASSPHRASE_ALPHABET.length];
      }
    }
    groups.push(group);
  }
  return groups.join("-");
}

export interface KeygenResult {
  publicKeyPem: string;
  privateKeyPath: string;
  publicKeyPath: string;
}

/**
 * Genera un par Ed25519 de emisión y lo persiste: privada = PKCS#8 cifrado con
 * la passphrase; pública = SPKI PEM en claro (no es secreto). Se niega a
 * sobreescribir un par existente salvo `force` (perder la privada de PROD
 * invalidaría TODA licencia emitida con ella).
 */
export function keygen(opts: {
  privateKeyPath: string;
  publicKeyPath: string;
  passphrase: string;
  force?: boolean;
}): KeygenResult {
  if (opts.passphrase.length < 12) {
    throw new Error("la passphrase debe tener al menos 12 caracteres (usa la generada)");
  }
  if (!opts.force && (existsSync(opts.privateKeyPath) || existsSync(opts.publicKeyPath))) {
    throw new Error(
      `ya existe un par en ${dirname(opts.privateKeyPath)} — sobreescribirlo invalidaría las licencias emitidas (usa --force solo si sabes lo que haces)`,
    );
  }

  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "pem",
      cipher: "aes-256-cbc",
      passphrase: opts.passphrase,
    },
  });

  mkdirSync(dirname(opts.privateKeyPath), { recursive: true });
  // mode 0o600: solo el emisor lee su privada (no-op efectivo en Windows).
  writeFileSync(opts.privateKeyPath, privateKey, { encoding: "utf8", mode: 0o600 });
  writeFileSync(opts.publicKeyPath, publicKey, "utf8");

  return {
    publicKeyPem: publicKey,
    privateKeyPath: opts.privateKeyPath,
    publicKeyPath: opts.publicKeyPath,
  };
}

/**
 * Carga una clave privada de emisión y la devuelve como PKCS#8 PEM EN CLARO,
 * SOLO en memoria, lista para `signLicense` (que la recibe por parámetro).
 *
 * Acepta tanto el PEM cifrado de la custodia (exige passphrase) como un PEM en
 * claro (el par DEV committeado, que no es secreto). Passphrase incorrecta o
 * clave que no sea Ed25519 ⇒ error claro, jamás silencioso.
 */
export function loadPrivateKeyPem(pemFilePath: string, passphrase?: string): string {
  const raw = readFileSync(pemFilePath, "utf8");
  const encrypted = raw.includes("ENCRYPTED");
  if (encrypted && (passphrase === undefined || passphrase.length === 0)) {
    throw new Error(
      `la clave privada ${pemFilePath} está cifrada: falta la passphrase (prompt, ${"LYRA_LICENSE_PASSPHRASE"} o ${"LYRA_LICENSE_PASSPHRASE_FILE"})`,
    );
  }
  let key;
  try {
    key = encrypted ? createPrivateKey({ key: raw, passphrase }) : createPrivateKey(raw);
  } catch {
    throw new Error(
      encrypted
        ? `no se pudo descifrar ${pemFilePath}: passphrase incorrecta o archivo corrupto`
        : `no se pudo leer la clave privada ${pemFilePath}: PEM inválido`,
    );
  }
  if (key.asymmetricKeyType !== "ed25519") {
    throw new Error(`la clave de ${pemFilePath} no es Ed25519 (${key.asymmetricKeyType ?? "?"})`);
  }
  return key.export({ type: "pkcs8", format: "pem" }).toString();
}
