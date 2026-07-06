#!/usr/bin/env node
/**
 * `lyra-license` — CLI de emisión de licencias de ITESICWS (Licenciamiento L3).
 *
 * Herramienta del EMISOR (jamás se distribuye al cliente). Comandos:
 *
 *   keygen   genera el par Ed25519 de emisión (privada CIFRADA en la custodia)
 *   issue    emite `license.lic` desde un `solicitud.lreq` + parámetros comerciales
 *   renew    renueva desde un `renovacion.lreq` (L4: valida LINAJE contra el
 *            ledger — linaje repetido = CLON DETECTADO, deniega por defecto —
 *            y hereda los términos comerciales de la última emisión)
 *   inspect  verifica/muestra un `license.lic` (QA del emisor)
 *   ledger   lista el registro append-only de emisiones (banda del socio)
 *
 * La passphrase de la privada NUNCA viaja por flag (quedaría en el historial de
 * shell): entra por prompt interactivo sin eco, por env LYRA_LICENSE_PASSPHRASE
 * (efímera) o por archivo LYRA_LICENSE_PASSPHRASE_FILE.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { LicenseState, type LicenseEdition } from "@lyra/licensing";

import { inspectLicense } from "./inspect.js";
import { issueLicense } from "./issue.js";
import { generatePassphrase, keygen, loadPrivateKeyPem } from "./keystore.js";
import { renewLicense } from "./renew.js";
import { appendLedgerEntry, readLedger, summarizeByPartner, verifyLedgerChain } from "./ledger.js";
import {
  ledgerPath,
  licenseHome,
  PASSPHRASE_ENV,
  PASSPHRASE_FILE_ENV,
  privateKeyPath,
  publicKeyPath,
} from "./paths.js";
import { readActivationRequest, readRenewalRequest } from "./request.js";

const USAGE = `lyra-license — emisión de licencias Lyra WatchLog (ITESICWS)

Uso:
  lyra-license keygen  [--home <dir>] [--force]
  lyra-license issue   --request <solicitud.lreq> --customer <nombre>
                       --channel-partner <socio> --edition <starter|professional|enterprise>
                       --modules <a,b,c> --max-nodes <n> --max-named-users <n>
                       --expires <ISO 8601> [--grace-days 14] [--max-installations 1]
                       [--not-before <ISO>] [--license-id <id>] [--issuer ITESICWS]
                       [--support-tier L2] [--no-white-label] [--allow-past]
                       [--out <license.lic>] [--private-key <pem>] [--no-ledger] [--home <dir>]
  lyra-license renew   --request <renovacion.lreq> --expires <ISO 8601>
                       [--modules <a,b,c>] [--edition <…>] [--max-nodes <n>]
                       [--max-named-users <n>] [--max-installations <n>]
                       [--grace-days <n>] [--not-before <ISO>] [--license-id <id>]
                       [--customer <nombre>] [--channel-partner <socio>]
                       [--support-tier <t>] [--no-white-label] [--allow-past]
                       [--force-duplicate] [--accept-new-fingerprint]
                       [--out <license.lic>] [--private-key <pem>] [--home <dir>]
                       (sin flags comerciales HEREDA la última emisión del ledger;
                        linaje repetido = CLON DETECTADO ⇒ deniega salvo override)
  lyra-license inspect <license.lic> [--public-key <pem> | --dev] [--request <solicitud.lreq>] [--home <dir>]
  lyra-license ledger  [--partner <socio>] [--home <dir>]

Custodia (fuera del repo): LYRA_LICENSE_HOME (def. ~/.lyra-license) contiene
prod-private.enc.pem (PKCS#8 cifrado), prod-public.pem y ledger.jsonl.
Passphrase: prompt sin eco, ${PASSPHRASE_ENV} o ${PASSPHRASE_FILE_ENV}.`;

/** Pública DEV committeada (scripts/license/dev-keys), para `inspect --dev`. */
function devPublicKeyPath(): string {
  return resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../../..",
    "scripts/license/dev-keys/dev-public.pem",
  );
}

/** Passphrase por env/archivo; si no hay y la TTY lo permite, prompt sin eco. */
async function obtainPassphrase(promptLabel: string): Promise<string> {
  const fromEnv = process.env[PASSPHRASE_ENV];
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  const fromFile = process.env[PASSPHRASE_FILE_ENV];
  if (fromFile !== undefined && fromFile.length > 0) {
    return readFileSync(fromFile, "utf8").trim();
  }
  if (!input.isTTY) {
    throw new Error(
      `sin TTY no puedo pedir la passphrase: usa ${PASSPHRASE_ENV} o ${PASSPHRASE_FILE_ENV}`,
    );
  }
  return await promptHidden(promptLabel);
}

