import { Module } from "@nestjs/common";
import { SavedViewsController } from "./saved-views.controller";
import { SavedViewsService } from "./saved-views.service";

/**
 * Vistas guardadas de plataforma (Fase 2.8.1b). CRUD de presentación personal
 * (ownership-gated) reusable por cualquier módulo de listado vía el discriminador
 * `module` (Bitácoras hoy; Incidencias en Fase 4).
 */
@Module({
  controllers: [SavedViewsController],
  providers: [SavedViewsService],
  exports: [SavedViewsService],
})
export class SavedViewsModule {}
