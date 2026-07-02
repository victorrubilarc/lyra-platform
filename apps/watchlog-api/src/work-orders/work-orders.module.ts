import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FolioModule } from "../folio/folio.module";
import { LogEntriesModule } from "../log-entries/log-entries.module";
import { WorkOrdersController } from "./work-orders.controller";
import { WorkOrdersService } from "./work-orders.service";
import { WorkOrderChecklistsService } from "./work-order-checklists.service";

/**
 * Órdenes de Trabajo / Work Orders (OT / PTW) — S1 cimientos + S2 Puerta 1 + S3
 * Puerta 2 (checklists/PTW). Espejo de Incidencias. Depende de AuthModule para
 * `ReauthService` (firma Part 11), FolioModule para el folio gapless y LogEntriesModule
 * para instanciar checklists como `LogEntry` vivos (fork W5). Prisma, Audit y
 * ScopeService llegan por módulos globales.
 */
@Module({
  imports: [AuthModule, FolioModule, LogEntriesModule],
  controllers: [WorkOrdersController],
  providers: [WorkOrdersService, WorkOrderChecklistsService],
  exports: [WorkOrdersService, WorkOrderChecklistsService],
})
export class WorkOrdersModule {}