/** Prompt interactivo SIN eco (la passphrase no se refleja en pantalla). */
function promptHidden(label: string): Promise<string> {
  return new Promise((resolvePrompt) => {
    const rl = readline.createInterface({ input, terminal: true });
    output.write(label);
    readline.emitKeypressEvents(input, rl);
    // El eco se suprime interceptando la salida: no se re-imprime lo tecleado.
    const originalWrite = (rl as unknown as { _writeToOutput?: (s: string) => void })
      ._writeToOutput;
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = () => {};
    rl.question("", (answer) => {
      if (originalWrite !== undefined) {
        (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = originalWrite;
      }
      rl.close();
      output.write("\n");
      resolvePrompt(answer.trim());
    });
  });
}

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

// --- comandos -----------------------------------------------------------------

async function cmdKeygen(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { home: { type: "string" }, force: { type: "boolean", default: false } },
  });
  const home = values.home ?? licenseHome();
  const fromEnv = process.env[PASSPHRASE_ENV];
  const passphrase =
    fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : generatePassphrase();

  const result = keygen({
    privateKeyPath: privateKeyPath(home),
    publicKeyPath: publicKeyPath(home),
    passphrase,
    force: values.force,
  });

  console.log("✅ Par Ed25519 de emisión generado.");
  console.log(`   privada (PKCS#8 CIFRADO): ${result.privateKeyPath}`);
  console.log(`   pública:                  ${result.publicKeyPath}`);
  if (fromEnv === undefined || fromEnv.length === 0) {
    console.log("");
    console.log("⚠️  PASSPHRASE (se muestra UNA sola vez — guárdala en tu gestor de");
    console.log("   contraseñas AHORA; sin ella la privada es irrecuperable):");
    console.log("");
    console.log(`      ${passphrase}`);
    console.log("");
  }
  console.log("Pública lista para embeber (scripts/license/embed-public-key.mjs):");
  console.log(result.publicKeyPem.trimEnd());
}

