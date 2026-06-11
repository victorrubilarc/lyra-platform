import { Module } from "@nestjs/common";
import { FiscalCalendarController } from "./fiscal-calendar.controller";
import { FiscalCalendarService } from "./fiscal-calendar.service";
import { FiscalResolver, FiscalResolverService } from "./fiscal-resolver";

/**
 * Calendario FISCAL (período contable transversal) — Fase 2.7.1.1.
 * Exporta `FiscalResolver` (tras interfaz) para que la guarda de período y el
 * estampado de `LogEntry.periodKey` lo inyecten, desacoplado del eje de turnos.
 */
@Module({
  controllers: [FiscalCalendarController],
  providers: [FiscalCalendarService, { provide: FiscalResolver, useClass: FiscalResolverService }],
  exports: [FiscalCalendarService, FiscalResolver],
})
export class FiscalCalendarModule {}
