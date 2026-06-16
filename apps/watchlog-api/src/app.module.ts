import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { LoggerModule } from "nestjs-pino";
import { validateEnv } from "./config/env.schema";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./health/health.module";
import { CryptoModule } from "./crypto/crypto.module";
import { CacheModule } from "./redis/cache.module";
import { AuditModule } from "./audit/audit.module";
import { EmailModule } from "./email/email.module";
import { StorageModule } from "./storage/storage.module";
import { AuthzModule } from "./authz/authz.module";
import { AuthModule } from "./auth/auth.module";
import { StructureModule } from "./structure/structure.module";
import { EquipmentModule } from "./equipment/equipment.module";
import { TemplatesModule } from "./templates/templates.module";
import { WorkflowsModule } from "./workflows/workflows.module";
import { ReferenceListsModule } from "./reference-lists/reference-lists.module";
import { OperationalCalendarModule } from "./operational-calendar/operational-calendar.module";
import { FiscalCalendarModule } from "./fiscal-calendar/fiscal-calendar.module";
import { OperationalPeriodModule } from "./operational-periods/operational-periods.module";
import { SettingsModule } from "./settings/settings.module";
import { LogEntriesModule } from "./log-entries/log-entries.module";
import { SchedulesModule } from "./schedules/schedules.module";
import { SavedViewsModule } from "./saved-views/saved-views.module";
import { SecurityModule } from "./security/security.module";
import { NotificationEmitterModule } from "./notifications/notification-emitter.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { IncidentsModule } from "./incidents/incidents.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // En dev se lee el .env de la raíz del monorepo; en contenedor, del propio servicio.
      envFilePath: ["../../.env", ".env"],
      validate: validateEnv,
    }),
    // Tick del worker de notificaciones (primera infra de cron del proyecto).
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? "info",
        transport:
          process.env.NODE_ENV !== "production"
            ? { target: "pino-pretty", options: { singleLine: true } }
            : undefined,
        // Nunca registrar credenciales ni cookies en los logs.
        redact: ["req.headers.authorization", "req.headers.cookie", 'res.headers["set-cookie"]'],
      },
    }),
    PrismaModule,
    CryptoModule,
    CacheModule,
    AuditModule,
    EmailModule,
    StorageModule,
    AuthzModule,
    AuthModule,
    StructureModule,
    EquipmentModule,
    TemplatesModule,
    WorkflowsModule,
    ReferenceListsModule,
    OperationalCalendarModule,
    FiscalCalendarModule,
    OperationalPeriodModule,
    SettingsModule,
    LogEntriesModule,
    SchedulesModule,
    SavedViewsModule,
    SecurityModule,
    NotificationEmitterModule,
    NotificationsModule,
    IncidentsModule,
    HealthModule,
  ],
})
export class AppModule {}