async function cmdIssue(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      request: { type: "string" },
      customer: { type: "string" },
      "channel-partner": { type: "string" },
      edition: { type: "string" },
      modules: { type: "string" },
      "max-nodes": { type: "string" },
      "max-named-users": { type: "string" },
      "max-installations": { type: "string", default: "1" },
      expires: { type: "string" },
      "grace-days": { type: "string", default: "14" },
      "not-before": { type: "string" },
      "license-id": { type: "string" },
      issuer: { type: "string" },
      "support-tier": { type: "string" },
      "no-white-label": { type: "boolean", default: false },
      "allow-past": { type: "boolean", default: false },
      out: { type: "string", default: "license.lic" },
      "private-key": { type: "string" },
      "no-ledger": { type: "boolean", default: false },
      home: { type: "string" },
    },
  });

  const home = values.home ?? licenseHome();
  const requestPath = values.request ?? fail("falta --request <solicitud.lreq>");
  const request = readActivationRequest(requestPath);

  const keyPath = values["private-key"] ?? privateKeyPath(home);
  if (!existsSync(keyPath)) {
    fail(`no existe la clave privada ${keyPath} (¿corriste \`lyra-license keygen\`?)`);
  }
  const needsPassphrase = readFileSync(keyPath, "utf8").includes("ENCRYPTED");
  const passphrase = needsPassphrase
    ? await obtainPassphrase(`Passphrase de ${keyPath}: `)
    : undefined;
  const privateKeyPem = loadPrivateKeyPem(keyPath, passphrase);

  const toInt = (raw: string | undefined, field: string): number => {
    if (raw === undefined) fail(`falta --${field}`);
    const n = Number(raw);
    if (!Number.isInteger(n)) fail(`--${field} debe ser un entero (recibido: ${raw})`);
    return n;
  };

  const ledgerFile = ledgerPath(home);
  const priorEntries = values["no-ledger"] ? [] : readLedger(ledgerFile);

  const issued = issueLicense({
    request,
    privateKeyPem,
    sequence: priorEntries.length + 1,
    params: {
      customer: values.customer ?? fail("falta --customer"),
      channelPartner: values["channel-partner"] ?? fail("falta --channel-partner"),
      edition: (values.edition ?? fail("falta --edition")) as LicenseEdition,
      modules: (values.modules ?? fail("falta --modules (a,b,c)")).split(","),
      limits: {
        maxInstallations: toInt(values["max-installations"], "max-installations"),
        maxNodes: toInt(values["max-nodes"], "max-nodes"),
        maxNamedUsers: toInt(values["max-named-users"], "max-named-users"),
      },
      expiresAt: values.expires ?? fail("falta --expires (ISO 8601)"),
      graceDays: toInt(values["grace-days"], "grace-days"),
      notBefore: values["not-before"],
      licenseId: values["license-id"],
      issuer: values.issuer,
      supportTier: values["support-tier"],
      whiteLabel: !values["no-white-label"],
      allowPast: values["allow-past"],
    },
  });

  const outPath = resolve(values.out ?? "license.lic");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${issued.lic}\n`, "utf8");

  if (!values["no-ledger"]) {
    appendLedgerEntry(ledgerFile, {
      type: "issue",
      issuedAt: issued.payload.issuedAt,
      licenseId: issued.payload.licenseId,
      installationId: issued.payload.installationId,
      fingerprint: issued.payload.fingerprint,
      customer: issued.payload.customer,
      channelPartner: issued.payload.channelPartner,
      edition: issued.payload.edition,
      modules: issued.payload.modules,
      limits: issued.payload.limits,
      notBefore: issued.payload.notBefore,
      expiresAt: issued.payload.expiresAt,
      graceDays: issued.payload.graceDays,
      issuer: issued.payload.issuer,
      whiteLabel: issued.payload.whiteLabel,
      supportTier: issued.payload.supportTier,
      renewalCounter: issued.payload.renewalCounter,
      licSha256: issued.licSha256,
      publicKeyId: issued.publicKeyId,
    });
  }

  console.log(`✅ Licencia emitida: ${outPath}`);
  console.log(`   licenseId:      ${issued.payload.licenseId}`);
  console.log(`   cliente/socio:  ${issued.payload.customer} / ${issued.payload.channelPartner}`);
  console.log(`   installationId: ${issued.payload.installationId}`);
  console.log(`   huella:         ${issued.payload.fingerprint}`);
  console.log(`   edición:        ${issued.payload.edition} · módulos: ${issued.payload.modules.join(", ")}`);
  console.log(`   vence:          ${issued.payload.expiresAt} (+${issued.payload.graceDays}d gracia)`);
  console.log(`   par firmante:   ${issued.publicKeyId}`);
  console.log(
    values["no-ledger"]
      ? "   ledger:         OMITIDO (--no-ledger)"
      : `   ledger:         ${ledgerFile} (${priorEntries.length + 1} emisiones)`,
  );
}

async function cmdRenew(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      request: { type: "string" },
      expires: { type: "string" },
      customer: { type: "string" },
      "channel-partner": { type: "string" },
      edition: { type: "string" },
      modules: { type: "string" },
      "max-nodes": { type: "string" },
      "max-named-users": { type: "string" },
      "max-installations": { type: "string" },
      "grace-days": { type: "string" },
      "not-before": { type: "string" },
      "license-id": { type: "string" },
      issuer: { type: "string" },
      "support-tier": { type: "string" },
      "no-white-label": { type: "boolean", default: false },
      "allow-past": { type: "boolean", default: false },
      "force-duplicate": { type: "boolean", default: false },
      "accept-new-fingerprint": { type: "boolean", default: false },
      out: { type: "string", default: "license.lic" },
      "private-key": { type: "string" },
      home: { type: "string" },
    },
  });

  const home = values.home ?? licenseHome();
  const requestPath = values.request ?? fail("falta --request <renovacion.lreq>");
  const request = readRenewalRequest(requestPath);

  // La renovación EXIGE el ledger (sin --no-ledger a propósito): sin historial
  // no hay linaje que validar ni términos que heredar — el control ES el ledger.
  const ledgerFile = ledgerPath(home);
  const entries = readLedger(ledgerFile);
  const chainDefect = verifyLedgerChain(entries);
  if (chainDefect !== null) {
    fail(`ledger adulterado o corrupto (${chainDefect}) — no se renueva contra un ledger roto`);
  }

  const keyPath = values["private-key"] ?? privateKeyPath(home);
  if (!existsSync(keyPath)) {
    fail(`no existe la clave privada ${keyPath} (¿corriste \`lyra-license keygen\`?)`);
  }
  const needsPassphrase = readFileSync(keyPath, "utf8").includes("ENCRYPTED");
  const passphrase = needsPassphrase
    ? await obtainPassphrase(`Passphrase de ${keyPath}: `)
    : undefined;
  const privateKeyPem = loadPrivateKeyPem(keyPath, passphrase);

  const toOptionalInt = (raw: string | undefined, field: string): number | undefined => {
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n)) fail(`--${field} debe ser un entero (recibido: ${raw})`);
    return n;
  };

  const renewed = renewLicense({
    request,
    privateKeyPem,
    ledgerEntries: entries,
    params: {
      expiresAt: values.expires ?? fail("falta --expires (ISO 8601)"),
      customer: values.customer,
      channelPartner: values["channel-partner"],
      edition: values.edition as LicenseEdition | undefined,
      modules: values.modules?.split(","),
      maxInstallations: toOptionalInt(values["max-installations"], "max-installations"),
      maxNodes: toOptionalInt(values["max-nodes"], "max-nodes"),
      maxNamedUsers: toOptionalInt(values["max-named-users"], "max-named-users"),
      graceDays: toOptionalInt(values["grace-days"], "grace-days"),
      notBefore: values["not-before"],
      licenseId: values["license-id"],
      issuer: values.issuer,
      supportTier: values["support-tier"],
      whiteLabel: values["no-white-label"] ? false : undefined,
      allowPast: values["allow-past"],
      forceDuplicate: values["force-duplicate"],
      acceptNewFingerprint: values["accept-new-fingerprint"],
    },
  });

  const outPath = resolve(values.out ?? "license.lic");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${renewed.lic}\n`, "utf8");

  appendLedgerEntry(ledgerFile, {
    type: "renewal",
    issuedAt: renewed.payload.issuedAt,
    licenseId: renewed.payload.licenseId,
    installationId: renewed.payload.installationId,
    fingerprint: renewed.payload.fingerprint,
    customer: renewed.payload.customer,
    channelPartner: renewed.payload.channelPartner,
    edition: renewed.payload.edition,
    modules: renewed.payload.modules,
    limits: renewed.payload.limits,
    notBefore: renewed.payload.notBefore,
    expiresAt: renewed.payload.expiresAt,
    graceDays: renewed.payload.graceDays,
    issuer: renewed.payload.issuer,
    whiteLabel: renewed.payload.whiteLabel,
    supportTier: renewed.payload.supportTier,
    renewalCounter: renewed.payload.renewalCounter,
    presentedCounter: renewed.presented.renewalCounter,
    presentedNonce: renewed.presented.nonce,
    ...(renewed.forcedDuplicate ? { forcedDuplicate: true } : {}),
    ...(renewed.acceptedNewFingerprint ? { acceptedNewFingerprint: true } : {}),
    licSha256: renewed.licSha256,
    publicKeyId: renewed.publicKeyId,
  });

  console.log(`✅ Renovación emitida: ${outPath}`);
  console.log(`   licenseId:      ${renewed.payload.licenseId} (hereda de ledger #${renewed.base.seq})`);
  console.log(`   cliente/socio:  ${renewed.payload.customer} / ${renewed.payload.channelPartner}`);
  console.log(`   installationId: ${renewed.payload.installationId}`);
  console.log(`   huella:         ${renewed.payload.fingerprint}`);
  console.log(`   edición:        ${renewed.payload.edition} · módulos: ${renewed.payload.modules.join(", ")}`);
  console.log(`   vence:          ${renewed.payload.expiresAt} (+${renewed.payload.graceDays}d gracia)`);
  console.log(
    `   linaje:         counter ${renewed.presented.renewalCounter} → ${renewed.payload.renewalCounter} ` +
      "(atada al nonce presentado: importable UNA sola vez, solo en esa instalación)",
  );
  if (renewed.forcedDuplicate) {
    console.log("   ⚠️  EMITIDA CON --force-duplicate (linaje repetido/desfasado) — auditado en el ledger.");
  }
  if (renewed.acceptedNewFingerprint) {
    console.log("   ⚠️  Huella NUEVA aceptada (--accept-new-fingerprint) — auditado en el ledger.");
  }
  console.log(`   ledger:         ${ledgerFile} (${entries.length + 1} emisiones)`);
}

