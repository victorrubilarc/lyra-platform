import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Rutas de la custodia del EMISOR (ITESICWS). Todo vive FUERA del repo, en la
 * máquina del emisor (LYRA_LICENSE_HOME, def. `~/.lyra-license/`):
 *
 * - `prod-private.enc.pem` — clave privada de emisión, PKCS#8 CIFRADO con
 *   passphrase (aes-256-cbc). JAMÁS entra al repo/imagen/.env/logs.
 * - `prod-public.pem` — la pública correspondiente (no es secreto; se embebe
 *   en el build de release vía `scripts/license/embed-public-key.mjs`).
 * - `ledger.jsonl` — registro append-only de emisiones (LICENSING_PROCEDURE §3).
 */
export const LICENSE_HOME_ENV = "LYRA_LICENSE_HOME";
export const PASSPHRASE_ENV = "LYRA_LICENSE_PASSPHRASE";
export const PASSPHRASE_FILE_ENV = "LYRA_LICENSE_PASSPHRASE_FILE";

export const PRIVATE_KEY_FILE = "prod-private.enc.pem";
export const PUBLIC_KEY_FILE = "prod-public.pem";
export const LEDGER_FILE = "ledger.jsonl";

/** Carpeta de custodia del emisor; por env o `~/.lyra-license`. */
export function licenseHome(env: NodeJS.ProcessEnv = process.env): string {
  const fromEnv = env[LICENSE_HOME_ENV]?.trim();
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : join(homedir(), ".lyra-license");
}

export function privateKeyPath(home: string): string {
  return join(home, PRIVATE_KEY_FILE);
}

export function publicKeyPath(home: string): string {
  return join(home, PUBLIC_KEY_FILE);
}

export function ledgerPath(home: string): string {
  return join(home, LEDGER_FILE);
}
