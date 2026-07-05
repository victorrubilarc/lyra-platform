import { Controller, Get } from "@nestjs/common";
import type { LicenseStatus } from "@lyra/contracts";
import { LicenseService } from "./license.service";
import { toLicenseStatus } from "./license-runtime";

/**
 * Estado de licencia para la web (L2). AUTENTICADO pero SIN permiso: cualquier
 * usuario logueado necesita `modules[]` para que el shell decida qué módulos
 * mostrar (el gate visible = módulo licenciado ∧ permiso del usuario). No es
 * información sensible: el DTO es el mapeo delgado `toLicenseStatus` (nunca el
 * payload — sin huella/linaje/installationId). Al ser GET pasa SIEMPRE, incluso
 * en estados restringidos (es justamente lo que la UI necesita para explicarlos).
 */
@Controller("license")
export class LicenseController {
  constructor(private readonly license: LicenseService) {}

  @Get("status")
  getStatus(): LicenseStatus {
    return toLicenseStatus(this.license.getEvaluation());
  }
}