async function cmdInspect(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "public-key": { type: "string" },
      dev: { type: "boolean", default: false },
      request: { type: "string" },
      home: { type: "string" },
    },
  });
  const licPath = positionals[0] ?? fail("falta el archivo license.lic a inspeccionar");
  const home = values.home ?? licenseHome();
  const publicPath = values.dev ? devPublicKeyPath() : (values["public-key"] ?? publicKeyPath(home));
  if (!existsSync(publicPath)) {
    fail(`no existe la clave pública ${publicPath} (usa --public-key, --dev o corre keygen)`);
  }
  const fingerprint = values.request
    ? readActivationRequest(values.request).fingerprint
    : undefined;

  const result = inspectLicense({
    licPath,
    publicKeyPem: readFileSync(publicPath, "utf8"),
    fingerprint,
  });

  if (!result.verified.ok) {
    console.error(`❌ FIRMA INVÁLIDA (${result.verified.reason}): ${result.verified.detail ?? ""}`);
    console.error(`   pública usada: ${publicPath}`);
    process.exit(1);
  }
  const p = result.payload!;
  const ev = result.evaluation!;
  console.log(`✅ Firma Ed25519 VÁLIDA (pública: ${publicPath})`);
  console.log(`   licenseId:      ${p.licenseId} · emitida: ${p.issuedAt} por ${p.issuer}`);
  console.log(`   cliente/socio:  ${p.customer} / ${p.channelPartner}`);
  console.log(`   installationId: ${p.installationId}`);
  console.log(`   huella:         ${p.fingerprint}${fingerprint !== undefined ? ` (contrastada con la solicitud)` : " (autoconsistente)"}`);
  console.log(`   edición:        ${p.edition} · módulos: ${p.modules.join(", ")}`);
  console.log(`   límites:        inst=${p.limits.maxInstallations} nodos=${p.limits.maxNodes} usuarios=${p.limits.maxNamedUsers}`);
  console.log(`   vigencia:       ${p.notBefore} → ${p.expiresAt} (+${p.graceDays}d gracia)`);
  console.log(`   linaje:         counter=${p.renewalCounter} nonce=${p.nonce.slice(0, 8)}…`);
  console.log(`   ESTADO:         ${ev.state}${ev.reason !== undefined ? ` (${ev.reason})` : ""}${ev.daysToExpiry !== undefined ? ` · ${ev.daysToExpiry} días al vencimiento` : ""}`);
  if (ev.state === LicenseState.BLOQUEADA) process.exit(2);
}

