import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Ledger de emisiones del EMISOR (decisión (e), DECISIONS 2026-07-05):
 * JSON Lines APPEND-ONLY con cadena de hashes (cada entrada sella la anterior
 * vía `prevHash` ⇒ tamper-evident: editar o borrar una línea rompe la cadena).
 *
 * Es la base del control de banda del socio (LICENSING_PROCEDURE §3/§5): aquí
 * ITESICWS lleva la cuenta de quién/cuándo/qué instalación/con qué límites.
 * Vive en la máquina del emisor (`~/.lyra-license/ledger.jsonl`), JAMÁS en el
 * producto ni en el repo. En L3 la banda solo se REGISTRA (el resumen por socio
 * la hace visible); el enforcement contractual es decisión comercial futura.
 */
export interface LedgerEntryInput {
  issuedAt: string;
  licenseId: string;
  installationId: string;
  fingerprint: string;
  customer: string;
  channelPartner: string;
  edition: string;
  modules: string[];
  limits: { maxInstallations: number; maxNodes: number; maxNamedUsers: number };
  notBefore: string;
  expiresAt: string;
  graceDays: number;
  issuer: string;
  /** sha256 (hex) del archivo `license.lic` emitido. */
  licSha256: string;
  /** Identificador corto del par firmante (sha256 del SPKI de la pública). */
  publicKeyId: string;
}

export interface LedgerEntry extends LedgerEntryInput {
  seq: number;
  prevHash: string;
  hash: string;
}

const GENESIS_HASH = "GENESIS";

/** JSON canónico (claves ordenadas, recursivo) — el hash no depende del orden. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const body = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

function entryHash(entry: Omit<LedgerEntry, "hash">): string {
  return createHash("sha256").update(canonicalJson(entry), "utf8").digest("hex");
}

/** Lee y parsea el ledger completo (vacío si no existe). Lanza si una línea no es JSON. */
export function readLedger(path: string): LedgerEntry[] {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.map((line, i) => {
    try {
      return JSON.parse(line) as LedgerEntry;
    } catch {
      throw new Error(`ledger corrupto: la línea ${i + 1} no es JSON válido`);
    }
  });
}

/**
 * Agrega una emisión al final del ledger (append-only: `appendFileSync`, nunca
 * se reescribe el archivo). Encadena con el hash de la última entrada.
 */
export function appendLedgerEntry(path: string, input: LedgerEntryInput): LedgerEntry {
  const entries = readLedger(path);
  const last = entries[entries.length - 1];
  const withoutHash: Omit<LedgerEntry, "hash"> = {
    ...input,
    seq: (last?.seq ?? 0) + 1,
    prevHash: last?.hash ?? GENESIS_HASH,
  };
  const entry: LedgerEntry = { ...withoutHash, hash: entryHash(withoutHash) };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
  return entry;
}

/**
 * Verifica la cadena completa: secuencia contigua, `prevHash` que calza y hash
 * recomputado idéntico. Devuelve el primer defecto o null si está íntegra.
 */
export function verifyLedgerChain(entries: LedgerEntry[]): string | null {
  let prevHash = GENESIS_HASH;
  for (const [i, entry] of entries.entries()) {
    if (entry.seq !== i + 1) {
      return `entrada ${i + 1}: seq ${entry.seq} fuera de secuencia (¿línea borrada?)`;
    }
    if (entry.prevHash !== prevHash) {
      return `entrada ${entry.seq}: prevHash no calza con la entrada anterior`;
    }
    const { hash, ...rest } = entry;
    if (entryHash(rest) !== hash) {
      return `entrada ${entry.seq}: hash no calza (contenido adulterado)`;
    }
    prevHash = hash;
  }
  return null;
}

/** Resumen de emisiones por socio (control de banda, LICENSING_PROCEDURE §3). */
export function summarizeByPartner(entries: LedgerEntry[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.channelPartner, (counts.get(entry.channelPartner) ?? 0) + 1);
  }
  return counts;
}
