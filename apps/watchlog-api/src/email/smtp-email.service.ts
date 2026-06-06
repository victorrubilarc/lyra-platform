import { Injectable, Logger, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport, type Transporter } from "nodemailer";
import type { Env } from "../config/env.schema";
import { EmailService, type EmailMessage } from "./email.service";

/**
 * Implementación SMTP de `EmailService` (nodemailer). On-premise: usa el relay
 * SMTP que el cliente configure; en desarrollo, Mailpit (localhost:1025), que
 * captura los correos sin enviarlos a Internet.
 *
 * El transporter se crea perezosamente y se reutiliza (pool de conexiones).
 */
@Injectable()
export class SmtpEmailService extends EmailService implements OnModuleDestroy {
  private readonly logger = new Logger(SmtpEmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  private getTransporter(): Transporter {
    if (this.transporter) return this.transporter;
    const user = this.config.get("SMTP_USER", { infer: true });
    const pass = this.config.get("SMTP_PASSWORD", { infer: true });
    this.transporter = createTransport({
      host: this.config.get("SMTP_HOST", { infer: true }),
      port: this.config.get("SMTP_PORT", { infer: true }),
      secure: this.config.get("SMTP_SECURE", { infer: true }),
      // Solo autentica si el relay lo exige (Mailpit no usa credenciales).
      auth: user && pass ? { user, pass } : undefined,
    });
    return this.transporter;
  }

  async send(message: EmailMessage): Promise<void> {
    const from = this.config.get("SMTP_FROM", { infer: true });
    await this.getTransporter().sendMail({
      from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    // No se registran ni el cuerpo ni los enlaces (pueden contener tokens).
    this.logger.debug(`Correo enviado a ${message.to}: "${message.subject}"`);
  }

  async onModuleDestroy(): Promise<void> {
    this.transporter?.close();
  }
}
