import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { EmailService, type EmailMessage } from "./email.service";
import { EmailConfigService, type ResolvedEmailConfig } from "./email-config.service";

/**
 * Implementación SMTP de `EmailService` (nodemailer). La config del transporte se
 * resuelve desde BD (`EmailConfigService`) con `.env` como fallback, y se aplica
 * **sin reiniciar**: el transporter se cachea por la FIRMA del transporte y se
 * recrea solo cuando algo cambia. En dev se usa Mailpit (localhost:1025).
 *
 * Si el correo está DESACTIVADO, `send()` no envía (no rompe el flujo; el worker de
 * notificaciones consulta `EmailConfigService.isEnabled()` aparte para SUPRIMIR).
 */
@Injectable()
export class SmtpEmailService extends EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(SmtpEmailService.name);
  private transporter: Transporter | null = null;
  private signature = "";

  constructor(private readonly config: EmailConfigService) {
    super();
  }

  /** Construye un transporter a partir de una config resuelta (transient o cacheado). */
  private buildTransport(c: ResolvedEmailConfig): Transporter {
    const auth = c.user && c.password ? { user: c.user, pass: c.password } : undefined;
    if (c.service) return createTransport({ service: c.service, auth });
    return createTransport({ host: c.host, port: c.port, secure: c.secure, auth });
  }

  /** Transporter vigente (cacheado por firma; se recrea al cambiar el transporte). */
  private async getTransporter(): Promise<{ transporter: Transporter; resolved: ResolvedEmailConfig }> {
    const resolved = await this.config.getResolved();
    if (!this.transporter || this.signature !== resolved.signature) {
      this.transporter?.close();
      this.transporter = this.buildTransport(resolved);
      this.signature = resolved.signature;
    }
    return { transporter: this.transporter, resolved };
  }

  async send(message: EmailMessage): Promise<void> {
    const { transporter, resolved } = await this.getTransporter();
    if (!resolved.enabled) {
      this.logger.debug(`Correo DESACTIVADO: no se envía "${message.subject}" a ${message.to}`);
      return;
    }
    await transporter.sendMail({
      from: resolved.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    this.logger.debug(`Correo enviado a ${message.to}: "${message.subject}"`);
  }

  /** Envía con una config ARBITRARIA, con un transporter transitorio (probar sin guardar). */
  async sendWith(resolved: ResolvedEmailConfig, message: EmailMessage): Promise<void> {
    const transporter = this.buildTransport(resolved);
    try {
      await transporter.sendMail({
        from: resolved.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } finally {
      transporter.close();
    }
  }

  /** Verifica la conexión/credenciales SIN enviar (probar conexión). */
  async verify(resolved: ResolvedEmailConfig): Promise<void> {
    const transporter = this.buildTransport(resolved);
    try {
      await transporter.verify();
    } finally {
      transporter.close();
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter?.close();
  }
}
