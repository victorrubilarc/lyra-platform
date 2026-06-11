import { Module } from "@nestjs/common";
import { OperationalCalendarModule } from "../operational-calendar/operational-calendar.module";
import { OperationalPeriodController } from "./operational-periods.controller";
import { OperationalPeriodService } from "./operational-periods.service";

/**
 * Período contable gobernado (Fase 2.7.1). Importa el calendario operacional para
 * inyectar el `ShiftResolver` (resuelve calendario × periodKey desde la fecha) y
 * exporta `OperationalPeriodService` para que `LogEntriesModule` aplique la guarda.
 */
@Module({
  imports: [OperationalCalendarModule],
  controllers: [OperationalPeriodController],
  providers: [OperationalPeriodService],
  exports: [OperationalPeriodService],
})
export class OperationalPeriodModule {}
