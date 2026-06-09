import { Module } from "@nestjs/common";
import { ReferenceListsController } from "./reference-lists.controller";
import { ReferenceListsService } from "./reference-lists.service";

/** Datos de referencia / Listas (catálogo gobernado de valores reutilizables). */
@Module({
  controllers: [ReferenceListsController],
  providers: [ReferenceListsService],
  exports: [ReferenceListsService],
})
export class ReferenceListsModule {}
