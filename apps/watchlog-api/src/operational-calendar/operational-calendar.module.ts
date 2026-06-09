import { Module } from "@nestjs/common";
import { OperationalCalendarController } from "./operational-calendar.controller";
import { OperationalCalendarService } from "./operational-calendar.service";
import { ShiftResolver, ShiftResolverService } from "./shift-resolver";

/**
 * Calendario operacional (turnos + periodo contable) — Fase 2.3.0.
 * Exporta `ShiftResolver` (tras interfaz) para que 2.4/2.3/Fase 5 lo inyecten.
 */
@Module({
  controllers: [OperationalCalendarController],
  providers: [OperationalCalendarService, { provide: ShiftResolver, useClass: ShiftResolverService }],
  exports: [OperationalCalendarService, ShiftResolver],
})
export class OperationalCalendarModule {}
