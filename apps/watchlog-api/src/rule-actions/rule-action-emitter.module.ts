import { Global, Module } from "@nestjs/common";
import { RuleActionEmitterService } from "./rule-action-emitter.service";

/**
 * Emisor de acciones de regla (etapa 1 del outbox dedicado, Fase 4.1.2). @Global y
 * MÍNIMO (solo Prisma) para que LogEntriesService lo inyecte y encole DENTRO de la
 * tx del sello, sin importar el módulo pesado del worker (que depende de
 * Incidencias) — evita el ciclo de DI. Mismo patrón que NotificationEmitterModule.
 */
@Global()
@Module({
  providers: [RuleActionEmitterService],
  exports: [RuleActionEmitterService],
})
export class RuleActionEmitterModule {}
