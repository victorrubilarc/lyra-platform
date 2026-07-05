/**
 * Genera una licencia de DESARROLLO (`license.lic`) para ESTA máquina, firmada
 * con el par DEV committeado en `scripts/license/dev-keys/` (NO es un secreto:
 * solo lo aceptan builds que embeben la pública DEV). Uso:
 *
 *   pnpm --filter @lyra/watchlog-api run license:dev            # 1 año, válida
 *   pnpm --filter @lyra/watchlog-api run license:dev -- --expired   # vencida (smoke)
 *   pnpm --filter @lyra/watchlog-api run license:dev -- --modules=core,incidents
 *
 * Desde L3 es un ENVOLTORIO DELGADO sobre `@lyra/licensing-cli` (`issueLicense`):
 * una sola implementación de emisión para DEV y PROD, sin copiar/pegar. Lo único
 * propio de este wrapper es recolectar las señales con el MISMO recolector de la
 * API (la huella emitida calza EXACTO con la de runtime) y armar la solicitud
 * sintética local. No pasa por el ledger del emisor (emisión de desarrollo).
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { deriveFingerprint } from "@lyra/licensing";
import { issueLicense, type ActivationRequest } from "@lyra/licensing-cli";
import { LICENSED_MODULE_KEYS } from "@lyra/contracts";
import { collectMachineSignals } from "../src/licensing/machine-signals.collector";

const DAY_MS = 86_400_000;
const REPO_ROOT = resolve(__dirname, "../../..");
const DEV_PRIVATE_KEY = readFileSync(
  join(REPO_ROOT, "scripts/license/dev-keys/dev-private.pem"),
  "utf8",
);

async function main(): Promise<void> {
  const expired = process.argv.includes("--expired");
  // --modules=core,incidents ⇒ entitlement ACOTADO (smoke del gating L2).
  const modulesArg = process.argv.find((a) => a.startsWith("--modules="));
  const machineIdFile = process.env.LICENSE_MACHINE_ID_FILE ?? "/etc/machine-id";
  const licenseFile = process.env.LICENSE_FILE ?? ".license/license.lic";

  const signals = await collectMachineSignals(machineIdFile, undefined, (msg) =>
    console.warn(`⚠️  ${msg}`),
  );
  const now = Date.now();
  // Solicitud sintética local: en una instalación real esto viene del
  // `solicitud.lreq` que la app escribe sola (ceremonia LICENSING_PROCEDURE §2).
  const request: ActivationRequest = {
    product: "lyra-watchlog",
    schemaVersion: 1,
    installationId: "inst_dev_local",
    fingerprint: deriveFingerprint(signals),
    generatedAt: new Date(now).toISOString(),
  };

  const issued = issueLicense({
    request,
    privateKeyPem: DEV_PRIVATE_KEY,
    params: {
      customer: "Desarrollo local",
      channelPartner: "DEV",
      edition: "enterprise",
      modules: modulesArg
        ? modulesArg
            .slice("--modules=".length)
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean)
        : [...LICENSED_MODULE_KEYS],
      limits: { maxInstallations: 1, maxNodes: 100_000, maxNamedUsers: 100_000 },
      // --expired: venció hace 60 días con 14 de gracia ⇒ SOLO_LECTURA (smoke).
      expiresAt: new Date(expired ? now - 60 * DAY_MS : now + 365 * DAY_MS).toISOString(),
      graceDays: 14,
      licenseId: `lic_dev_${new Date(now).toISOString().slice(0, 10)}`,
      issuer: "ITESICWS (DEV)",
      supportTier: "DEV",
      allowPast: expired,
    },
  });

  mkdirSync(dirname(resolve(licenseFile)), { recursive: true });
  writeFileSync(resolve(licenseFile), issued.lic + "\n", "utf8");

  console.log(`✅ Licencia DEV escrita en ${resolve(licenseFile)}`);
  console.log(`   estado esperado: ${expired ? "SOLO_LECTURA (vencida, --expired)" : "VALIDA"}`);
  console.log(`   huella: ${request.fingerprint}`);
  console.log(`   vence:  ${issued.payload.expiresAt}`);
}

void main().catch((err: unknown) => {
  console.error("❌ No se pudo generar la licencia DEV:", err);
  process.exit(1);
});
