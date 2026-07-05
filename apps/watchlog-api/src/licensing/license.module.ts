import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { MachineSignalsCollector } from "./machine-signals.collector";
import { LicenseService } from "./license.service";
import { LicenseEnforcementGuard } from "./license-enforcement.guard";

/**
 * Licenciamiento L1 — runtime de la licencia en la API.
 *
 * Global: cualquier módulo puede consumir `LicenseService` (getEvaluation /
 * isModuleLicensed para el gating L2, workersOperational para chequeos
 * distribuidos en procesos de fondo). Registra el guard de enforcement como
 * CUARTO guard global (tras JwtAccess/Permissions/MfaEnrollment de
 * AuthzModule: el orden lo da el orden de imports en AppModule).
 */
@Global()
@Module({
  providers: [
    MachineSignalsCollector,
    LicenseService,
    { provide: APP_GUARD, useClass: LicenseEnforcementGuard },
  ],
  exports: [LicenseService],
})
export class LicenseModule {}
