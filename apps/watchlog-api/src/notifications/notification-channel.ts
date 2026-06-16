import { Injectable } from "@nestjs/common";
import { EmailService } from "../email/email.service";

/** Un mensaje listo para entregar por un canal (ya renderizado). */
export interface OutboundMessage {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

/**
 * Interfaz de CANAL de entrega. El motor es agnóstico al canal: hoy solo existe
 * `EmailChannel` (reusa el `EmailService` abstracto = transporte SMTP/relay del
 * cliente), pero `NotificationOutbox.channel` ya reserva el modelo para in-app/SMS
 * futuros sin tocar el motor. Mismo patrón de abstracción on-prem que `EmailService`
 * y `StorageService`.
 */
export abstract class NotificationChannel {
  /** Identificador del canal (debe coincidir con el enum `NotificationChannel`). */
  abstract readonly channel: "EMAIL";
  /** Entrega el mensaje. Lanza si falla (el sender registra FAILED + backoff). */
  abstract send(message: OutboundMessage): Promise<void>;
}

/** Canal de correo: delega en el `EmailService` existente (nodemailer → SMTP/Mailpit). */
@Injectable()
export class EmailChannel extends NotificationChannel {
  readonly channel = "EMAIL" as const;

  constructor(private readonly email: EmailService) {
    super();
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.email.send({
      to: message.to,
      subject: message.subject,
      text: message.bodyText,
      html: message.bodyHtml,
    });
  }
}
