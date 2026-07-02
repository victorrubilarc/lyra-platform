import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperationalCalendarModule } from "../operational-calendar/operational-calendar.module";
import { FiscalCalendarModule } from "../fiscal-calendar/fiscal-calendar.module";
import { OperationalPeriodModule } from "../operational-periods/operational-periods.module";
import { SettingsModule } from "../settings/settings.module";
import { TemplatesModule } from "../templates/templates.module";
import { FolioModule } from "../folio/folio.module";
import { LogEntriesController } from "./log-entries.controller";
import { LogEntriesService } from "./log-entries.service";
import { LogbookQueryService } from "./logbook-query.service";

/**
 * Llenado + EJECUCIÓN DE FLUJO de bitácoras (Fases 2.4/2.5) y módulo de
 * Bitácoras read-only (Fase 2.6, `LogbookQueryService`: listado/KPIs/timeline/
 * export/verificación de firmas).
 * - OperationalCalendarModule → `ShiftResolver` (estampa turno/día operacional).
 * - FiscalCalendarModule → `FiscalResolver` (estampa el periodKey, eje fiscal 2.7.1.1).
 * - OperationalPeriodModule → `OperationalPeriodService` (guarda de escritura por período).
 * - AuthModule → `ReauthService` (re-autenticación para las firmas Part 11).
 * - SettingsModule → `SettingsService` (ventana de edición global + gate MFA del override, 2.7.2).
 * `EncryptionService` (hash del payload firmado) viene del CryptoModule global.
 */
@Module({
  imports: [OperationalCalendarModule, FiscalCalendarModule, OperationalPeriodModule, AuthModule, SettingsModule, TemplatesModule, FolioModule],
  controllers: [LogEntriesController],
  providers: [LogEntriesService, LogbookQueryService],
  exports: [LogEntriesService],
})
export class LogEntriesModule {}
