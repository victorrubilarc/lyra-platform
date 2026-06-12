import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";

/**
 * Configuración del sistema (Fase 2.7.1.1 UX). Exporta `SettingsService` para que
 * `OperationalPeriodModule` consulte el gate MFA de gobernanza de períodos.
 */
@Module({
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
