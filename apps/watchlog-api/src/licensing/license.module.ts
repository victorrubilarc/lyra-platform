import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MachineSignalsCollector } from "./machine-signals.collector";
import { LicenseService } from "./license.service";
import { LicenseLimitsService } from "./license-limits.service";
import { LicenseEnforcementGuard } from "./license-enforcement.guard";
import { ModuleEntitlementGuard } from "./module-entitlement.guard";
import { LicenseController } from "./license.controller";

/**
 * Licenciamiento L1+L2 — runtime de la licencia en la API.
 *
 * Global: cualquier módulo puede consumir `LicenseService` (getEvaluation /
 * isModuleLicensed, workersOperational para chequeos distribuidos en procesos
 * de fondo). Registra DOS guards globales (tras JwtAccess/Permissions/
 * MfaEnrollment de AuthzModule; el orden lo da el orden de imports en
 * AppModule): 4.º `LicenseEnforcementGuard` (máquina de estados GLOBAL, L1) y
 * 5.º `ModuleEntitlementGuard` (entitlement POR MÓDULO con licencia operativa,
 * L2). Expone `GET /license/status` (DTO delgado para la web).
 */
@Global()
@Module({
  controllers: [LicenseController],
  providers: [
    MachineSignalsCollector,
    LicenseService,
    LicenseLimitsService,
    { provide: APP_GUARD, useClass: LicenseEnforcementGuard },
    { provide: APP_GUARD, useClass: ModuleEntitlementGuard },
  ],
  exports: [LicenseService, LicenseLimitsService],
})
export class LicenseModule {}
