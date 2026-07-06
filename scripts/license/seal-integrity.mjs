#!/usr/bin/env node
/**
 * Sellado de integridad del artefacto crítico (Licenciamiento L5, capa §7.4):
 * calcula el SHA-256 del bundle CON LA REGIÓN DEL HASH NORMALIZADA A CEROS y
 * lo escribe dentro del marcador `LYRA-INTEGRITY-SEAL::<64 hex>` que declara
 * `apps/watchlog-api/src/licensing/integrity.ts`. El sello se GENERA en el
 * build de la imagen (jamás se commitea): el árbol de trabajo queda siempre
 * con el marcador en ceros (= sin sellar, carril dev/CI).
 *
 * El algoritmo de normalización/hash NO se re-implementa: se reusa la MISMA
 * implementación compilada que usa el runtime (dist/licensing/integrity.js),
 * así sellador y verificador no pueden divergir.
 *
 * Uso: node scripts/license/seal-integrity.mjs <ruta-del-bundle.js>
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const INTEGRITY_DIST = join(REPO_ROOT, "apps/watchlog-api/dist/licensing/integrity.js");

const target = process.argv[2];
if (!target) {
  console.error("Uso: node scripts/license/seal-integrity.mjs <ruta-del-bundle.js>");
  process.exit(1);
}

let integrity;
try {
  integrity = createRequire(import.meta.url)(INTEGRITY_DIST);
} catch (err) {
  console.error(`❌ No se pudo cargar ${INTEGRITY_DIST} (¿falta el build de la API?): ${err}`);
  process.exit(1);
}
const { computeSealHash, SEAL_HASH_LENGTH } = integrity;

const targetPath = resolve(target);
const content = readFileSync(targetPath);
const text = content.toString("latin1"); // byte a byte (el marcador es ASCII)

const MARKER_RE = /LYRA-INTEGRITY-SEAL::([0-9a-f]{64})/g;
const matches = [...text.matchAll(MARKER_RE)];
if (matches.length === 0) {
  console.error("❌ El artefacto no contiene el marcador de sello. ¿Es el bundle correcto?");
  process.exit(1);
}
if (matches.length > 1) {
  console.error(
    `❌ El marcador aparece ${matches.length} veces (debe ser ÚNICO para que el sello sea inequívoco). Abortado.`,
  );
  process.exit(1);
}
if (matches[0][1] !== "0".repeat(SEAL_HASH_LENGTH)) {
  console.error("❌ El artefacto YA está sellado — el sellado no es re-aplicable. Abortado.");
  process.exit(1);
}

const hash = computeSealHash(content);
const sealed = Buffer.from(text.replace(MARKER_RE, `LYRA-INTEGRITY-SEAL::${hash}`), "latin1");
writeFileSync(targetPath, sealed);

// Round-trip: recomputar sobre lo sellado debe dar el MISMO hash (la
// normalización garantiza que sellar no altera el valor).
const check = computeSealHash(readFileSync(targetPath));
if (check !== hash) {
  console.error(`❌ Round-trip del sello falló (${check} ≠ ${hash}). Abortado.`);
  process.exit(1);
}
console.log(`✅ Artefacto sellado: ${targetPath}`);
console.log(`   SHA-256 (normalizado): ${hash}`);
