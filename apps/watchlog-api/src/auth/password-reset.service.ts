import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { randomBytes } from "node:crypto";
import type { Env } from "../config/env.schema";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { CacheService } from "../redis/cache.service";
import { EncryptionService } from "../crypto/encryption.service";
import { EmailService } from "../email/email.service";
import { buildPasswordChangedEmail, buildResetEmail } from "../email/email.templates";
import { PasswordService } from "../crypto/password.service";
import { PrismaService } from "../prisma/prisma.service";
import { PasswordPolicyService } from "./password-policy.service";
import { TokenService, type RequestMeta } from "./token.service";

/**
 * Ventana y topes del rate-limit del "olvidé mi contraseña". Acota el abuso
 * (spam de correos, sondeo) sin revelar nada al cliente: superar el tope NO
 * cambia la respuesta neutra, solo evita el envío.
 */
const THROTTLE_WINDOW_SECONDS = 15 * 60;
const MAX_REQUESTS_PER_EMAIL = 5;
const MAX_REQUESTS_PER_IP = 20;

/** Mensaje genérico de fallo: no distingue token inexistente/expirado/usado. */
const INVALID_TOKEN = "El enlace de restablecimiento es inválido o ha expirado.";

/**
 * Recuperación de contraseña self-service (NIST 800-63B, OWASP ASVS §2.5).
 *
 * - Solicitud (`requestReset`): SIEMPRE responde de forma neutra (sin enumeración
 *   de usuarios) y con tiempo ~constante (el envío de correo se hace en segundo
 *   plano). Rate-limit por correo y por IP.
 * - Restablecimiento (`resetPassword`): token de un solo uso, hasheado y con TTL
 *   corto; aplica la política de contraseñas; invalida el resto de tokens; revoca
 *   TODAS las sesiones; limpia el lockout; notifica el cambio. NO toca el MFA.
 */
@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService,
    private readonly passwords: PasswordService,
    private readonly policy: PasswordPolicyService,
    private readonly tokens: TokenService,
    private readonly email: EmailService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get ttlSeconds(): number {
    return this.config.get("PASSWORD_RESET_TTL", { infer: true });
  }

  // -------------------------------------------------------------------------
  //  Solicitud de restablecimiento (respuesta neutra)
  // -------------------------------------------------------------------------

  /**
   * Inicia el flujo. Devuelve siempre `void` (el controlador responde neutro).
   * Solo genera token y envía correo si el usuario existe, está activo y tiene
   * contraseña local; en cualquier otro caso la respuesta es idéntica.
   */
  async requestReset(emailRaw: string, meta: RequestMeta): Promise<void> {
    const email = emailRaw.trim().toLowerCase();
    const ctx: AuditContext = { actorEmail: email, ip: meta.ip, userAgent: meta.userAgent };

    const allowed = await this.withinRateLimit(email, meta.ip ?? null);
    if (!allowed) {
      await this.audit.record({ ...ctx, action: "auth.password.reset_throttled" });
      return; // respuesta neutra: no se revela el throttle
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    // Elegible: existe, no deshabilitado y con contraseña local (no solo-OIDC).
    const eligible = !!user && user.status !== "DISABLED" && !!user.passwordHash;
    await this.audit.record({
      ...ctx,
      actorId: user?.id ?? null,
      action: "auth.password.reset_requested",
      metadata: { delivered: eligible },
    });
    if (!user || !eligible) return;

    // Un solo enlace válido a la vez: invalida los pendientes y crea uno nuevo.
    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = this.enc.sha256(rawToken);
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + this.ttlSeconds * 1000),
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
      }),
    ]);

    // Envío en segundo plano: iguala el tiempo de respuesta (anti-enumeración por
    // timing) y mantiene el endpoint ágil. (Una cola tipo BullMQ llega en Fase 3+.)
    const resetUrl = this.buildResetUrl(rawToken);
    void this.sendSafe(
      buildResetEmail({ to: user.email, resetUrl, ttlMinutes: Math.round(this.ttlSeconds / 60) }),
    );
  }

  // -------------------------------------------------------------------------
  //  Restablecimiento con token
  // -------------------------------------------------------------------------

  async resetPassword(rawToken: string, newPassword: string, meta: RequestMeta): Promise<void> {
    const ctx: AuditContext = { ip: meta.ip, userAgent: meta.userAgent };
    const tokenHash = this.enc.sha256(rawToken);
    const token = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!token || token.usedAt || token.expiresAt < new Date()) {
      await this.audit.record({
        ...ctx,
        actorId: token?.userId ?? null,
        action: "auth.password.reset_failed",
        metadata: { reason: !token ? "unknown" : token.usedAt ? "used" : "expired" },
      });
      throw new BadRequestException(INVALID_TOKEN);
    }

    const user = token.user;
    if (user.status === "DISABLED" || !user.passwordHash) {
      await this.audit.record({
        ...ctx,
        actorId: user.id,
        actorEmail: user.email,
        action: "auth.password.reset_failed",
        metadata: { reason: "ineligible" },
      });
      throw new BadRequestException(INVALID_TOKEN);
    }

    // La política real (longitud, complejidad, historial) se impone aquí.
    await this.policy.assertComplexity(newPassword);
    await this.policy.assertNotReused(user.id, newPassword);

    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          forcePasswordChange: false,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      }),
      // Sella este token y cualquier otro pendiente del usuario (single-use).
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordHistory.create({ data: { userId: user.id, passwordHash } }),
    ]);

    // Recuperación de un posible compromiso: fuera todas las sesiones vigentes.
    await this.tokens.revokeAllForUser(user.id);

    await this.audit.record({
      ...ctx,
      actorId: user.id,
      actorEmail: user.email,
      action: "auth.password.reset_completed",
    });

    // Notificación de seguridad (en segundo plano).
    void this.sendSafe(buildPasswordChangedEmail({ to: user.email }));
  }

  /**
   * Invalida los tokens de reset pendientes de un usuario. Se llama cuando la
   * contraseña cambia por otra vía (cambio propio), para que ningún enlace
   * emitido antes siga siendo válido.
   */
  async invalidatePending(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: { userId, usedAt: null },
      data: { usedAt: new Date() },
    });
  }

  // -------------------------------------------------------------------------
  //  Helpers
  // -------------------------------------------------------------------------

  private buildResetUrl(rawToken: string): string {
    const base = this.config.get("APP_PUBLIC_URL", { infer: true }).replace(/\/+$/, "");
    return `${base}/restablecer-contrasena?token=${encodeURIComponent(rawToken)}`;
  }

  /** Envía sin propagar errores: un fallo de correo no debe romper el flujo. */
  private async sendSafe(message: Parameters<EmailService["send"]>[0]): Promise<void> {
    try {
      await this.email.send(message);
    } catch (err) {
      this.logger.error(
        `No se pudo enviar el correo "${message.subject}"`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Rate-limit best-effort por correo y por IP (contadores en caché con TTL). */
  private async withinRateLimit(email: string, ip: string | null): Promise<boolean> {
    const emailOk = await this.hit(
      `pwreset:email:${this.enc.sha256(email)}`,
      MAX_REQUESTS_PER_EMAIL,
    );
    const ipOk = ip ? await this.hit(`pwreset:ip:${ip}`, MAX_REQUESTS_PER_IP) : true;
    return emailOk && ipOk;
  }

  private async hit(key: string, max: number): Promise<boolean> {
    const current = Number((await this.cache.get(key)) ?? "0");
    if (current >= max) return false;
    await this.cache.set(key, String(current + 1), THROTTLE_WINDOW_SECONDS);
    return true;
  }
}
