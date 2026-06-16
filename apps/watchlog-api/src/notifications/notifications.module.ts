import { Module } from "@nestjs/common";
import { SchedulesModule } from "../schedules/schedules.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationResolverService } from "./notification-resolver.service";
import { NotificationWorkerService } from "./notification-worker.service";
import { NotificationChannel, EmailChannel } from "./notification-channel";

/**
 * Motor de notificaciones (Bloque N). Importa `SchedulesModule` (resolver de
 * rondas vencidas) — y por transitividad `LogEntriesModule`. La dependencia es de
 * UNA dirección: el dominio (LogEntries/Schedules) NO importa este módulo pesado;
 * solo emite vía `NotificationEmitterService` (módulo @Global aparte) ⇒ sin ciclos.
 * El emisor + la app registran `ScheduleModule.forRoot()` para el tick del worker.
 *
 * `EmailChannel` se cablea a la abstracción `NotificationChannel` (hoy único canal;
 * in-app/SMS futuros se registran aquí sin tocar el motor).
 */
@Module({
  imports: [SchedulesModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationResolverService,
    NotificationWorkerService,
    { provide: NotificationChannel, useClass: EmailChannel },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
