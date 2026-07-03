import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { FolioModule } from "../folio/folio.module";
import { LogEntriesModule } from "../log-entries/log-entries.module";
import { WorkOrdersController } from "./work-orders.controller";
import { PersonsController } from "./persons.controller";
import { CompetenciesController } from "./competencies.controller";
import { WorkOrdersService } from "./work-orders.service";
import { WorkOrderChecklistsService } from "./work-order-checklists.service";
import { WorkActivitiesService } from "./work-activities.service";
import { WorkOrderSlaService } from "./work-order-sla.service";
import { WorkOrderRosterService } from "./work-order-roster.service";
import { PersonsService } from "./persons.service";
import { CompetenciesService } from "./competencies.service";
import { WorkerComplianceService } from "./worker-compliance.service";

/**
 * Órdenes de Trabajo / Work Orders (OT / PTW) — S1 cimientos + S2 Puerta 1 + S3
 * Puerta 2 (checklists/PTW) + S6 SLA/semáforos. Espejo de Incidencias. Depende de
 * AuthModule para `ReauthService` (firma Part 11), FolioModule para el folio gapless
 * y LogEntriesModule para instanciar checklists como `LogEntry` vivos (fork W5).
 * `WorkOrderSlaService` (S6) detecta vencimientos; lo consume el sweeper del Bloque N.
 * Prisma, Audit y ScopeService llegan por módulos globales.
 */
@Module({
  imports: [AuthModule, FolioModule, LogEntriesModule],
  controllers: [WorkOrdersController, PersonsController, CompetenciesController],
  providers: [WorkOrdersService, WorkOrderChecklistsService, WorkActivitiesService, WorkOrderSlaService, WorkOrderRosterService, PersonsService, CompetenciesService, WorkerComplianceService],
  exports: [WorkOrdersService, WorkOrderChecklistsService, WorkActivitiesService, WorkOrderSlaService, WorkOrderRosterService, PersonsService, CompetenciesService, WorkerComplianceService],
})
export class WorkOrdersModule {}
