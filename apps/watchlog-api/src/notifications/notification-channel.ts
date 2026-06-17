import { Injectable } from "@nestjs/common";
import type { NotificationChannel as ChannelKey } from "@lyra/contracts";
import { EmailService } from "../email/email.service";

/** Un mensaje listo para entregar por un canal (ya renderizado). */
export interface OutboundMessage {
  to: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

/**
 * Interfaz de CANAL de entrega. El motor es agnóstico al canal: `EmailChannel`
 * (reusa el `EmailService` abstracto = transporte SMTP/relay del cliente) e
 * `InAppChannel` (la "campanita": la propia fila de outbox ES el ítem de bandeja
 * del destinatario, por lo que "entregar" no hace I/O). Mismo patrón de
 * abstracción on-prem que `EmailService` y `StorageService`.
 */
export abstract class NotificationChannel {
  /** Identificador del canal (debe coincidir con el enum `NotificationChannel`). */
  abstract readonly channel: ChannelKey;
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

/**
 * Canal IN-APP (la campanita): no hay transporte externo. La fila de
 * `NotificationOutbox` (channel = INAPP) ya es la notificación del destinatario;
 * marcarla SENT la "entrega". El empujón en tiempo real (SSE) lo hace el worker
 * tras el SENT, no este canal (que se mantiene puro/sin estado).
 */
@Injectable()
export class InAppChannel extends NotificationChannel {
  readonly channel = "INAPP" as const;

  async send(_message: OutboundMessage): Promise<void> {
    // Entrega = la propia fila de bandeja; no hay I/O que pueda fallar.
  }
}

/**
 * Registro de canales por clave. Se inyecta en el worker para enrutar cada fila de
 * la bandeja a su canal (`EMAIL`/`INAPP`) sin condicionales dispersos.
 */
export class NotificationChannelRegistry {
  private readonly byKey = new Map<ChannelKey, NotificationChannel>();

  constructor(channels: NotificationChannel[]) {
    for (const c of channels) this.byKey.set(c.channel, c);
  }

  get(channel: ChannelKey): NotificationChannel | undefined {
    return this.byKey.get(channel);
  }
}
