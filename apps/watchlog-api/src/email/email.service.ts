/**
 * Interfaz abstracta de correo saliente. El resto de la aplicación depende de
 * esta clase (token de inyección), nunca de una implementación concreta, de modo
 * que el proveedor de envío (SMTP propio, relay del cliente, etc.) se cambia sin
 * tocar la lógica de negocio. Mismo patrón que tendrá `LlmProvider` (Fase 5).
 */
export interface EmailMessage {
  /** Destinatario (un solo correo; la recuperación es siempre 1:1). */
  to: string;
  subject: string;
  /** Cuerpo en texto plano (obligatorio: accesibilidad y clientes sin HTML). */
  text: string;
  /** Cuerpo HTML. */
  html: string;
}

/** Clase abstracta usada como token DI. La implementación viva la registra el módulo. */
export abstract class EmailService {
  abstract send(message: EmailMessage): Promise<void>;
}
