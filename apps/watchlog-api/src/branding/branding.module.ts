import { Module } from "@nestjs/common";
import { BrandingController } from "./branding.controller";
import { BrandingService } from "./branding.service";

/**
 * Branding runtime (OOBE S3). Módulo CORE, no entitlement-gated: la identidad
 * visual de la instalación no es una feature comprada — el eje de licencia que
 * SÍ lo gobierna es el flag `whiteLabel` del payload (L6d), que decide QUÉ
 * marca domina, no si el módulo existe. Exporta el servicio para que el wizard
 * de primer arranque (SetupModule) capture el logo con la MISMA validación.
 */
@Module({
  controllers: [BrandingController],
  providers: [BrandingService],
  exports: [BrandingService],
})
export class BrandingModule {}
