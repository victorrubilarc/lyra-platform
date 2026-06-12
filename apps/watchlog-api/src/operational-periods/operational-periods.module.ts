import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FiscalCalendarModule } from "../fiscal-calendar/fiscal-calendar.module";
import { OperationalCalendarModule } from "../operational-calendar/operational-calendar.module";
import { SettingsModule } from "../settings/settings.module";
import { OperationalPeriodController } from "./operational-periods.controller";
import { OperationalPeriodService } from "./operational-periods.service";

/**
 * Período contable gobernado (Fase 2.7.1.1). Importa el calendario de TURNOS (para el
 * `ShiftResolver` → operationalDate) y el calendario FISCAL (para el `FiscalResolver`
 * → periodKey). Exporta `OperationalPeriodService` para que `LogEntriesModule` aplique
 * la guarda de escritura.
 */
@Module({
  imports: [OperationalCalendarModule, FiscalCalendarModule, SettingsModule, AuthModule],
  controllers: [OperationalPeriodController],
  providers: [OperationalPeriodService],
  exports: [OperationalPeriodService],
})
export class OperationalPeriodModule {}
