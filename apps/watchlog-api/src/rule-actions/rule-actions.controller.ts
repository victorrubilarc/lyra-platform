import { Controller, Post } from "@nestjs/common";
import { RequirePermission } from "../authz/authz.decorators";
import { RuleActionWorkerService } from "./rule-action-worker.service";

/**
 * Endpoint de OPERACIÓN/diagnóstico del worker de acciones de regla (Fase 4.1.2).
 * El cron lo corre solo cada 30 s; este `run` lo dispara a demanda (smoke/ops).
 */
@Controller("rule-actions")
export class RuleActionsController {
  constructor(private readonly worker: RuleActionWorkerService) {}

  /** Procesa el lote pendiente del outbox de acciones de regla una vez. */
  @Post("run")
  @RequirePermission("incident:create")
  run() {
    return this.worker.runOnce();
  }
}
