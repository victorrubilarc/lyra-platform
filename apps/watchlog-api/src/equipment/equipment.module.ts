import { Module } from "@nestjs/common";
import { EquipmentController } from "./equipment.controller";
import { EquipmentService } from "./equipment.service";

/** Equipos (Equipment) y su catálogo de clasificación, anclados a la estructura. */
@Module({
  controllers: [EquipmentController],
  providers: [EquipmentService],
  exports: [EquipmentService],
})
export class EquipmentModule {}
