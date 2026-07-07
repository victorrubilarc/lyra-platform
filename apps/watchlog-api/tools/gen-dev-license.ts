/**
 * Genera una licencia de DESARROLLO (`license.lic`) para ESTA máquina, firmada
 * con el par DEV committeado en `scripts/license/dev-keys/` (NO es un secreto:
 * solo lo aceptan builds que embeben la pública DEV). Uso:
 *
 *   pnpm --filter @lyra/watchlog-api run license:dev            # 1 año, válida
 *   pnpm --filter @lyra/watchlog-api run license:dev -- --expired   # vencida (smoke)
 *   pnpm --filter @lyra/watchlog-api run license:dev -- --modules=core,incidents
 *   pnpm --filter @lyra/watchlog-api run license:dev -- --expires-in-days=10   # POR_VENCER (banner L6)
 *   pnpm --filter @lyra/watchlog-api run license:dev -- --max-nodes=50 --max-named-users=10   # topes L2b
 *   pnpm --filter @lyra/watchlog-api run license:dev -- --no-white-label   # co-branding (S3: whiteLabel=false)
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
  // --no-white-label ⇒ whiteLabel=false (smoke del gate L6d/S3). El default del
  // emisor es whiteLabel=true (modelo de canal: el socio re-marca).
  const noWhiteLabel = process.argv.includes("--no-white-label");
  // --modules=core,incidents ⇒ entitlement ACOTADO (smoke del gating L2).
  const modulesArg = process.argv.find((a) => a.startsWith("--modules="));
  // --max-nodes=N / --max-named-users=N ⇒ topes ACOTADOS (smoke del
  // enforcement de límites L2b). Default: holgura total (100 000).
  const intFlag = (flag: string): number | undefined => {
    const arg = process.argv.find((a) => a.startsWith(`${flag}=`));
    if (!arg) return undefined;
    const value = Number.parseInt(arg.slice(flag.length + 1), 10);
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${flag} exige un entero ≥ 0`);
    }
    return value;
  };
  const maxNodes = intFlag("--max-nodes");
  const maxNamedUsers = intFlag("--max-named-users");
  // --expires-in-days=N ⇒ vence en N días (N ≤ 30 = POR_VENCER; para el banner
  // L6). Un N NEGATIVO significa que YA venció hace |N| días: con la gracia
  // default de 14, -5 ⇒ EN_GRACIA y -60 equivale a --expired (SOLO_LECTURA).
  const expiresInArg = process.argv.find((a) => a.startsWith("--expires-in-days="));
  const expiresInDays = expiresInArg
    ? Number.parseInt(expiresInArg.slice("--expires-in-days=".length), 10)
    : undefined;
  if (expiresInArg && (!Number.isFinite(expiresInDays) || expiresInDays === 0)) {
    throw new Error("--expires-in-days exige un entero ≠ 0 (negativo = ya vencida hace |N| días)");
  }
  if (expired && expiresInDays !== undefined) {
    throw new Error("--expired y --expires-in-days son excluyentes");
  }
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
      limits: {
        maxInstallations: 1,
        maxNodes: maxNodes ?? 100_000,
        maxNamedUsers: maxNamedUsers ?? 100_000,
      },
      // --expired: venció hace 60 días con 14 de gracia ⇒ SOLO_LECTURA (smoke).
      // --expires-in-days=N: vence en N días (≤ warnDays ⇒ POR_VENCER, banner L6).
      expiresAt: new Date(
        expired
          ? now - 60 * DAY_MS
          : now + (expiresInDays ?? 365) * DAY_MS,
      ).toISOString(),
      graceDays: 14,
      licenseId: `lic_dev_${new Date(now).toISOString().slice(0, 10)}`,
      issuer: "ITESICWS (DEV)",
      supportTier: "DEV",
      whiteLabel: noWhiteLabel ? false : undefined,
      allowPast: expired || (expiresInDays !== undefined && expiresInDays < 0),
    },
  });

  mkdirSync(dirname(resolve(licenseFile)), { recursive: true });
  writeFileSync(resolve(licenseFile), issued.lic + "\n", "utf8");

  const expectedState = expired
    ? "SOLO_LECTURA (vencida, --expired)"
    : expiresInDays !== undefined && expiresInDays < 0
      ? `${-expiresInDays <= 14 ? "EN_GRACIA" : "SOLO_LECTURA"} (venció hace ${-expiresInDays} días, gracia 14)`
      : expiresInDays !== undefined && expiresInDays <= 30
        ? `POR_VENCER (vence en ${expiresInDays} días)`
        : "VALIDA";
  console.log(`✅ Licencia DEV escrita en ${resolve(licenseFile)}`);
  console.log(`   estado esperado: ${expectedState}`);
  console.log(`   whiteLabel: ${issued.payload.whiteLabel}`);
  console.log(`   huella: ${request.fingerprint}`);
  console.log(`   vence:  ${issued.payload.expiresAt}`);
}

void main().catch((err: unknown) => {
  console.error("❌ No se pudo generar la licencia DEV:", err);
  process.exit(1);
});
