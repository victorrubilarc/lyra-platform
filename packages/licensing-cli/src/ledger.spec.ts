import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  appendLedgerEntry,
  readLedger,
  summarizeByPartner,
  verifyLedgerChain,
  type LedgerEntryInput,
} from "./ledger.js";

function makeEntryInput(n: number, partner = "SOCIO_A"): LedgerEntryInput {
  return {
    issuedAt: `2026-07-0${n}T12:00:00.000Z`,
    licenseId: `lic_2026_cliente_${n}`,
    installationId: `inst_${n}`,
    fingerprint: "0123456789abcdef0123456789abcdef",
    customer: `Cliente ${n}`,
    channelPartner: partner,
    edition: "professional",
    modules: ["core", "logbook"],
    limits: { maxInstallations: 1, maxNodes: 100, maxNamedUsers: 50 },
    notBefore: "2026-07-01T00:00:00.000Z",
    expiresAt: "2027-07-01T00:00:00.000Z",
    graceDays: 14,
    issuer: "ITESICWS",
    licSha256: "a".repeat(64),
    publicKeyId: "deadbeefdeadbeef",
  };
}

describe("ledger de emisiones (append-only, cadena de hashes)", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "lyra-ledger-"));
    file = join(dir, "ledger.jsonl");
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("encadena las emisiones (seq contigua, prevHash) y la cadena verifica íntegra", () => {
    appendLedgerEntry(file, makeEntryInput(1));
    appendLedgerEntry(file, makeEntryInput(2, "SOCIO_B"));
    appendLedgerEntry(file, makeEntryInput(3));

    const entries = readLedger(file);
    expect(entries.map((e) => e.seq)).toEqual([1, 2, 3]);
    expect(entries[0]!.prevHash).toBe("GENESIS");
    expect(entries[1]!.prevHash).toBe(entries[0]!.hash);
    expect(entries[2]!.prevHash).toBe(entries[1]!.hash);
    expect(verifyLedgerChain(entries)).toBeNull();
  });

  it("ADULTERAR una entrada rompe la cadena (tamper-evident)", () => {
    appendLedgerEntry(file, makeEntryInput(1));
    appendLedgerEntry(file, makeEntryInput(2));
    const lines = readFileSync(file, "utf8").trimEnd().split("\n");
    // El "socio avaro" se auto-aumenta la banda editando una emisión pasada.
    lines[0] = lines[0]!.replace('"maxNodes":100', '"maxNodes":100000');
    writeFileSync(file, `${lines.join("\n")}\n`, "utf8");

    const defect = verifyLedgerChain(readLedger(file));
    expect(defect).toMatch(/adulterado/);
  });

  it("BORRAR una línea intermedia rompe la secuencia", () => {
    appendLedgerEntry(file, makeEntryInput(1));
    appendLedgerEntry(file, makeEntryInput(2));
    appendLedgerEntry(file, makeEntryInput(3));
    const lines = readFileSync(file, "utf8").trimEnd().split("\n");
    writeFileSync(file, `${[lines[0], lines[2]].join("\n")}\n`, "utf8");

    expect(verifyLedgerChain(readLedger(file))).toMatch(/fuera de secuencia|prevHash/);
  });

  it("resume emisiones por socio (control de banda §3)", () => {
    appendLedgerEntry(file, makeEntryInput(1, "SOCIO_A"));
    appendLedgerEntry(file, makeEntryInput(2, "SOCIO_A"));
    appendLedgerEntry(file, makeEntryInput(3, "SOCIO_B"));
    const summary = summarizeByPartner(readLedger(file));
    expect(summary.get("SOCIO_A")).toBe(2);
    expect(summary.get("SOCIO_B")).toBe(1);
  });

  it("un ledger inexistente lee vacío (primera emisión = seq 1)", () => {
    expect(readLedger(file)).toEqual([]);
  });
});
