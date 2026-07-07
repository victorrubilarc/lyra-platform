import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import {
  THEME_PRESETS,
  type SetupContextDto,
  type SetupFinalizeRequest,
  type SetupFinalizeResponse,
  type SetupLicenseImportRequest,
  type SetupLicenseImportResponse,
  type SetupStatusDto,
} from "@lyra/contracts";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { PasswordService } from "../crypto/password.service";
import { PasswordPolicyService } from "../auth/password-policy.service";
import { LicenseService } from "../licensing/license.service";
import { BrandingService, type LogoUpload } from "../branding/branding.service";
import { isValidTimezone } from "../common/timezone";

const SETUP_ID = "system";
const ADMIN_ROLE_KEY = "admin";
/** Archivo del token, junto a la licencia (el implementador ya trabaja ahí). */
const TOKEN_FILE_NAME = "setup-token";
/** Lockout de intentos de token (patrón del login: 5 intentos / 15 min). */
const MAX_TOKEN_ATTEMPTS = 5;
const TOKEN_LOCK_MINUTES = 15;

/** Metadatos de la request para auditoría (no hay usuario JWT en el setup). */
export interface SetupRequestMeta {
  ip?: string;
  userAgent?: string;
}

/**
 * ASISTENTE DE PRIMER ARRANQUE (OOBE S1, BACKLOG §2(5)). Una instalación
 * VIRGEN (`SystemSetup.setupCompleted=false`, fila creada por la migración con
 * retro-completado para instalaciones existentes) se configura por `/setup`:
 * sin JWT (no hay usuarios todavía) pero con un TOKEN DE INSTALACIÓN de un
 * solo uso que este servicio emite al arrancar y deja en
 * `<carpeta de licencia>/setup-token` (decisión (a) 2026-07-06: archivo, no
 * log — el log solo anuncia la RUTA). Del token solo se persiste el hash
 * SHA-256; al finalizar, el archivo se borra y el hash se anula: un residuo
 * es inerte. Intentos fallidos se bloquean (5 / 15 min, patrón del login).
 *
 * Al completar, los endpoints (salvo `status`) responden 404 — no se revela
 * ni que el módulo existe. La finalización es ATÓMICA (una transacción).
 */
