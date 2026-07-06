import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SchedulerRegistry } from "@nestjs/schedule";
import {
  deriveFingerprint,
  evaluateLicense,
  evaluateLineage,
  isModuleLicensed,
  LicenseState,
  verifyLicense,
  type LicenseActuals,
  type LicensePayload,
  type LocalLineage,
} from "@lyra/licensing";
import type { LicensedModuleKey } from "@lyra/contracts";
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
/** Nombre del archivo de solicitud de RENOVACIÓN con linaje (L4, runbook §4). */
const RENEWAL_REQUEST_FILE_NAME = "renovacion.lreq";

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
  /**
   * Linaje rotatorio local (L4, espejo en memoria de `LicenseInstallation`):
   * el nonce vigente se genera AQUÍ y jamás viaja hasta la próxima
   * `renovacion.lreq`. Se contrasta contra el linaje del payload en cada
   * evaluación y en el chequeo distribuido del worker.
   */
  private localLineage: LocalLineage = { renewalCounter: 0, nonce: null };
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
   * usuario). Lo consumen el `ModuleEntitlementGuard` (L2) y los chequeos
   * distribuidos. Sin payload verificado devuelve false (no hay entitlement
   * que afirmar); para «sin payload NO opines» usar `moduleOperational`.
   */
  isModuleLicensed(moduleKey: string): boolean {
    return this.payload !== undefined && isModuleLicensed(this.payload, moduleKey);
  }

  /**
   * Entitlement de módulo para PROCESOS DE FONDO (verificación distribuida,
   * L2): con payload verificado exige que el módulo esté en `modules[]`; SIN
   * payload no opina (true) — esos estados los gobierna la máquina de estados
   * global (`workersOperational` / guard L1), y así un estado global nunca se
   * enmascara como problema de módulo. Mismo criterio que el guard HTTP.
   */
  moduleOperational(moduleKey: LicensedModuleKey): boolean {
    return this.snapshot?.licensedModules === undefined || this.isModuleLicensed(moduleKey);
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
        // El linaje también participa del chequeo distribuido (L4): una
        // licencia cuyo linaje no calza (respuesta re-importada / clon que
        // quedó atrás) no habilita trabajo de fondo. MISMA regla pura que la
        // evaluación principal (`evaluateLineage`), segunda ruta de código.
        if (verified.ok && evaluateLineage(verified.payload, this.localLineage) !== "MISMATCH") {
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

    // --- Linaje rotatorio (L4): la respuesta de renovación solo calza UNA vez
    // --- y solo aquí. Una licencia counter=0 sobre una instalación que jamás
    // --- renovó da CURRENT y evalúa EXACTAMENTE como antes de L4.
    const lineage = evaluateLineage(verified.payload, this.localLineage);
    if (lineage === "MISMATCH") {
      this.payload = undefined;
      this.logger.error(
        `Licencia con LINAJE que no calza (payload counter=${verified.payload.renewalCounter}, ` +
          `local counter=${this.localLineage.renewalCounter}): licencia anterior tras una ` +
          "renovación, respuesta re-importada o instalación clonada. BLOQUEADA (solo lectura + " +
          "exportación; los datos no se tocan). Genere la renovación con la solicitud vigente.",
      );
      // Camino de escalamiento: la solicitud con el linaje LOCAL vigente queda
      // disponible igual — al presentarla, el emisor ve el desfase y resuelve.
      await this.writeRenewalRequest(verified.payload.licenseId);
      return { ...base, status: "BLOQUEADA", reason: "LINEAGE_MISMATCH" };
    }

    this.payload = verified.payload;
    const evaluation = evaluateLicense(verified.payload, {
      now: this.clock(),
      fingerprint: this.fingerprint,
      actuals: await this.collectActuals(),
      warnDays: this.config.get("LICENSE_WARN_DAYS", { infer: true }),
    });
    if (lineage === "ROTATE" && evaluation.state !== LicenseState.BLOQUEADA) {
      // Primera importación de una renovación legítima: rotar el linaje local.
      // (Si la evaluación la BLOQUEA — p. ej. huella ajena — NO se rota.)
      await this.rotateLineage(verified.payload);
    }
    await this.writeRenewalRequest(verified.payload.licenseId);
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
    this.localLineage = {
      renewalCounter: row.renewalCounter ?? 0,
      nonce: row.nonce ?? null,
    };
  }

  /**
   * Rota el linaje local al aceptar por PRIMERA vez una renovación (L4):
   * persiste el counter emitido, un nonce local FRESCO (jamás viaja hasta la
   * próxima solicitud) y `lastRenewalAt`. Desde aquí, ni la licencia anterior
   * ni una re-importación de esta respuesta calzan en ninguna instalación.
   */
  private async rotateLineage(payload: LicensePayload): Promise<void> {
    const previousCounter = this.localLineage.renewalCounter;
    const freshNonce = randomUUID();
    try {
      await this.prisma.licenseInstallation.update({
        where: { id: "system" },
        data: {
          renewalCounter: payload.renewalCounter,
          nonce: freshNonce,
          lastRenewalAt: this.clock(),
        },
      });
    } catch (err) {
      // Sin BD no se rota: ROTATE es re-aplicable en la próxima evaluación.
      this.logger.error(`No se pudo rotar el linaje local: ${String(err)}`);
      return;
    }
    this.localLineage = { renewalCounter: payload.renewalCounter, nonce: freshNonce };
    this.logger.log(
      `Renovación importada: linaje rotado (counter ${previousCounter} → ` +
        `${payload.renewalCounter}). La respuesta ya no es importable en otra instalación.`,
    );
    // El nonce JAMÁS se audita ni se expone (mínimo privilegio, decisión L2c).
    await this.audit.record({
      action: "license.renewed",
      actorEmail: "system@license",
      entityType: "LicenseInstallation",
      entityId: this.installationId,
      before: { renewalCounter: previousCounter },
      after: {
        renewalCounter: payload.renewalCounter,
        licenseId: payload.licenseId,
        expiresAt: payload.expiresAt,
      },
    });
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

  /**
   * Mientras exista una licencia verificada, deja/refresca `renovacion.lreq`
   * junto a ella (L4, runbook §4): la mitad "challenge" de la renovación por
   * archivos. Presenta el LINAJE local vigente (counter + nonce) + huella +
   * licenseId — el emisor lo contrasta con su ledger (clon = linaje repetido).
   * Se escribe SIEMPRE que haya payload (decisión (a) L4): así un upgrade a
   * mitad de ciclo usa la misma ceremonia. Idempotente entre re-evaluaciones
   * (solo reescribe si cambió algo más que la fecha). Nunca lanza.
   */
  private async writeRenewalRequest(licenseId: string): Promise<void> {
    try {
      if (this.localLineage.nonce === null) {
        // Primer uso del linaje (instalaciones activadas antes de L4): se
        // inicializa el nonce local de forma perezosa y se persiste.
        const nonce = randomUUID();
        await this.prisma.licenseInstallation.update({
          where: { id: "system" },
          data: { nonce },
        });
        this.localLineage = { ...this.localLineage, nonce };
      }
      const path = join(dirname(this.licenseFilePath()), RENEWAL_REQUEST_FILE_NAME);
      const body = {
        product: "lyra-watchlog",
        schemaVersion: 1,
        type: "renewal" as const,
        installationId: this.installationId,
        fingerprint: this.fingerprint,
        licenseId,
        renewalCounter: this.localLineage.renewalCounter,
        nonce: this.localLineage.nonce,
        generatedAt: this.clock().toISOString(),
      };
      try {
        const existing = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        const unchanged =
          existing.installationId === body.installationId &&
          existing.fingerprint === body.fingerprint &&
          existing.licenseId === body.licenseId &&
          existing.renewalCounter === body.renewalCounter &&
          existing.nonce === body.nonce;
        if (unchanged) return;
      } catch {
        // no existe o ilegible: se escribe abajo
      }
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify(body, null, 2), "utf8");
      this.logger.log(
        `Solicitud de renovación escrita en ${path} (linaje counter=${body.renewalCounter}).`,
      );
    } catch (err) {
      this.logger.error(`No se pudo escribir la solicitud de renovación: ${String(err)}`);
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
