import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { OperationalCalendarModule } from "../operational-calendar/operational-calendar.module";
import { ShiftHandoverCompilerService } from "./shift-handover-compiler.service";
import { ShiftHandoverController } from "./shift-handover.controller";
import { ShiftHandoverService } from "./shift-handover.service";

/**
 * Cambio de turno / Shift Handover (Fase 5 — Slice 1). Ciclo FIJO de 3 pasos
 * (compilar → firma saliente → acuse entrante) que reusa el mecanismo de firma
 * Part 11 (AuthModule → ReauthService) y la resolución de turno por nodo
 * (OperationalCalendarModule → ShiftResolver). Prisma, Audit, ScopeService y el
 * emisor de notificaciones llegan por módulos globales.
 */
@Module({
  imports: [AuthModule, OperationalCalendarModule],
  controllers: [ShiftHandoverController],
  providers: [ShiftHandoverService, ShiftHandoverCompilerService],
  exports: [ShiftHandoverService],
})
export class ShiftHandoverModule {}