@Injectable()
export class SetupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SetupService.name);

  /** Reloj inyectable (tests); en runtime, la hora real. */
  clock: () => Date = () => new Date();

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly passwords: PasswordService,
    private readonly passwordPolicy: PasswordPolicyService,
    private readonly license: LicenseService,
    private readonly branding: BrandingService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const row = await this.ensureRow();
    if (row.setupCompleted) {
      // Instalación ya configurada: si quedó un token en disco (proceso
      // interrumpido), se retira — nunca debe sobrevivir un token huérfano.
      await this.deleteTokenFile();
      return;
    }
    await this.ensureToken(row.tokenHash);
  }

  // --- API pública (controller) ----------------------------------------------

  /** Estado público MÍNIMO: un booleano, nada más se filtra a anónimos. */
  async status(): Promise<SetupStatusDto> {
    const row = await this.ensureRow();
    return { setupRequired: !row.setupCompleted };
  }

  /** Contexto del wizard (token válido): política + identidad de licencia. */
  async context(token: string | undefined): Promise<SetupContextDto> {
    await this.assertToken(token);
    const policy = await this.passwordPolicy.getPolicy();
    const snap = this.license.getEvaluation();
    const hasActivationRequest = (await this.license.readActivationRequest()) !== undefined;
    return {
      passwordPolicy: {
        minLength: policy.minLength,
        requireUppercase: policy.requireUppercase,
        requireNumber: policy.requireNumber,
        requireSymbol: policy.requireSymbol,
      },
      license: {
        status: snap.status,
        installationId: snap.installationId,
        fingerprint: snap.fingerprint,
        customer: snap.customer,
        hasActivationRequest,
      },
    };
  }

  /** Contenido de `solicitud.lreq` para descarga (ceremonia runbook §2). */
  async activationRequest(token: string | undefined): Promise<string> {
    await this.assertToken(token);
    const content = await this.license.readActivationRequest();
    if (content === undefined) {
      throw new NotFoundException(
        "La solicitud de activación aún no está disponible (la genera la API al arrancar sin licencia).",
      );
    }
    return content;
  }

  /**
   * Importa `license.lic` desde el wizard (decisión 2026-07-06: reabre L6b
   * SOLO para el setup). La verificación completa (firma/huella/linaje) la
   * hace `LicenseService.importLicenseFile` ANTES de persistir.
   */
  async importLicense(
    token: string | undefined,
    dto: SetupLicenseImportRequest,
    meta: SetupRequestMeta,
  ): Promise<SetupLicenseImportResponse> {
    await this.assertToken(token);
    const result = await this.license.importLicenseFile(dto.content);
    if (!result.ok) {
      throw new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        code: "SETUP_LICENSE_REJECTED",
        reason: result.reason,
        message:
          "El archivo de licencia fue rechazado: la firma, la huella de esta máquina o el " +
          "linaje no calzan. Verifica que sea el license.lic emitido para ESTA instalación.",
      });
    }
    await this.audit.record({
      action: "license.imported",
      actorEmail: "system@setup",
      entityType: "LicenseInstallation",
      entityId: result.snapshot.installationId,
      after: { status: result.snapshot.status, licenseId: result.snapshot.licenseId ?? null },
      metadata: { source: "setup-wizard" },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { status: result.snapshot.status, customer: result.snapshot.customer };
  }

  /**
   * Logo de la empresa desde el wizard (OOBE S3, paso Identidad). Reusa el
   * MISMO servicio (validación magic bytes + tope + auditoría) que la edición
   * post-setup; el candado aquí es el token de instalación. Se persiste de
   * inmediato en el singleton `SystemSettings`: en una instalación virgen es
   * inocuo y `finalize` no lo pisa (no toca las columnas del logo).
   */
  async uploadLogo(token: string | undefined, upload: LogoUpload, meta: SetupRequestMeta): Promise<void> {
    await this.assertToken(token);
    await this.branding.setLogo(upload, { email: "system@setup", ip: meta.ip, userAgent: meta.userAgent });
  }

  /** Quita el logo subido durante el wizard (mismo candado de token). */
  async removeLogo(token: string | undefined, meta: SetupRequestMeta): Promise<void> {
    await this.assertToken(token);
    await this.branding.removeLogo({ email: "system@setup", ip: meta.ip, userAgent: meta.userAgent });
  }

  /**
   * Finalización ATÓMICA: crea el administrador REAL (política de contraseñas
   * aplicada), guarda identidad/apariencia, marca `setupCompleted` e invalida
   * el token — todo en UNA transacción; después borra el archivo del token y
   * audita `system.setup.completed`.
   */
  async finalize(
    token: string | undefined,
    dto: SetupFinalizeRequest,
    meta: SetupRequestMeta,
  ): Promise<SetupFinalizeResponse> {
    await this.assertToken(token);
    await this.passwordPolicy.assertComplexity(dto.admin.password);

    const timezone = dto.identity?.timezone;
    if (timezone !== undefined && !isValidTimezone(timezone)) {
      throw new BadRequestException(`Zona horaria desconocida: "${timezone}".`);
    }
    const preset =
      dto.appearance?.presetId !== undefined
        ? THEME_PRESETS.find((p) => p.id === dto.appearance?.presetId)
        : undefined;
    if (dto.appearance?.presetId !== undefined && preset === undefined) {
      throw new BadRequestException(`Plantilla de tema desconocida: "${dto.appearance.presetId}".`);
    }

    const email = dto.admin.email; // ya normalizado (trim+lowercase) por el esquema
    const passwordHash = await this.passwords.hash(dto.admin.password);

    const admin = await this.prisma.$transaction(async (tx) => {
      // Candado dentro de la transacción: dos finalize concurrentes no crean
      // dos admins — el segundo ve setupCompleted=true y muere en 404.
      const row = await tx.systemSetup.findUnique({ where: { id: SETUP_ID } });
      if (!row || row.setupCompleted) throw new NotFoundException();

      const role = await tx.role.findUnique({ where: { key: ADMIN_ROLE_KEY } });
      if (!role) {
        // El seed de catálogo corre en el init-container ANTES de la API; si
        // falta, la instalación está a medio desplegar — error claro, no críptico.
        throw new ConflictException(
          "El catálogo base no está sembrado (falta el rol Administrador). Ejecuta las migraciones/seed del despliegue.",
        );
      }
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) throw new ConflictException(`Ya existe un usuario con el correo ${email}.`);

      const user = await tx.user.create({
        data: {
          email,
          displayName: dto.admin.displayName,
          passwordHash,
          // Eligió su contraseña recién: no se fuerza a cambiarla (a diferencia
          // del viejo admin de arranque por .env, cuyo secreto venía de terceros).
          forcePasswordChange: false,
          roles: { create: { roleId: role.id } },
        },
      });
      await tx.passwordHistory.create({ data: { userId: user.id, passwordHash } });

      if (dto.requireMfaForAdmins === true) {
        await tx.role.update({ where: { id: role.id }, data: { requireMfa: true } });
        // `requireMfa` solo se honra con mfaMode=REQUIRED_BY_ROLE: si la política
        // está en el piso OPTIONAL se sube; REQUIRED_FOR_ALL (más estricta) se respeta.
        const policy = await tx.passwordPolicy.findUnique({ where: { id: "singleton" } });
        if (!policy || policy.mfaMode === "OPTIONAL") {
          await tx.passwordPolicy.upsert({
            where: { id: "singleton" },
            create: { id: "singleton", mfaMode: "REQUIRED_BY_ROLE" },
            update: { mfaMode: "REQUIRED_BY_ROLE" },
          });
        }
      }

      // Apariencia: el preset curado se materializa como paleta PUBLICADA y por
      // defecto de la instalación (tokens resueltos por el SERVIDOR desde el
      // catálogo de @lyra/contracts — el cliente no manda colores en el setup).
      let paletteId: string | undefined;
      if (preset) {
        const palette = await tx.themePalette.create({
          data: {
            name: preset.name,
            description: preset.description,
            tokensDark: preset.tokensDark as unknown as Prisma.InputJsonValue,
            tokensLight: preset.tokensLight as unknown as Prisma.InputJsonValue,
            isPublished: true,
            createdById: user.id,
            updatedById: user.id,
          },
        });
        paletteId = palette.id;
      }

      const settings = {
        companyDisplayName: dto.identity?.companyDisplayName,
        defaultTimezone: timezone,
        defaultLocale: dto.identity?.locale,
        defaultThemeMode: dto.appearance?.themeMode,
        defaultPaletteId: paletteId,
        updatedById: user.id,
      };
      await tx.systemSettings.upsert({
        where: { id: SETUP_ID },
        create: { id: SETUP_ID, ...settings },
        update: settings,
      });

      await tx.systemSetup.update({
        where: { id: SETUP_ID },
        data: {
          setupCompleted: true,
          completedAt: this.clock(),
          tokenHash: null,
          tokenFailedCount: 0,
          tokenLockedUntil: null,
        },
      });
      return user;
    });

    // Fuera de la transacción: limpieza + rastro. El token en disco muere aquí.
    await this.deleteTokenFile();
    await this.audit.record({
      action: "system.setup.completed",
      actorId: admin.id,
      actorEmail: admin.email,
      entityType: "SystemSetup",
      entityId: SETUP_ID,
      after: {
        adminEmail: admin.email,
        companyDisplayName: dto.identity?.companyDisplayName ?? null,
        timezone: timezone ?? null,
        locale: dto.identity?.locale ?? null,
        themeMode: dto.appearance?.themeMode ?? null,
        themePreset: preset?.id ?? null,
        requireMfaForAdmins: dto.requireMfaForAdmins === true,
      },
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    this.logger.log(
      `Primer arranque completado: administrador ${admin.email} creado. El asistente no volverá a aparecer.`,
    );
    return { ok: true, adminEmail: admin.email };
  }

  // --- internos ----------------------------------------------------------------

  /**
   * Fila singleton. La migración la crea con retro-completado; el upsert es el
   * cinturón para BDs anómalas y usa el MISMO criterio (usuarios ⇒ completado):
   * una instalación con gente adentro jamás re-expone el setup.
   */
  private async ensureRow(): Promise<{ setupCompleted: boolean; tokenHash: string | null }> {
    const row = await this.prisma.systemSetup.findUnique({ where: { id: SETUP_ID } });
    if (row) return row;
    const users = await this.prisma.user.count();
    return this.prisma.systemSetup.upsert({
      where: { id: SETUP_ID },
      update: {},
      create: {
        id: SETUP_ID,
        setupCompleted: users > 0,
        completedAt: users > 0 ? this.clock() : null,
      },
    });
  }

  /**
   * Garantiza que exista un token utilizable: sin hash ⇒ se emite; con hash
   * pero sin archivo (el implementador lo perdió / volumen nuevo) ⇒ se REEMITE
   * (el hash anterior queda obsoleto — sigue habiendo UN solo token vigente).
   */
  private async ensureToken(currentHash: string | null): Promise<void> {
    const path = this.tokenFilePath();
    if (currentHash !== null) {
      try {
        await access(path);
        this.logger.warn(
          `Instalación pendiente de configuración inicial: token de instalación en ${path}. ` +
            "Abre la web para ejecutar el asistente de primer arranque.",
        );
        return;
      } catch {
        this.logger.warn("El archivo del token de instalación no está: se emite uno nuevo.");
      }
    }
    const token = randomBytes(32).toString("hex");
    await this.prisma.systemSetup.update({
      where: { id: SETUP_ID },
      data: { tokenHash: sha256(token), tokenFailedCount: 0, tokenLockedUntil: null },
    });
    await mkdir(dirname(path), { recursive: true });
    // El token NUNCA se imprime en el log (puede rotar/centralizarse): solo la ruta.
    await writeFile(path, `${token}\n`, { encoding: "utf8", mode: 0o600 });
    this.logger.warn(
      `Instalación virgen: token de instalación de UN SOLO USO escrito en ${path}. ` +
        "Abre la web para ejecutar el asistente de primer arranque.",
    );
  }

  /**
   * Valida el token con lockout persistente (5 intentos / 15 min, patrón del
   * login). Comparación de hashes en tiempo constante. Con el setup completado
   * responde 404 (no se revela que el módulo existió).
   */
  private async assertToken(raw: string | undefined): Promise<void> {
    const row = await this.prisma.systemSetup.findUnique({ where: { id: SETUP_ID } });
    if (!row || row.setupCompleted) throw new NotFoundException();

    const now = this.clock();
    if (row.tokenLockedUntil && row.tokenLockedUntil > now) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "Forbidden",
        code: "SETUP_TOKEN_LOCKED",
        message: "Demasiados intentos con token inválido. Espera unos minutos y reintenta.",
      });
    }

    const provided = raw?.trim() ?? "";
    const expected = row.tokenHash;
    const valid =
      provided.length > 0 &&
      expected !== null &&
      timingSafeEqual(Buffer.from(sha256(provided), "hex"), Buffer.from(expected, "hex"));

    if (!valid) {
      const failures = row.tokenFailedCount + 1;
      await this.prisma.systemSetup.update({
        where: { id: SETUP_ID },
        data: {
          tokenFailedCount: failures,
          tokenLockedUntil:
            failures >= MAX_TOKEN_ATTEMPTS
              ? new Date(now.getTime() + TOKEN_LOCK_MINUTES * 60_000)
              : null,
        },
      });
      throw new ForbiddenException({
        statusCode: 403,
        error: "Forbidden",
        code: "SETUP_TOKEN_INVALID",
        message:
          "Token de instalación inválido. Está en el archivo setup-token de la carpeta de licencia del despliegue.",
      });
    }

    if (row.tokenFailedCount > 0 || row.tokenLockedUntil !== null) {
      await this.prisma.systemSetup.update({
        where: { id: SETUP_ID },
        data: { tokenFailedCount: 0, tokenLockedUntil: null },
      });
    }
  }

  private tokenFilePath(): string {
    return join(dirname(this.config.get("LICENSE_FILE", { infer: true })), TOKEN_FILE_NAME);
  }

  private async deleteTokenFile(): Promise<void> {
    try {
      await rm(this.tokenFilePath(), { force: true });
    } catch (err) {
      // No bloquea el flujo: el hash en BD ya quedó anulado (el archivo es inerte).
      this.logger.error(`No se pudo borrar el archivo del token de instalación: ${String(err)}`);
    }
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
