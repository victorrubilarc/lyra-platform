import { Controller, Get } from "@nestjs/common";
import type { LicenseStatus } from "@lyra/contracts";
import { LicenseService } from "./license.service";
import { LicenseLimitsService } from "./license-limits.service";
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
  constructor(
    private readonly license: LicenseService,
    private readonly licenseLimits: LicenseLimitsService,
  ) {}

  @Get("status")
  async getStatus(): Promise<LicenseStatus> {
    return toLicenseStatus(this.license.getEvaluation(), await this.limitsDto());
  }

  /**
   * Cupo contratado + uso VIVO para el hint de la web (L2b): conteo fresco por
   * request (dos counts indexados; el mismo criterio que el enforcement). Sin
   * payload verificado no viaja — igual que `modules: null`, gobiernan los
   * estados globales. Un fallo de conteo degrada a "sin cupo informado" (la UI
   * no deshabilita; el candado real sigue siendo el 403 del backend).
   */
  private async limitsDto(): Promise<LicenseStatus["limits"]> {
    const limits = this.license.verifiedLimits();
    if (limits === undefined) return undefined;
    try {
      const usage = await this.licenseLimits.currentUsage();
      return {
        nodes: { max: limits.maxNodes, inUse: usage.nodes },
        namedUsers: { max: limits.maxNamedUsers, inUse: usage.namedUsers },
      };
    } catch {
      return undefined;
    }
  }
}