async function cmdLedger(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { partner: { type: "string" }, home: { type: "string" } },
  });
  const home = values.home ?? licenseHome();
  const file = ledgerPath(home);
  const entries = readLedger(file);
  if (entries.length === 0) {
    console.log(`(ledger vacío: ${file})`);
    return;
  }
  // La cadena se verifica SIEMPRE al listar: un ledger adulterado no pasa piola.
  const defect = verifyLedgerChain(entries);
  const filtered = values.partner
    ? entries.filter((e) => e.channelPartner === values.partner)
    : entries;

  console.log(`Ledger de emisiones — ${file}`);
  for (const e of filtered) {
    console.log(
      `  #${String(e.seq).padStart(3, "0")} ${e.issuedAt}  ${e.licenseId}  ${e.customer} (socio: ${e.channelPartner})  ${e.edition}  vence ${e.expiresAt.slice(0, 10)}  inst=${e.installationId}  huella=${e.fingerprint}  par=${e.publicKeyId}`,
    );
  }
  console.log("");
  console.log("Emisiones por socio (control de banda, LICENSING_PROCEDURE §3):");
  for (const [partner, count] of summarizeByPartner(entries)) {
    console.log(`  ${partner}: ${count}`);
  }
  if (defect !== null) {
    console.error(`❌ CADENA ROTA: ${defect} — el ledger fue adulterado o está corrupto.`);
    process.exit(1);
  }
  console.log(`✅ Cadena de hashes íntegra (${entries.length} emisiones).`);
}

// --- despacho -------------------------------------------------------------------

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2);
  switch (command) {
    case "keygen":
      return cmdKeygen(rest);
    case "issue":
      return cmdIssue(rest);
    case "renew":
      return cmdRenew(rest);
    case "inspect":
      return cmdInspect(rest);
    case "ledger":
    case "list":
      return cmdLedger(rest);
    case undefined:
    case "help":
    case "--help":
    case "-h":
      console.log(USAGE);
      return;
    default:
      fail(`comando desconocido "${command}"\n\n${USAGE}`);
  }
}

void main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
