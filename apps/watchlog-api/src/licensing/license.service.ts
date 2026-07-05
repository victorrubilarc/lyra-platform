import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import {
  deriveFingerprint,
  evaluateLicense,
  isModuleLicensed,
  verifyLicense,
  type LicenseActuals,
  type LicensePayload,
} from "@lyra/licensing";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { MachineSignalsCollector } from "./machine-signals.collector";
import { LICENSE_PUBLIC_KEY_PEM } from "./license-public-key";
import {
  PENDING_ACTIVATION,
  RESTRICTED_STATUSES,
  type LicenseSnapshot,
} from "./license-runtime";

const RECHECK_INTERVAL_NAME = "license-recheck";
/** Nombre del archivo de solicitud de activación (runbook LICENSING_PROCEDURE §2). */
const REQUEST_FILE_NAME = "solicitud.lreq";

/**
 * Runtime de la licencia en la API (Licenciamiento L1). Al ARRANQUE y luego
 * periódicamente (LICENSE_RECHECK_MINUTES, def. 6 h): carga `license.lic`
 * (LICENSE_FILE), verifica la firma con la clave pública EMBEBIDA
 * (`verifyLicense` de @lyra/licensing — toda la lógica pura vive allá, aquí
 * solo I/O y orquestación), deriva la huella real de la máquina, evalúa la
 * máquina de estados (`evaluateLicense` + conteos reales) y CACHEA el
 * resultado (`LicenseSnapshot`) para el guard global y los chequeos
 * distribuidos.
 *
 * Principios que este servicio hace cumplir (LICENSING.md §5):
 *  - Sin licencia la app ARRANCA degradada (PENDIENTE_ACTIVACION), jamás
 *    crashea: no se deja una planta a ciegas de golpe.
 *  - El peor estado es restringido = solo lectura + exportación. Nada
 *    destructivo, nunca.
 *  - Todo cambio de estado se AUDITA (actor sistema, antes/después) y se
 *    loguea nítido. Ningún error de carga/verificación se traga.
 */
@Injectable()
export class LicenseService implements OnApplicationBootstrap {
  private readonly logger = new Logger(LicenseService.name);
  private snapshot?: LicenseSnapshot;
  private payload?: LicensePayload;
  private fingerprint = "";
  private installationId = "";
  /** Para loguear una sola vez cada transición del chequeo de los workers. */
  private workersWereOperational?: boolean;

  /** Reloj inyectable (tests con reloj falso); en runtime, la hora real. */
  clock: () => Date = () => new Date();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly signals: MachineSignalsCollector,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.ensureInstallation();
    this.fingerprint = deriveFingerprint(await this.signals.collect());
    await this.refresh("arranque");

