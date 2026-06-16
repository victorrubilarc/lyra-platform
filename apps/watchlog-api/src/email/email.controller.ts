import { Body, Controller, Get, HttpCode, Post, Put, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  testEmailRequestSchema,
  updateEmailConfigRequestSchema,
  type EmailTestResult,
  type TestEmailRequest,
  type UpdateEmailConfigRequest,
} from "@lyra/contracts";
import { AuditService } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EmailConfigService } from "./email-config.service";
import { SmtpEmailService } from "./smtp-email.service";

/**
 * Configuración del correo saliente (SMTP) — pantalla de `/configuracion`, permiso
 * `notification:config`. La contraseña es write-only (la respuesta nunca la incluye)
 * y se guarda cifrada. "Probar conexión/envío" usan los valores del formulario sin
 * guardarlos; auditado sin registrar la contraseña.
 */
@Controller("settings/email")
export class EmailController {
  constructor(
    private readonly config: EmailConfigService,
    private readonly smtp: SmtpEmailService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission("notification:config")
  get() {
    return this.config.getPublic();
  }

  @Put()
  @RequirePermission("notification:config")
  async save(
    @Body(new ZodValidationPipe(updateEmailConfigRequestSchema)) dto: UpdateEmailConfigRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    const saved = await this.config.set(dto, user.id);
    await this.audit.record({
      actorId: user.id,
      actorEmail: user.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      action: "email.config.updated",
      entityType: "SystemSettings",
      entityId: "system",
      // Nunca se registra la contraseña.
      after: { enabled: saved.enabled, service: saved.service, host: saved.host, port: saved.port, user: saved.user, fromEmail: saved.fromEmail },
    });
    return saved;
  }

  /** Probar la CONEXIÓN (verify, sin enviar) con los valores del formulario. */
  @Post("verify")
  @HttpCode(200)
  @RequirePermission("notification:config")
  async verify(
    @Body(new ZodValidationPipe(updateEmailConfigRequestSchema)) dto: UpdateEmailConfigRequest,
  ): Promise<EmailTestResult> {
    try {
      await this.smtp.verify(await this.config.resolveFrom(dto));
      return { ok: true, error: null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "No se pudo conectar al servidor SMTP." };
    }
  }

  /** Enviar un correo de PRUEBA con los valores del formulario (sin guardarlos). */
  @Post("test")
  @HttpCode(200)
  @RequirePermission("notification:config")
  async test(
    @Body(new ZodValidationPipe(testEmailRequestSchema)) dto: TestEmailRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<EmailTestResult> {
    const resolved = await this.config.resolveFrom(dto);
    await this.audit.record({
      actorId: user.id,
      actorEmail: user.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      action: "email.config.tested",
      entityType: "SystemSettings",
      entityId: "system",
      after: { to: dto.to, host: resolved.host, service: resolved.service },
    });
    try {
      await this.smtp.sendWith(resolved, buildTestEmail(dto.to));
      return { ok: true, error: null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "No se pudo enviar el correo de prueba." };
    }
  }
}

/** Correo de prueba de configuración (premium sobrio, estilos inline). */
function buildTestEmail(to: string) {
  return {
    to,
    subject: "Lyra WatchLog — correo de prueba",
    text: "Este es un correo de prueba de Lyra WatchLog. Si lo recibiste, la configuración del servidor de correo saliente funciona.",
    html: `<!doctype html><html><body style="margin:0;background:#F3F4F6;font-family:Inter,Arial,sans-serif;padding:24px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #E5E7EB">
          <tr><td style="background:linear-gradient(135deg,#6366F1,#06B6D4);padding:18px 24px;color:#fff;font-weight:700">Lyra WatchLog</td></tr>
          <tr><td style="padding:24px;color:#374151;font-size:14px;line-height:1.6">
            <h1 style="margin:0 0 8px;font-size:18px;color:#0C1124">Correo de prueba ✓</h1>
            Si estás leyendo esto, la configuración del <strong>servidor de correo saliente</strong> de Lyra WatchLog funciona correctamente.
          </td></tr>
        </table>
      </td></tr></table></body></html>`,
  };
}
