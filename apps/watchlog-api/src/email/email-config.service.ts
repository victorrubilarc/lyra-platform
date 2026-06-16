import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { EmailConfigDto, UpdateEmailConfigRequest } from "@lyra/contracts";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../crypto/encryption.service";

const SETTINGS_ID = "system";

/** Config RESUELTA para enviar (incluye la contraseña en claro y el `from` armado). */
export interface ResolvedEmailConfig {
  enabled: boolean;
  /** Atajo well-known de nodemailer; si está, se ignoran host/port. */
  service: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
  /** Firma del TRANSPORTE: invalida el transporter cacheado cuando cambia algo. */
  signature: string;
}

/**
 * Configuración del correo saliente persistida en BD (`SystemSettings`), editable
 * desde `/configuracion` sin reiniciar la API. El `.env` (SMTP_*) es el FALLBACK de
 * arranque. La contraseña SMTP va **cifrada en reposo** (`EncryptionService`) y es
 * **write-only** (nunca vuelve a la UI). La config es "toda BD" o "toda env" según
 * `emailConfiguredAt` (evita la ambigüedad de booleanos no-nulos por campo); la
 * contraseña sí cae al env si la BD no tiene una (útil en dev con Mailpit sin clave).
 */
@Injectable()
export class EmailConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Defaults desde el `.env` (compat / bootstrap). */
  private envDefaults() {
    const fromRaw = this.config.get("SMTP_FROM", { infer: true }) ?? "";
    const m = fromRaw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
    const fromName = m ? (m[1] ?? "") : "";
    const fromEmail = m ? (m[2] ?? "") : fromRaw.trim();
    const host = this.config.get("SMTP_HOST", { infer: true }) ?? "";
    return {
      enabled: !!host,
      service: "",
      host,
      port: this.config.get("SMTP_PORT", { infer: true }) ?? 587,
      secure: this.config.get("SMTP_SECURE", { infer: true }) ?? false,
      user: this.config.get("SMTP_USER", { infer: true }) ?? "",
      password: this.config.get("SMTP_PASSWORD", { infer: true }) ?? "",
      fromName,
      fromEmail,
    };
  }

  private async row() {
    return this.prisma.systemSettings.findUnique({ where: { id: SETTINGS_ID } });
  }

  private composeFrom(name: string, email: string, fallback: string): string {
    if (!email) return fallback;
    return name ? `${name} <${email}>` : email;
  }

  /** Config PÚBLICA (sin contraseña) para la UI. */
  async getPublic(): Promise<EmailConfigDto> {
    const s = await this.row();
    const d = this.envDefaults();
    const fromDb = !!s?.emailConfiguredAt;
    const passwordSet = fromDb ? !!s?.emailPasswordEnc || !!d.password : !!d.password;
    if (!fromDb) {
      return {
        enabled: d.enabled,
        service: d.service,
        host: d.host,
        port: d.port,
        secure: d.secure,
        user: d.user,
        fromName: d.fromName,
        fromEmail: d.fromEmail,
        passwordSet,
        source: "env",
      };
    }
    return {
      enabled: s!.emailEnabled,
      service: s!.emailService ?? "",
      host: s!.emailHost ?? "",
      port: s!.emailPort ?? 587,
      secure: s!.emailSecure,
      user: s!.emailUser ?? "",
      fromName: s!.emailFromName ?? "",
      fromEmail: s!.emailFromEmail ?? "",
      passwordSet,
      source: "db",
    };
  }

  /** Config RESUELTA para enviar (uso interno del `SmtpEmailService`). */
  async getResolved(): Promise<ResolvedEmailConfig> {
    const s = await this.row();
    const d = this.envDefaults();
    if (!s?.emailConfiguredAt) {
      return {
        enabled: d.enabled,
        service: d.service,
        host: d.host,
        port: d.port,
        secure: d.secure,
        user: d.user,
        password: d.password,
        from: this.composeFrom(d.fromName, d.fromEmail, d.fromEmail || "no-reply@watchlog.local"),
        signature: `env|${d.service}|${d.host}|${d.port}|${d.secure}|${d.user}`,
      };
    }
    const password = s.emailPasswordEnc ? this.enc.decrypt(s.emailPasswordEnc) : d.password;
    const service = s.emailService ?? "";
    const host = s.emailHost ?? "";
    const port = s.emailPort ?? 587;
    return {
      enabled: s.emailEnabled,
      service,
      host,
      port,
      secure: s.emailSecure,
      user: s.emailUser ?? "",
      password,
      from: this.composeFrom(s.emailFromName ?? "", s.emailFromEmail ?? "", d.fromEmail || "no-reply@watchlog.local"),
      signature: `db|${s.updatedAt.toISOString()}|${service}|${host}|${port}|${s.emailSecure}|${s.emailUser ?? ""}`,
    };
  }

  /** ¿El correo está activado? (lo usa el sender para suprimir en vez de fallar). */
  async isEnabled(): Promise<boolean> {
    return (await this.getResolved()).enabled;
  }

  /** Resuelve una config a partir del payload de la UI (para PROBAR sin guardar). */
  async resolveFrom(dto: UpdateEmailConfigRequest): Promise<ResolvedEmailConfig> {
    const s = await this.row();
    const d = this.envDefaults();
    const stored = s?.emailPasswordEnc ? this.enc.decrypt(s.emailPasswordEnc) : d.password;
    const password = dto.password && dto.password.trim() ? dto.password.trim() : stored;
    const service = (dto.service ?? "").trim();
    const host = (dto.host ?? "").trim();
    return {
      enabled: dto.enabled,
      service,
      host,
      port: dto.port,
      secure: dto.secure,
      user: (dto.user ?? "").trim(),
      password,
      from: this.composeFrom((dto.fromName ?? "").trim(), (dto.fromEmail ?? "").trim(), d.fromEmail || "no-reply@watchlog.local"),
      signature: `test|${service}|${host}|${dto.port}|${dto.secure}`,
    };
  }

  /** Guarda la config; la contraseña SOLO se persiste (cifrada) si viene con valor. */
  async set(dto: UpdateEmailConfigRequest, userId: string): Promise<EmailConfigDto> {
    const data = {
      emailEnabled: dto.enabled,
      emailService: (dto.service ?? "").trim() || null,
      emailHost: (dto.host ?? "").trim() || null,
      emailPort: dto.port,
      emailSecure: dto.secure,
      emailUser: (dto.user ?? "").trim() || null,
      emailFromName: (dto.fromName ?? "").trim() || null,
      emailFromEmail: (dto.fromEmail ?? "").trim() || null,
      emailConfiguredAt: new Date(),
      emailConfiguredById: userId,
      ...(dto.password && dto.password.trim()
        ? { emailPasswordEnc: this.enc.encrypt(dto.password.trim()) }
        : {}),
    };
    await this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });
    return this.getPublic();
  }
}
