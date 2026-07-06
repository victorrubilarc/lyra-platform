import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deriveFingerprint, signLicense, type LicensePayload } from "@lyra/licensing";
import { LicenseService } from "./license.service";
import { PENDING_ACTIVATION } from "./license-runtime";

/** Privada DEV committeada: firma licencias que acepta la pública EMBEBIDA. */
const DEV_PRIVATE_KEY = readFileSync(
  resolve(__dirname, "../../../../scripts/license/dev-keys/dev-private.pem"),
  "utf8",
);

const SIGNALS = { machineId: "maquina-de-prueba", cpuModel: "CPU Test", osPlatform: "linux" };
const FINGERPRINT = deriveFingerprint(SIGNALS);
const NOW = new Date("2026-07-05T12:00:00Z");
const DAY_MS = 86_400_000;

function payload(over: Partial<LicensePayload> = {}): LicensePayload {
  return {
    licenseId: "lic_test_001",
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
    modules: ["core", "incidents"],
    limits: { maxInstallations: 1, maxNodes: 1000, maxNamedUsers: 100 },
    whiteLabel: false,
    supportTier: "L2",
    schemaVersion: 1,
    renewalCounter: 0,
    nonce: randomUUID(),
    ...over,
  };
}

describe("LicenseService", () => {
  let dir: string;
  let licPath: string;
  let audit: { record: ReturnType<typeof vi.fn> };
  let prisma: {
    licenseInstallation: { upsert: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    orgNode: { count: ReturnType<typeof vi.fn> };
    user: { count: ReturnType<typeof vi.fn> };
  };
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
          ...cfg,
        };
        return values[key];
      }),
    };
    const collector = { collect: vi.fn(async () => SIGNALS) };
    scheduler = { addInterval: vi.fn() };
    const svc = new LicenseService(
      config as never,
      prisma as never,
      audit as never,
      collector as never,
      scheduler as never,
    );
    svc.clock = () => NOW;
    return svc;
  }

  /** Bootstrap limpiando el interval real que registra (no dejar timers vivos). */
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
    dir = mkdtempSync(join(tmpdir(), "wl-lic-"));
    licPath = join(dir, "license.lic");
    audit = { record: vi.fn(async () => undefined) };
    prisma = {
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
    service = build();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("sin archivo: arranca DEGRADADA (PENDIENTE_ACTIVACION), jamás crashea, y deja solicitud.lreq", async () => {
    await boot(service);
    const snap = service.getEvaluation();
    expect(snap.status).toBe(PENDING_ACTIVATION);
    expect(snap.reason).toBe("LICENSE_FILE_MISSING");
    expect(snap.installationId).toBe("inst_local_1");
    // Ceremonia de activación lista: solicitud.lreq junto a la ruta de la licencia.
    const req = JSON.parse(readFileSync(join(dir, "solicitud.lreq"), "utf8"));
    expect(req.installationId).toBe("inst_local_1");
    expect(req.fingerprint).toBe(FINGERPRINT);
  });

  it("licencia válida: VALIDA, con datos presentables y módulos licenciados", async () => {
    writeFileSync(licPath, signLicense(payload(), DEV_PRIVATE_KEY));
    await boot(service);
    const snap = service.getEvaluation();
    expect(snap.status).toBe("VALIDA");
    expect(snap.licenseId).toBe("lic_test_001");
    expect(snap.customer).toBe("Cliente de prueba");
    expect(service.isModuleLicensed("incidents")).toBe(true);
    expect(service.isModuleLicensed("modulo-que-no-compró")).toBe(false);
    // No se escribe solicitud si hay licencia.
    expect(existsSync(join(dir, "solicitud.lreq"))).toBe(false);
  });

  it("archivo ADULTERADO (payload editado): BLOQUEADA por firma, sin crash", async () => {
    const lic = signLicense(payload(), DEV_PRIVATE_KEY);
    const [h, body, sig] = lic.split(".");
    const tampered = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    tampered.limits.maxNamedUsers = 999_999; // el socio se "amplía" los topes
    writeFileSync(
      licPath,
      `${h}.${Buffer.from(JSON.stringify(tampered)).toString("base64url")}.${sig}`,
    );
    await boot(service);
    expect(service.getEvaluation().status).toBe("BLOQUEADA");
    expect(service.getEvaluation().reason).toBe("INVALID_SIGNATURE");
  });

  it("archivo CORRUPTO (basura): BLOQUEADA, sin crash", async () => {
    writeFileSync(licPath, "esto-no-es-un-jws");
    await boot(service);
    expect(service.getEvaluation().status).toBe("BLOQUEADA");
    expect(service.getEvaluation().reason).toBe("MALFORMED_JWS");
  });

  it("huella de OTRA máquina: BLOQUEADA (node-lock)", async () => {
    writeFileSync(licPath, signLicense(payload({ fingerprint: "huella-ajena" }), DEV_PRIVATE_KEY));
    await boot(service);
    expect(service.getEvaluation().status).toBe("BLOQUEADA");
    expect(service.getEvaluation().reason).toBe("FINGERPRINT_MISMATCH");
  });

  it("reloj falso: vencida dentro de gracia ⇒ EN_GRACIA; pasada la gracia ⇒ SOLO_LECTURA", async () => {
    writeFileSync(
      licPath,
      signLicense(
        payload({ expiresAt: new Date(NOW.getTime() - 5 * DAY_MS).toISOString(), graceDays: 14 }),
        DEV_PRIVATE_KEY,
      ),
    );
    await boot(service);
    expect(service.getEvaluation().status).toBe("EN_GRACIA");

    service.clock = () => new Date(NOW.getTime() + 30 * DAY_MS);
    await service.refresh("test");
    expect(service.getEvaluation().status).toBe("SOLO_LECTURA");
    expect(service.getEvaluation().reason).toBe("EXPIRED_BEYOND_GRACE");
  });

  it("por vencer (≤ warnDays): POR_VENCER (no restringe)", async () => {
    writeFileSync(
      licPath,
      signLicense(
        payload({ expiresAt: new Date(NOW.getTime() + 10 * DAY_MS).toISOString() }),
        DEV_PRIVATE_KEY,
      ),
    );
    await boot(service);
    expect(service.getEvaluation().status).toBe("POR_VENCER");
  });

  it("conteos reales sobre el tope: LIMITE_EXCEDIDO (registra, no restringe en L1)", async () => {
    prisma.user.count = vi.fn(async () => 150); // tope 100
    service = build();
    writeFileSync(licPath, signLicense(payload(), DEV_PRIVATE_KEY));
    await boot(service);
    const snap = service.getEvaluation();
    expect(snap.status).toBe("LIMITE_EXCEDIDO");
    expect(snap.evaluation?.exceeded).toEqual([
      { limit: "maxNamedUsers", max: 100, actual: 150 },
    ]);
  });

  it("AUDITA cada cambio de estado (actor sistema, antes/después) y no repite sin cambio", async () => {
    writeFileSync(licPath, signLicense(payload(), DEV_PRIVATE_KEY));
    await boot(service);
    expect(audit.record).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "license.state.changed",
        actorEmail: "system@license",
        before: null,
        after: expect.objectContaining({ status: "VALIDA" }),
      }),
    );

    await service.refresh("tick"); // mismo estado ⇒ sin nueva auditoría
    expect(audit.record).toHaveBeenCalledTimes(1);

    rmSync(licPath); // le quitan el archivo en caliente ⇒ cambio auditado
    await service.refresh("tick");
    expect(audit.record).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenLastCalledWith(
      expect.objectContaining({
        before: expect.objectContaining({ status: "VALIDA" }),
        after: expect.objectContaining({ status: PENDING_ACTIVATION }),
      }),
    );
  });

  it("workersOperational: chequeo INDEPENDIENTE desde disco (válida ⇒ true; sin archivo/adulterada ⇒ false)", async () => {
    writeFileSync(licPath, signLicense(payload(), DEV_PRIVATE_KEY));
    await boot(service);
    expect(await service.workersOperational("test")).toBe(true);

    // Adulterada EN CALIENTE: el worker la detecta sin esperar la re-evaluación
    // cacheada (verificación distribuida, no un único interruptor).
    writeFileSync(licPath, "adulterada");
    expect(await service.workersOperational("test")).toBe(false);

    rmSync(licPath);
    expect(await service.workersOperational("test")).toBe(false);
  });

  it("genera y persiste el installationId una sola vez (upsert single-row)", async () => {
    await boot(service);
    expect(prisma.licenseInstallation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "system" } }),
    );
  });

  describe("linaje rotatorio (L4)", () => {
    function withLocalLineage(renewalCounter: number, nonce: string | null): void {
      prisma.licenseInstallation.upsert = vi.fn(async () => ({
        id: "system",
        installationId: "inst_local_1",
        renewalCounter,
        nonce,
      }));
      service = build();
    }

    it("RETROCOMPATIBILIDAD: counter=0 sobre instalación que jamás renovó ⇒ VALIDA como antes de L4, sin rotación", async () => {
      writeFileSync(licPath, signLicense(payload(), DEV_PRIVATE_KEY));
      await boot(service);
      expect(service.getEvaluation().status).toBe("VALIDA");
      // Sin rotación ni auditoría de renovación; solo la init perezosa del nonce local.
      expect(audit.record).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: "license.renewed" }),
      );
      const rotations = prisma.licenseInstallation.update.mock.calls.filter(
        (call) => (call[0] as { data: Record<string, unknown> }).data.renewalCounter !== undefined,
      );
      expect(rotations).toHaveLength(0);
    });

    it("deja/refresca renovacion.lreq junto a la licencia, con el linaje LOCAL vigente (nonce inicializado perezoso)", async () => {
      writeFileSync(licPath, signLicense(payload(), DEV_PRIVATE_KEY));
      await boot(service);
      const req = JSON.parse(readFileSync(join(dir, "renovacion.lreq"), "utf8"));
      expect(req.type).toBe("renewal");
      expect(req.installationId).toBe("inst_local_1");
      expect(req.fingerprint).toBe(FINGERPRINT);
      expect(req.licenseId).toBe("lic_test_001");
      expect(req.renewalCounter).toBe(0);
      expect(typeof req.nonce).toBe("string"); // nonce local, NO el del payload
      // La init perezosa quedó persistida con ese mismo nonce.
      expect(prisma.licenseInstallation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { nonce: req.nonce } }),
      );
    });

    it("renovación (counter+1 atada al nonce local): rota UNA vez, audita license.renewed y queda CURRENT", async () => {
      withLocalLineage(0, "nonce-presentado");
      writeFileSync(
        licPath,
        signLicense(payload({ renewalCounter: 1, nonce: "nonce-presentado" }), DEV_PRIVATE_KEY),
      );
      await boot(service);
      expect(service.getEvaluation().status).toBe("VALIDA");

      // Rotación persistida: counter emitido + nonce local FRESCO + lastRenewalAt.
      const rotation = prisma.licenseInstallation.update.mock.calls.find(
        (call) => (call[0] as { data: Record<string, unknown> }).data.renewalCounter === 1,
      );
      expect(rotation).toBeDefined();
      const data = (rotation![0] as { data: Record<string, unknown> }).data;
      expect(data.nonce).not.toBe("nonce-presentado");
      expect(data.lastRenewalAt).toBeInstanceOf(Date);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "license.renewed",
          before: { renewalCounter: 0 },
          after: expect.objectContaining({ renewalCounter: 1, licenseId: "lic_test_001" }),
        }),
      );
      // La solicitud nueva presenta el linaje ROTADO (counter=1, nonce fresco).
      const req = JSON.parse(readFileSync(join(dir, "renovacion.lreq"), "utf8"));
      expect(req.renewalCounter).toBe(1);
      expect(req.nonce).toBe(data.nonce);

      // Re-evaluación con la MISMA licencia: CURRENT, sin segunda rotación.
      const updatesBefore = prisma.licenseInstallation.update.mock.calls.length;
      await service.refresh("tick");
      expect(service.getEvaluation().status).toBe("VALIDA");
      expect(prisma.licenseInstallation.update.mock.calls.length).toBe(updatesBefore);
    });

    it("la licencia ANTERIOR (counter=0) tras haber rotado ⇒ BLOQUEADA LINEAGE_MISMATCH y el worker tampoco opera", async () => {
      withLocalLineage(1, "nonce-fresco-local");
      writeFileSync(licPath, signLicense(payload({ renewalCounter: 0 }), DEV_PRIVATE_KEY));
      await boot(service);
      const snap = service.getEvaluation();
      expect(snap.status).toBe("BLOQUEADA");
      expect(snap.reason).toBe("LINEAGE_MISMATCH");
      expect(service.isModuleLicensed("incidents")).toBe(false); // sin payload aceptado
      expect(await service.workersOperational("test")).toBe(false); // chequeo distribuido
    });

    it("una renovada (counter>0) movida a una instalación que jamás pidió renovar ⇒ BLOQUEADA (no calza)", async () => {
      writeFileSync(
        licPath,
        signLicense(payload({ renewalCounter: 1, nonce: "nonce-de-otra" }), DEV_PRIVATE_KEY),
      );
      await boot(service);
      expect(service.getEvaluation().status).toBe("BLOQUEADA");
      expect(service.getEvaluation().reason).toBe("LINEAGE_MISMATCH");
    });

    it("NO rota si la evaluación la BLOQUEA (p. ej. huella ajena): el linaje no se quema en vano", async () => {
      withLocalLineage(0, "nonce-presentado");
      writeFileSync(
        licPath,
        signLicense(
          payload({ renewalCounter: 1, nonce: "nonce-presentado", fingerprint: "huella-ajena" }),
          DEV_PRIVATE_KEY,
        ),
      );
      await boot(service);
      expect(service.getEvaluation().status).toBe("BLOQUEADA");
      expect(service.getEvaluation().reason).toBe("FINGERPRINT_MISMATCH");
      const rotations = prisma.licenseInstallation.update.mock.calls.filter(
        (call) => (call[0] as { data: Record<string, unknown> }).data.renewalCounter !== undefined,
      );
      expect(rotations).toHaveLength(0);
    });
  });
});
