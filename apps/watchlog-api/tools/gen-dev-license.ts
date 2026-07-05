/**
 * Genera una licencia de DESARROLLO (`license.lic`) para ESTA máquina, firmada
 * con el par DEV committeado en `scripts/license/dev-keys/` (NO es un secreto:
 * solo lo aceptan builds que embeben la pública DEV). Uso:
 *
 *   pnpm --filter @lyra/watchlog-api run license:dev            # 1 año, válida
 *   pnpm --filter @lyra/watchlog-api run license:dev -- --expired   # vencida (smoke)
 *
 * Recolecta las señales con el MISMO recolector de la API (la huella emitida
 * calza EXACTO con la de runtime) y escribe en LICENSE_FILE (def.
 * `.license/license.lic`, gitignoreada). Corre con tsx, como prisma/seed.ts.
 * La emisión REAL de producción es la CLI de L3 con custodia de clave privada.
 */
import { randomUUID } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { deriveFingerprint, signLicense, type LicensePayload } from "@lyra/licensing";
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
  const fingerprint = deriveFingerprint(signals);
  const now = Date.now();

  const payload: LicensePayload = {
    licenseId: `lic_dev_${new Date(now).toISOString().slice(0, 10)}`,
    issuer: "ITESICWS (DEV)",
    issuedAt: new Date(now).toISOString(),
    notBefore: new Date(now - DAY_MS).toISOString(),
    // --expired: venció hace 60 días con 14 de gracia ⇒ SOLO_LECTURA (smoke).
    expiresAt: new Date(expired ? now - 60 * DAY_MS : now + 365 * DAY_MS).toISOString(),
    graceDays: 14,
    channelPartner: "DEV",
    customer: "Desarrollo local",
    installationId: "inst_dev_local",
    fingerprint,
    edition: "enterprise",
    // Entitlement: amplio para dev (default) o acotado vía --modules=a,b (smoke
    // del gating L2). El default es el catálogo completo de @lyra/contracts.
    modules: modulesArg
      ? modulesArg
          .slice("--modules=".length)
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean)
      : [
          "core",
          "structure",
          "templates",
          "logbook",
          "schedules",
          "incidents",
          "exceptions",
          "work-orders",
          "shift-handover",
          "notifications",
          "themes",
          "ai",
          "dashboards",
        ],
    limits: { maxInstallations: 1, maxNodes: 100_000, maxNamedUsers: 100_000 },
    whiteLabel: true,
    supportTier: "DEV",
    schemaVersion: 1,
    renewalCounter: 0,
    nonce: randomUUID(),
  };

  const lic = signLicense(payload, DEV_PRIVATE_KEY);
  mkdirSync(dirname(resolve(licenseFile)), { recursive: true });
  writeFileSync(resolve(licenseFile), lic + "\n", "utf8");

  console.log(`✅ Licencia DEV escrita en ${resolve(licenseFile)}`);
  console.log(`   estado esperado: ${expired ? "SOLO_LECTURA (vencida, --expired)" : "VALIDA"}`);
  console.log(`   huella: ${fingerprint}`);
  console.log(`   vence:  ${payload.expiresAt}`);
}

void main().catch((err: unknown) => {
  console.error("❌ No se pudo generar la licencia DEV:", err);
  process.exit(1);
});
