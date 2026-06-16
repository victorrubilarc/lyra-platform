import { Global, Module } from "@nestjs/common";
import { NotificationEmitterService } from "./notification-emitter.service";

/**
 * Emisor de eventos de notificación (etapa 1 del outbox). @Global y MÍNIMO (solo
 * Prisma) para que el dominio (LogEntries, sweeper de rondas) lo inyecte sin
 * importar el módulo PESADO de notificaciones — así no se forma un ciclo de DI
 * (Notifications → LogEntries/Schedules para resolver destinatarios, y el dominio
 * → este emisor para encolar).
 */
@Global()
@Module({
  providers: [NotificationEmitterService],
  exports: [NotificationEmitterService],
})
export class NotificationEmitterModule {}
