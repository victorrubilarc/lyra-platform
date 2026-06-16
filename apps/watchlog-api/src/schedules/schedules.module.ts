import { Module } from "@nestjs/common";
import { OperationalCalendarModule } from "../operational-calendar/operational-calendar.module";
import { FiscalCalendarModule } from "../fiscal-calendar/fiscal-calendar.module";
import { LogEntriesModule } from "../log-entries/log-entries.module";
import { SchedulesController } from "./schedules.controller";
import { SchedulesService } from "./schedules.service";

/**
 * Programación de rondas (Fase 2.3) — horarios (`LogSchedule`) + ocurrencias
 * (`RoundOccurrence`). Depende de:
 * - OperationalCalendarModule → `ShiftResolver` (turnos/TZ del nodo para generar).
 * - FiscalCalendarModule → `FiscalResolver` (estampa el periodKey de la ocurrencia).
 * - LogEntriesModule → `LogEntriesService` (crear la entrada al INICIAR la ronda;
 *   reusa todas las guardas ABAC/EAM). Dependencia en una sola dirección:
 *   LogEntries NO depende de Schedules (toca RoundOccurrence solo vía Prisma).
 */
@Module({
  imports: [OperationalCalendarModule, FiscalCalendarModule, LogEntriesModule],
  controllers: [SchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService],
})
export class SchedulesModule {}
