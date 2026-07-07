import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SetupController } from "./setup.controller";
import { SetupService } from "./setup.service";

/**
 * Asistente de primer arranque (OOBE S1). Módulo CORE: jamás se gatea por
 * licencia ni por entitlement — sin él una instalación virgen ni siquiera se
 * puede configurar (por eso su prefijo vive en la whitelist del guard L1).
 * Prisma/Audit/Crypto/License son globales; AuthModule aporta la política de
 * contraseñas que valida al administrador real.
 */
@Module({
  imports: [AuthModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
