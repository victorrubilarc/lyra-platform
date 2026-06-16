import { Global, Module } from "@nestjs/common";
import { ExceptionGeneratorService } from "./exception-generator.service";

/**
 * Generador de excepciones operacionales (etapa síncrona, Fase 4.1). @Global y
 * MÍNIMO (solo Prisma) para que LogEntriesService lo inyecte y reconcilie las
 * excepciones DENTRO de la tx del guardado/sello, sin importar el módulo pesado
 * de triage (que a su vez depende del de incidencias) — evita el ciclo de DI.
 * Mismo patrón que NotificationEmitterModule.
 */
@Global()
@Module({
  providers: [ExceptionGeneratorService],
  exports: [ExceptionGeneratorService],
})
export class ExceptionGeneratorModule {}
