#!/usr/bin/env node
/**
 * Codegen del build de RELEASE (Licenciamiento L3, decisión (c)): reescribe
 * `apps/watchlog-api/src/licensing/license-public-key.ts` con la clave PÚBLICA
 * de PRODUCCIÓN committeada en `scripts/license/prod-keys/prod-public.pem`.
 *
 * Lo corre SOLO el pipeline de release (`.github/workflows/release.yml`) en el
 * checkout del runner, ANTES del `docker build` — la pública queda EMBEBIDA
 * como constante compilada (jamás por env en runtime). El archivo modificado
 * nunca se commitea: `pnpm build` local y el CI siguen usando la pública DEV.
 *
 * Salvaguardas: valida que el PEM sea una pública Ed25519 real y se NIEGA a
 * embeber la pública DEV (una release con la DEV no es vendible).
 *
 * Uso: node scripts/license/embed-public-key.mjs [--key <ruta.pem>]
 */
import { createPublicKey } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TARGET = join(REPO_ROOT, "apps/watchlog-api/src/licensing/license-public-key.ts");
const DEV_PUBLIC = join(REPO_ROOT, "scripts/license/dev-keys/dev-public.pem");
const DEFAULT_KEY = join(REPO_ROOT, "scripts/license/prod-keys/prod-public.pem");

const keyArgIndex = process.argv.indexOf("--key");
const keyPath = keyArgIndex !== -1 ? resolve(process.argv[keyArgIndex + 1]) : DEFAULT_KEY;

const pem = readFileSync(keyPath, "utf8").trim();

// Debe ser una clave PÚBLICA Ed25519 válida (nunca una privada por accidente).
if (pem.includes("PRIVATE")) {
  console.error(`❌ ${keyPath} contiene una clave PRIVADA — jamás se embebe. Abortado.`);
  process.exit(1);
}
let key;
try {
  key = createPublicKey(pem);
} catch (err) {
  console.error(`❌ ${keyPath} no es un PEM de clave pública válido: ${err}`);
  process.exit(1);
}
if (key.asymmetricKeyType !== "ed25519") {
  console.error(`❌ ${keyPath} no es Ed25519 (${key.asymmetricKeyType}). Abortado.`);
  process.exit(1);
}

const devPem = readFileSync(DEV_PUBLIC, "utf8").trim();
if (pem === devPem) {
  console.error("❌ La clave es la pública DEV: una release con la DEV no es vendible. Abortado.");
  process.exit(1);
}

const generated = `/**
 * Clave PÚBLICA de verificación de licencias, EMBEBIDA como constante compilada.
 *
 * ⚠️ ARCHIVO GENERADO por scripts/license/embed-public-key.mjs (build de
 * RELEASE): esta es la pública de PRODUCCIÓN (scripts/license/prod-keys/).
 * NO commitear esta versión — el árbol de trabajo vuelve a la pública DEV.
 *
 * Regla de gobernanza (CLAUDE.md §Licenciamiento + docs/LICENSING.md §4): la
 * pública JAMÁS llega por variable de entorno ni por configuración — una pública
 * configurable sería un bypass trivial. Solo puede cambiar recompilando la app.
 */
export const LICENSE_PUBLIC_KEY_PEM = \`${pem}
\`;
`;

writeFileSync(TARGET, generated, "utf8");
console.log(`✅ Pública de PRODUCCIÓN embebida en ${TARGET}`);
console.log(`   (fuente: ${keyPath})`);
console.log("   Esta build SÍ es apta para distribuirse comercialmente.");