    const minutes = this.config.get("LICENSE_RECHECK_MINUTES", { infer: true });
    const timer = setInterval(() => {
      void this.refresh("re-evaluación periódica").catch((err: unknown) => {
        // El catch de la promesa ya está dentro de refresh(); este es el cinturón
        // extra para que un tick roto JAMÁS tumbe el proceso.
        this.logger.error(`Re-evaluación de licencia falló: ${String(err)}`);
      });
    }, minutes * 60_000);
    this.scheduler.addInterval(RECHECK_INTERVAL_NAME, timer);
  }

  /** Foto cacheada del estado (guard global, L6). Nunca undefined tras bootstrap. */
  getEvaluation(): LicenseSnapshot {
    return (
      this.snapshot ?? {
        // Antes de la primera evaluación (no debería ocurrir: Nest no sirve HTTP
        // hasta completar bootstrap) el default es RESTRICTIVO, nunca abierto.
        status: PENDING_ACTIVATION,
        reason: "LICENSE_FILE_MISSING",
        fingerprint: this.fingerprint,
        installationId: this.installationId,
        checkedAt: this.clock(),
      }
    );
  }

  /**
   * Entitlement de módulo (eje de la INSTALACIÓN, distinto del RBAC del
   * usuario). LATENTE en L1: el gating por endpoint/web se construye en L2;
   * hoy no hay consumidores que bloqueen por esto.
   */
  isModuleLicensed(moduleKey: string): boolean {
    return this.payload !== undefined && isModuleLicensed(this.payload, moduleKey);
  }

  /**
   * Chequeo INDEPENDIENTE para procesos de fondo (verificación DISTRIBUIDA,
   * LICENSING_STRATEGY §5): re-verifica la firma DESDE EL DISCO en cada
   * llamada — no reusa el booleano cacheado del guard, para que no exista un
   * único interruptor. Barato (lectura de archivo + Ed25519 ≈ µs). En estados
   * restringidos los workers NO generan trabajo operacional nuevo; la lectura
   * de datos existentes no pasa por aquí (nunca se secuestran datos).
   */
  async workersOperational(context: string): Promise<boolean> {
    let operational = false;
    try {
      const raw = await this.readLicenseFile();
      if (raw !== undefined) {
        const verified = verifyLicense(raw, LICENSE_PUBLIC_KEY_PEM);
        if (verified.ok) {
          const evaluation = evaluateLicense(verified.payload, {
            now: this.clock(),
            fingerprint: this.fingerprint,
            warnDays: this.config.get("LICENSE_WARN_DAYS", { infer: true }),
          });
          operational = !RESTRICTED_STATUSES.has(evaluation.state);
        }
      }
    } catch (err) {
      this.logger.error(`Chequeo de licencia (${context}) falló: ${String(err)}`);
      operational = false;
    }

    if (operational !== this.workersWereOperational) {
      if (!operational) {
        this.logger.warn(
          `Licencia en estado restringido: los procesos de fondo (${context}) quedan ` +
            "en pausa. La lectura y exportación de datos siguen disponibles.",
        );
      } else if (this.workersWereOperational === false) {
        this.logger.log(`Licencia operativa nuevamente: procesos de fondo (${context}) reanudados.`);
      }
      this.workersWereOperational = operational;
    }
    return operational;
  }

  /**
   * (Re)evalúa la licencia y actualiza el snapshot cacheado. Idempotente y a
   * prueba de errores: cualquier falla degrada el estado, jamás lanza hacia el
   * arranque ni hacia el tick del scheduler.
   */
  async refresh(trigger: string): Promise<LicenseSnapshot> {
    const previous = this.snapshot;
    const next = await this.evaluateNow();
    this.snapshot = next;

    this.logLicenseStatus(trigger, next);
    if (previous?.status !== next.status) {
      await this.audit.record({
        action: "license.state.changed",
        actorEmail: "system@license",
        entityType: "LicenseInstallation",
        entityId: next.installationId,
        before: previous
          ? { status: previous.status, reason: previous.reason ?? null }
          : null,
        after: {
          status: next.status,
          reason: next.reason ?? null,
          licenseId: next.licenseId ?? null,
          expiresAt: next.expiresAt ?? null,
          daysToExpiry: next.evaluation?.daysToExpiry ?? null,
        },
        metadata: { trigger },
      });
    }
    return next;
  }

  // --- internos ---------------------------------------------------------------

  private async evaluateNow(): Promise<LicenseSnapshot> {
    const base = {
      fingerprint: this.fingerprint,
      installationId: this.installationId,
      checkedAt: this.clock(),
    };

    let raw: string | undefined;
    try {
      raw = await this.readLicenseFile();
    } catch (err) {
      // Error de I/O distinto de "no existe" (permisos, disco): se degrada a
      // pendiente y se deja constancia — nunca se tumba el arranque.
      this.logger.error(`No se pudo leer el archivo de licencia: ${String(err)}`);
      this.payload = undefined;
      return { ...base, status: PENDING_ACTIVATION, reason: "LICENSE_FILE_MISSING" };
    }
    if (raw === undefined) {
      this.payload = undefined;
      await this.writeActivationRequest();
      return { ...base, status: PENDING_ACTIVATION, reason: "LICENSE_FILE_MISSING" };
    }

    const verified = verifyLicense(raw, LICENSE_PUBLIC_KEY_PEM);
    if (!verified.ok) {
      // Firma adulterada/corrupta ⇒ BLOQUEADA (restringido = solo lectura +
      // exportación; los datos son del cliente y no se tocan).
      this.payload = undefined;
      this.logger.error(
        `Archivo de licencia INVÁLIDO (${verified.reason}): ${verified.detail ?? "sin detalle"}`,
      );
      return { ...base, status: "BLOQUEADA", reason: verified.reason };
    }

    this.payload = verified.payload;
    const evaluation = evaluateLicense(verified.payload, {
      now: this.clock(),
      fingerprint: this.fingerprint,
      actuals: await this.collectActuals(),
      warnDays: this.config.get("LICENSE_WARN_DAYS", { infer: true }),
    });
    return {
      ...base,
      status: evaluation.state,
      reason: evaluation.reason,
      evaluation,
      licensedModules: verified.payload.modules,
      licenseId: verified.payload.licenseId,
      customer: verified.payload.customer,
      edition: verified.payload.edition,
      expiresAt: verified.payload.expiresAt,
    };
  }

  /** Contenido de LICENSE_FILE, o undefined si el archivo no existe (ENOENT). */
  private async readLicenseFile(): Promise<string | undefined> {
    try {
      return (await readFile(this.licenseFilePath(), "utf8")).trim();
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw err;
    }
  }

  private licenseFilePath(): string {
    return this.config.get("LICENSE_FILE", { infer: true });
  }

  /**
   * Identidad local de la instalación (fila única id="system"): se genera en el
   * PRIMER arranque y persiste en Postgres junto al linaje que usará L4
   * (DECISIONS 2026-07-05: el pg_dump del runbook la respalda con los datos;
   * clonar la BD clona el linaje = lo que L4 detecta).
   */
  private async ensureInstallation(): Promise<void> {
    const row = await this.prisma.licenseInstallation.upsert({
      where: { id: "system" },
      update: {},
      create: { id: "system", installationId: `inst_${randomUUID()}` },
    });
    this.installationId = row.installationId;
  }

  /**
   * Conteos reales contra los topes de la licencia. Solo lo medible aquí:
   * `installations` no se mide desde adentro (es un tope del EMISOR). Un fallo
   * de BD no bloquea la evaluación (se evalúa sin actuals).
   */
  private async collectActuals(): Promise<LicenseActuals | undefined> {
    try {
      const [nodes, namedUsers] = await Promise.all([
        this.prisma.orgNode.count(),
        this.prisma.user.count({ where: { status: "ACTIVE" } }),
      ]);
      return { nodes, namedUsers };
    } catch (err) {
      this.logger.error(`No se pudieron medir nodos/usuarios para la licencia: ${String(err)}`);
      return undefined;
    }
  }

  /**
   * Sin licencia, deja preparada la ceremonia de activación del runbook: escribe
   * `solicitud.lreq` (installationId + huella; SIN datos del cliente ni
   * secretos) junto a la ruta de la licencia, para que el socio lo lleve por
   * USB/portal al emisor. Idempotente (no lo reescribe si ya existe).
   */
  private async writeActivationRequest(): Promise<void> {
    const path = join(dirname(this.licenseFilePath()), REQUEST_FILE_NAME);
    try {
      await readFile(path, "utf8");
      return; // ya existe
    } catch {
      // no existe (o no es legible): se intenta escribir abajo
    }
    try {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        JSON.stringify(
          {
            product: "lyra-watchlog",
            schemaVersion: 1,
            installationId: this.installationId,
            fingerprint: this.fingerprint,
            generatedAt: this.clock().toISOString(),
          },
          null,
          2,
        ),
        "utf8",
      );
      this.logger.log(`Solicitud de activación escrita en ${path} (llevar al emisor).`);
    } catch (err) {
      this.logger.error(`No se pudo escribir la solicitud de activación: ${String(err)}`);
    }
  }

  private logLicenseStatus(trigger: string, snap: LicenseSnapshot): void {
    const detail = [
      `estado=${snap.status}`,
      snap.reason ? `motivo=${snap.reason}` : undefined,
      snap.licenseId ? `licencia=${snap.licenseId}` : undefined,
      snap.customer ? `cliente=${snap.customer}` : undefined,
      snap.edition ? `edición=${snap.edition}` : undefined,
      snap.expiresAt ? `vence=${snap.expiresAt}` : undefined,
      snap.evaluation?.daysToExpiry !== undefined
        ? `días-restantes=${snap.evaluation.daysToExpiry}`
        : undefined,
      `huella=${snap.fingerprint}`,
    ]
      .filter(Boolean)
      .join(" · ");
    const message = `Licencia (${trigger}): ${detail}`;
    if (RESTRICTED_STATUSES.has(snap.status)) this.logger.warn(message);
    else this.logger.log(message);
  }
}
