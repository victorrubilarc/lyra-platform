import { Module } from "@nestjs/common";
import { IncidentsModule } from "../incidents/incidents.module";
import { ExceptionsController } from "./exceptions.controller";
import { ExceptionsService } from "./exceptions.service";

/**
 * Triage de excepciones operacionales (Fase 4.1). Importa IncidentsModule para
 * reusar `IncidentsService` al CONVERTIR una excepción en incidencia (no duplica
 * la creación). El generador síncrono vive aparte (ExceptionGeneratorModule,
 * @Global) para que LogEntries lo inyecte sin arrastrar este módulo. Prisma,
 * Audit, Scope y Permission llegan por módulos globales.
 */
@Module({
  imports: [IncidentsModule],
  controllers: [ExceptionsController],
  providers: [ExceptionsService],
  exports: [ExceptionsService],
})
export class ExceptionsModule {}
