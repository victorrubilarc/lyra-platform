import { Module } from "@nestjs/common";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";

/**
 * Órdenes de Trabajo / Work Orders (OT / PTW) — Sesión 1: CIMIENTOS. Espejo de
 * Incidencias. En S1 no usa firmas/transiciones, así que no depende de AuthModule
 * (Prisma, Audit y ScopeService llegan por módulos globales). El WORKFLOW (S2)
 * incorporará ReauthService igual que Incidencias.
 */
@Module({
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
