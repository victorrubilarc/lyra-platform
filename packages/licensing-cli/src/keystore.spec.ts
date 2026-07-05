import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { verifyLicense } from "@lyra/licensing";

import { generatePassphrase, keygen, loadPrivateKeyPem } from "./keystore.js";
import { makeRequestFixture, makeIssueParamsFixture } from "./test-fixtures.js";
import { issueLicense } from "./issue.js";

const PASSPHRASE = "test-passphrase-larga-123";

describe("generatePassphrase", () => {
  it("produce passphrases largas, agrupadas y distintas entre sí", () => {
    const a = generatePassphrase();
    const b = generatePassphrase();
    expect(a).toMatch(/^[2-9a-zA-Z]{5}(-[2-9a-zA-Z]{5}){4}$/);
    expect(a).not.toBe(b);
  });
});

describe("keygen (custodia de la privada)", () => {
  let dir: string;
  const paths = (): { priv: string; pub: string } => ({
    priv: join(dir, "prod-private.enc.pem"),
    pub: join(dir, "prod-public.pem"),
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("escribe la privada CIFRADA (PKCS#8 ENCRYPTED, jamás en claro) y la pública SPKI", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-keys-"));
    const { priv, pub } = paths();
    keygen({ privateKeyPath: priv, publicKeyPath: pub, passphrase: PASSPHRASE });

    const privatePem = readFileSync(priv, "utf8");
    expect(privatePem).toContain("BEGIN ENCRYPTED PRIVATE KEY");
    expect(privatePem).not.toContain("BEGIN PRIVATE KEY"); // nunca en claro
    expect(readFileSync(pub, "utf8")).toContain("BEGIN PUBLIC KEY");
  });

  it("la privada cifrada NO es utilizable sin passphrase ni con una incorrecta", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-keys-"));
    const { priv, pub } = paths();
    keygen({ privateKeyPath: priv, publicKeyPath: pub, passphrase: PASSPHRASE });

    expect(() => loadPrivateKeyPem(priv)).toThrow(/passphrase/);
    expect(() => loadPrivateKeyPem(priv, "passphrase-equivocada")).toThrow(/incorrecta|corrupto/);
  });

  it("con la passphrase correcta el par firma y verifica de punta a punta", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-keys-"));
    const { priv, pub } = paths();
    keygen({ privateKeyPath: priv, publicKeyPath: pub, passphrase: PASSPHRASE });

    const privatePem = loadPrivateKeyPem(priv, PASSPHRASE);
    const issued = issueLicense({
      request: makeRequestFixture(),
      privateKeyPem: privatePem,
      params: makeIssueParamsFixture(),
    });
    const verified = verifyLicense(issued.lic, readFileSync(pub, "utf8"));
    expect(verified.ok).toBe(true);
  });

  it("se niega a sobreescribir un par existente sin --force", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-keys-"));
    const { priv, pub } = paths();
    keygen({ privateKeyPath: priv, publicKeyPath: pub, passphrase: PASSPHRASE });
    expect(() =>
      keygen({ privateKeyPath: priv, publicKeyPath: pub, passphrase: PASSPHRASE }),
    ).toThrow(/ya existe/);
    expect(() =>
      keygen({ privateKeyPath: priv, publicKeyPath: pub, passphrase: PASSPHRASE, force: true }),
    ).not.toThrow();
  });

  it("rechaza passphrases cortas", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-keys-"));
    const { priv, pub } = paths();
    expect(() =>
      keygen({ privateKeyPath: priv, publicKeyPath: pub, passphrase: "corta" }),
    ).toThrow(/12 caracteres/);
  });

  it("acepta un PEM en claro (par DEV committeado) sin passphrase", () => {
    dir = mkdtempSync(join(tmpdir(), "lyra-keys-"));
    // Un PEM sin cifrar (como scripts/license/dev-keys/dev-private.pem).
    const { privateKey } = generateKeyPairSync("ed25519", {
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const plainPath = join(dir, "dev-private.pem");
    writeFileSync(plainPath, privateKey, "utf8");
    expect(loadPrivateKeyPem(plainPath)).toContain("BEGIN PRIVATE KEY");
  });
});
