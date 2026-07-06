#!/usr/bin/env node
/**
 * Horneado anti-tamper de la API (Licenciamiento L5, capa 3 — LICENSING.md §7,
 * LICENSING_PROCEDURE.md §6): empaqueta el dist YA COMPILADO por tsc en UN
 * solo `main.js` minificado con nombres destruidos, inlineando el módulo
 * crítico `@lyra/licensing`. Lo corre el build de la imagen Docker
 * (docker/Dockerfile.api, stage build) — una vez por versión, para todos los
 * clientes; dev (`nest start`) y ci.yml no pasan por aquí.
 *
 * Decisiones de empaquetado (DECISIONS 2026-07-06, L5 b):
 *  - Se bundlea el DIST (JS ya transpilado): los decoradores y su metadata
 *    (`emitDecoratorMetadata`) ya fueron materializados por tsc — esbuild no
 *    necesita soportarlos (era el campo minado de Nest + esbuild).
 *  - TODO node_modules queda EXTERNAL (Prisma client generado, binarios
 *    nativos argon2, pdfmake y sus fuentes TTF por require.resolve, minio,
 *    @lyra/contracts y @lyra/llm — sus deps transitivas deben resolver del
 *    árbol de pnpm). Solo se inlinea nuestro código: la API + @lyra/licensing
 *    (cero dependencias ⇒ inlining seguro), vía alias a su dist.
 *  - Sin keep-names a propósito: los identificadores (LicenseService,
 *    verifyLicense, …) se destruyen. Costo honesto: el `context` de los logs
 *    de producción sale minificado.
 *  - `mangleProps` con LISTA CURADA: esbuild no renombra claves de propiedad
 *    (métodos de clase y exports CJS del dist de tsc sobreviven al minify), y
 *    justo ahí viven los nombres license-críticos greppeables. Se manglan SOLO
 *    los identificadores de CÓDIGO listados abajo — JAMÁS claves de DATOS
 *    (p. ej. `fingerprint`/`machineId` viajan serializados en solicitud.lreq y
 *    manglarlos cambiaría la huella; los estados/reasons son contrato del API).
 */
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { build } from "esbuild";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ENTRY = join(REPO_ROOT, "apps/watchlog-api/dist/main.js");
const OUT = join(REPO_ROOT, "apps/watchlog-api/dist-bundle/main.js");
const LICENSING_DIST = join(REPO_ROOT, "packages/licensing/dist/index.js");

if (!existsSync(ENTRY)) {
  console.error(`❌ No existe ${ENTRY} — corre primero el build de la API (nest build).`);
  process.exit(1);
}
if (!existsSync(LICENSING_DIST)) {
  console.error(`❌ No existe ${LICENSING_DIST} — corre primero el build de packages.`);
  process.exit(1);
}

/**
 * Identificadores license-críticos a DESTRUIR en el bundle (claves de
 * propiedad: métodos, exports CJS, constantes). Regla de inclusión: nombres de
 * CÓDIGO distintivos del árbol de licenciamiento; regla de exclusión: nada que
 * viaje serializado (payloads/DTO/solicitudes) ni nombres genéricos que puedan
 * colisionar con claves de datos (refresh, collect, record…).
 */
const MANGLE_LICENSE_PROPS = [
  // NOTA: los exports de @lyra/licensing (signLicense/verifyLicense/
  // deriveFingerprint/evaluateLicense/evaluateLineage/…) NO se manglan aquí a
  // propósito: ese paquete es ESM y queda inlineado tras una FRONTERA de
  // interop ESM→CJS; esbuild mangla el call-site pero conserva la clave en el
  // mapa `__export`, y desincronizar ambos ROMPE el runtime (verificado:
  // "(0,qr.Y) is not a function"). Igual quedan minificados en su lógica; su
  // nombre solo sobrevive UNA vez en el mapa de exports (sin lógica legible).
  // Todo lo de abajo vive en módulos CJS propios (la API), donde el mangle es
  // consistente call-site ↔ definición.
  // apps/watchlog-api/src/licensing (runtime L1–L5)
  "LicenseService",
  "LicenseController",
  "LicenseModule",
  "LicenseEnforcementGuard",
  "ModuleEntitlementGuard",
  "MachineSignalsCollector",
  "collectMachineSignals",
  "LICENSE_PUBLIC_KEY_PEM",
  "LICENSE_WHITELIST_PREFIXES",
  "LICENSE_WHITELIST_EXACT",
  "READ_METHODS",
  "RESTRICTED_STATUSES",
  "PENDING_ACTIVATION",
  "toLicenseStatus",
  "getEvaluation",
  "moduleOperational",
  "workersOperational",
  "evaluateNow",
  "ensureInstallation",
  "rotateLineage",
  "localLineage",
  "findLicenseNotices",
  "noticePayload",
  "writeActivationRequest",
  "writeRenewalRequest",
  "readLicenseFile",
  "licenseFilePath",
  "logLicenseStatus",
  "sealRequired",
  "isWhiteLabelEnabled",
  "collectActuals",
  // límites numéricos (L2b)
  "LicenseLimitsService",
  "assertHeadroom",
  "currentUsage",
  "verifiedLimits",
  "limitsDto",
  // integridad (L5)
  "verifyArtifactIntegrity",
  "computeSealHash",
  "normalizeSealedContent",
  "embeddedSealHash",
  "SEALED_ARTIFACT",
  "INTEGRITY_SEAL",
  "SEAL_HASH_LENGTH",
];

const result = await build({
  entryPoints: [ENTRY],
  outfile: OUT,
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  minify: true,
  // Destruye SOLO los nombres license-críticos listados (métodos/exports que
  // el minify de identificadores no toca porque son claves de propiedad). Sin
  // esto, grep "verifyLicense"/"workersOperational" localiza el chequeo aunque
  // el resto esté minificado. NO se manglan claves de datos (ver lista arriba).
  mangleProps: new RegExp(`^(${MANGLE_LICENSE_PROPS.join("|")})$`),
  sourcemap: false,
  legalComments: "none",
  // Todo import "de paquete" queda external… (deps reales del runtime)
  packages: "external",
  // …salvo el módulo crítico: el alias lo resuelve a una ruta de archivo, y
  // las rutas de archivo SIEMPRE se bundlean (external solo aplica a bare
  // specifiers). Así @lyra/licensing queda INLINEADO y su copia legible se
  // elimina de node_modules en el Dockerfile.
  alias: { "@lyra/licensing": LICENSING_DIST },
  logLevel: "info",
});

if (result.errors.length > 0) process.exit(1);

// Salvaguardas: el bundle debe haber inlineado el módulo crítico (ninguna
// require de @lyra/licensing puede sobrevivir) y conservado los require de
// los assets externos (fuentes TTF del acta PDF).
const { readFileSync } = await import("node:fs");
const bundled = readFileSync(OUT, "utf8");
if (bundled.includes("@lyra/licensing")) {
  console.error("❌ El bundle sigue refiriendo @lyra/licensing (no quedó inlineado). Abortado.");
  process.exit(1);
}
for (const mustKeep of ["@lyra/contracts", "@expo-google-fonts/inter", "pdfmake"]) {
  if (!bundled.includes(mustKeep)) {
    console.error(`❌ El bundle perdió la referencia externa a ${mustKeep}. Abortado.`);
    process.exit(1);
  }
}
console.log(`✅ API empaquetada y minificada en ${OUT}`);
console.log("   (@lyra/licensing inlineado; node_modules externals intactos)");
