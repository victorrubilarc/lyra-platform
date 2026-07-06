import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveFingerprint, signLicense, type LicensePayload } from "@lyra/licensing";
import { LicenseService } from "./license.service";

/**
 * Comportamiento del servicio ante el sello de integridad (L5). El verificador
 * puro tiene su propio spec (integrity.spec.ts); aquí se prueba la REACCIÓN de
 * los dos puntos distribuidos: evaluateNow (snapshot BLOQUEADA/auditoría) y
 * workersOperational (pausa de fondo). Se mockea SOLO verifyArtifactIntegrity
 * (archivo aparte del spec base para no contaminar sus imports reales).
 */
vi.mock("./integrity", async (importOriginal) => {
  const real = await importOriginal<typeof import("./integrity")>();
  return { ...real, verifyArtifactIntegrity: vi.fn(async () => "UNSEALED" as const) };
});
import { verifyArtifactIntegrity } from "./integrity";

const integrityMock = vi.mocked(verifyArtifactIntegrity);

const DEV_PRIVATE_KEY = readFileSync(
  resolve(__dirname, "../../../../scripts/license/dev-keys/dev-private.pem"),
  "utf8",
);
const SIGNALS = { machineId: "maquina-de-prueba", cpuModel: "CPU Test", osPlatform: "linux" };
const FINGERPRINT = deriveFingerprint(SIGNALS);
const NOW = new Date("2026-07-06T12:00:00Z");
const DAY_MS = 86_400_000;

function payload(): LicensePayload {
  return {
    licenseId: "lic_test_l5",
    issuer: "ITESICWS (DEV)",
    issuedAt: NOW.toISOString(),
    notBefore: new Date(NOW.getTime() - DAY_MS).toISOString(),
    expiresAt: new Date(NOW.getTime() + 365 * DAY_MS).toISOString(),
    graceDays: 14,
    channelPartner: "DEV",
    customer: "Cliente de prueba",
    installationId: "inst_test",
    fingerprint: FINGERPRINT,
    edition: "professional",
    modules: ["core"],
    limits: { maxInstallations: 1, maxNodes: 1000, maxNamedUsers: 100 },
    whiteLabel: false,
    supportTier: "L2",
    schemaVersion: 1,
    renewalCounter: 0,
    nonce: randomUUID(),
  };
}

describe("LicenseService × integridad (L5)", () => {
  let dir: string;
  let licPath: string;
  let audit: { record: ReturnType<typeof vi.fn> };
  let scheduler: { addInterval: ReturnType<typeof vi.fn> };
  let service: LicenseService;

  function build(cfg: Record<string, unknown> = {}): LicenseService {
    const config = {
      get: vi.fn((key: string) => {
        const values: Record<string, unknown> = {
          LICENSE_FILE: licPath,
          LICENSE_RECHECK_MINUTES: 360,
          LICENSE_WARN_DAYS: 30,
          LICENSE_MACHINE_ID_FILE: "/etc/machine-id",
          NODE_ENV: "production",
          ...cfg,
        };
        return values[key];
      }),
    };
    const prisma = {
      licenseInstallation: {
        upsert: vi.fn(async () => ({
          id: "system",
          installationId: "inst_local_1",
          renewalCounter: 0,
          nonce: null,
        })),
        update: vi.fn(async () => ({})),
      },
      orgNode: { count: vi.fn(async () => 10) },
      user: { count: vi.fn(async () => 5) },
    };
    audit = { record: vi.fn(async () => undefined) };
    scheduler = { addInterval: vi.fn() };
    const svc = new LicenseService(
      config as never,
      prisma as never,
      audit as never,
      { collect: vi.fn(async () => SIGNALS) } as never,
      scheduler as never,
      { emit: vi.fn(async () => undefined) } as never,
    );
    svc.clock = () => NOW;
    return svc;
  }

  async function boot(svc: LicenseService): Promise<void> {
    try {
      await svc.onApplicationBootstrap();
    } finally {
      for (const call of scheduler.addInterval.mock.calls) {
        clearInterval(call[1] as NodeJS.Timeout);
      }
    }
  }

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "wl-l5-"));
    licPath = join(dir, "license.lic");
    writeFileSync(licPath, signLicense(payload(), DEV_PRIVATE_KEY), "utf8");
    integrityMock.mockClear();
    integrityMock.mockResolvedValue("UNSEALED");
    service = build();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("MISMATCH ⇒ BLOQUEADA/INTEGRITY_MISMATCH aunque la licencia sea válida (restringido, jamás crash)", async () => {
    integrityMock.mockResolvedValue("MISMATCH");
    await boot(service);
    const snap = service.getEvaluation();
    expect(snap.status).toBe("BLOQUEADA");
    expect(snap.reason).toBe("INTEGRITY_MISMATCH");
    // Sin payload verificado el DTO no expone módulos (gobiernan los estados globales).
    expect(snap.licensedModules).toBeUndefined();
  });

  it("MISMATCH se audita por la cañería existente (license.state.changed)", async () => {
    integrityMock.mockResolvedValue("MISMATCH");
    await boot(service);
    const call = audit.record.mock.calls.find(
      (c) => (c[0] as { action: string }).action === "license.state.changed",
    );
    expect(call).toBeDefined();
    expect((call?.[0] as { after: { reason: string } }).after.reason).toBe("INTEGRITY_MISMATCH");
  });

  it("SEALED_OK ⇒ la evaluación sigue normal (VALIDA con la licencia dev)", async () => {
    integrityMock.mockResolvedValue("SEALED_OK");
    await boot(service);
    expect(service.getEvaluation().status).toBe("VALIDA");
  });

  it("el sello exige NODE_ENV=production (requireSeal) en ambos puntos", async () => {
    await boot(service);
    await service.workersOperational("spec");
    expect(integrityMock).toHaveBeenCalled();
    for (const call of integrityMock.mock.calls) {
      expect((call[0] as { requireSeal: boolean }).requireSeal).toBe(true);
    }
    integrityMock.mockClear();
    const devService = build({ NODE_ENV: "development" });
    await boot(devService);
    expect(
      integrityMock.mock.calls.every((c) => (c[0] as { requireSeal: boolean }).requireSeal === false),
    ).toBe(true);
  });

  it("workersOperational: MISMATCH pausa el trabajo de fondo (2.º punto, independiente del snapshot)", async () => {
    await boot(service);
    expect(service.getEvaluation().status).toBe("VALIDA");
    await expect(service.workersOperational("spec")).resolves.toBe(true);
    // El snapshot cacheado sigue VALIDA; el chequeo del worker recomputa solo.
    integrityMock.mockResolvedValue("MISMATCH");
    await expect(service.workersOperational("spec")).resolves.toBe(false);
    expect(service.getEvaluation().status).toBe("VALIDA");
  });
});
