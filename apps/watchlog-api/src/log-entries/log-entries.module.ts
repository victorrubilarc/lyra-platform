import { Module } from "@nestjs/common";
import { OperationalCalendarModule } from "../operational-calendar/operational-calendar.module";
import { LogEntriesController } from "./log-entries.controller";
import { LogEntriesService } from "./log-entries.service";

/**
 * Llenado de bitácoras (Fase 2.4) — EJECUCIÓN auditada de plantillas.
 * Importa OperationalCalendarModule para inyectar `ShiftResolver` (estampa las
 * dimensiones de turno/día operacional/periodo en cada entrada).
 */
@Module({
  imports: [OperationalCalendarModule],
  controllers: [LogEntriesController],
  providers: [LogEntriesService],
  exports: [LogEntriesService],
})
export class LogEntriesModule {}
