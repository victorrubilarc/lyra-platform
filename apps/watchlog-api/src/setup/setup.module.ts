import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BrandingModule } from "../branding/branding.module";
import { SetupController } from "./setup.controller";
import { SetupService } from "./setup.service";

/**
 * Asistente de primer arranque (OOBE S1). Módulo CORE: jamás se gatea por
 * licencia ni por entitlement — sin él una instalación virgen ni siquiera se
 * puede configurar (por eso su prefijo vive en la whitelist del guard L1).
 * Prisma/Audit/Crypto/License son globales; AuthModule aporta la política de
 * contraseñas que valida al administrador real; BrandingModule aporta la
 * captura del logo (S3) con la MISMA validación que post-setup.
 */
@Module({
  imports: [AuthModule, BrandingModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
