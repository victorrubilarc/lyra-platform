import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { IncidentActionsService } from "./incident-actions.service";
import { IncidentDashboardService } from "./incident-dashboard.service";
import { IncidentInvestigationService } from "./incident-investigation.service";
import { IncidentReportsService } from "./incident-reports.service";
import { IncidentSlaService } from "./incident-sla.service";
import { IncidentsController } from "./incidents.controller";
import { IncidentsService } from "./incidents.service";

/**
 * Incidencias operacionales / HSE (Fase 4.0). Reusa `WorkflowDefinition` para el
 * ciclo de vida (no duplica la máquina de estados). Depende de AuthModule para
 * `ReauthService` (re-autenticación de transiciones con firma Part 11). Prisma,
 * Audit y ScopeService llegan por módulos globales.
 */
@Module({
  imports: [AuthModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, IncidentActionsService, IncidentInvestigationService, IncidentReportsService, IncidentSlaService, IncidentDashboardService],
  exports: [IncidentsService, IncidentActionsService, IncidentInvestigationService, IncidentReportsService, IncidentSlaService],
})
export class IncidentsModule {}
