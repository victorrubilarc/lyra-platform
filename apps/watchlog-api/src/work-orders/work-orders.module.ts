import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FolioModule } from "../folio/folio.module";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";

/**
 * Órdenes de Trabajo / Work Orders (OT / PTW) — S1 cimientos + S2 Puerta 1. Espejo
 * de Incidencias. Depende de AuthModule para `ReauthService` (firma Part 11 en las
 * transiciones que la exigen) y de FolioModule para el folio gapless emitido al
 * aprobar. Prisma, Audit y ScopeService llegan por módulos globales.
 */
@Module({
  imports: [AuthModule, FolioModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService],
  exports: [WorkOrdersService],
})
export class WorkOrdersModule {}
