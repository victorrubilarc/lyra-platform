import { Module } from "@nestjs/common";
import { IncidentsModule } from "../incidents/incidents.module";
import { RuleActionWorkerService } from "./rule-action-worker.service";
import { RuleActionsController } from "./rule-actions.controller";

/**
 * Acciones del motor de reglas (Fase 4.1.2) — ETAPA 2 (worker) del outbox dedicado.
 * Importa IncidentsModule para reusar `IncidentsService` al abrir incidencias
 * automáticas (no duplica la creación). El generador de excepciones llega por
 * ExceptionGeneratorModule (@Global); el EMISOR (etapa 1) vive aparte
 * (RuleActionEmitterModule, @Global) para que LogEntries lo inyecte sin arrastrar
 * este módulo. Prisma y Audit llegan por módulos globales.
 */
@Module({
  imports: [IncidentsModule],
  controllers: [RuleActionsController],
  providers: [RuleActionWorkerService],
  exports: [RuleActionWorkerService],
})
export class RuleActionsModule {}
