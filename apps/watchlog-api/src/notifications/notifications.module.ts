import { Module } from "@nestjs/common";
import { SchedulesModule } from "../schedules/schedules.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationResolverService } from "./notification-resolver.service";
import { NotificationWorkerService } from "./notification-worker.service";
import { NotificationRealtimeService } from "./notification-realtime.service";
import {
  EmailChannel,
  InAppChannel,
  NotificationChannelRegistry,
} from "./notification-channel";

/**
 * Motor de notificaciones (Bloque N). Importa `SchedulesModule` (resolver de
 * rondas vencidas) — y por transitividad `LogEntriesModule`. La dependencia es de
 * UNA dirección: el dominio (LogEntries/Schedules) NO importa este módulo pesado;
 * solo emite vía `NotificationEmitterService` (módulo @Global aparte) ⇒ sin ciclos.
 * El emisor + la app registran `ScheduleModule.forRoot()` para el tick del worker.
 *
 * Los canales (`EmailChannel` + `InAppChannel`) se registran en un
 * `NotificationChannelRegistry` que el worker usa para enrutar cada fila de bandeja
 * a su canal. Sumar SMS futuro = registrar otra clase aquí sin tocar el motor.
 */
@Module({
  imports: [SchedulesModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationResolverService,
    NotificationWorkerService,
    NotificationRealtimeService,
    EmailChannel,
    InAppChannel,
    {
      provide: NotificationChannelRegistry,
      useFactory: (email: EmailChannel, inApp: InAppChannel) =>
        new NotificationChannelRegistry([email, inApp]),
      inject: [EmailChannel, InAppChannel],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
