import { Module } from "@nestjs/common";
import { StructureController } from "./structure.controller";
import { StructureService } from "./structure.service";

/** Estructura organizacional configurable (niveles + nodos jerárquicos). */
@Module({
  controllers: [StructureController],
  providers: [StructureService],
  exports: [StructureService],
})
export class StructureModule {}
