import { Injectable } from "@nestjs/common";
import type { MfaMode } from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Evalúa la POLÍTICA DE REQUERIMIENTO de MFA (no el enrolamiento en sí). El
 * requerimiento es derivado, no un booleano persistido: depende del modo global
 * (`PasswordPolicy.mfaMode`) y, en `REQUIRED_BY_ROLE`, de si algún rol del
 * usuario tiene `requireMfa`. El "enrolamiento pendiente" (gate análogo a
 * `forcePasswordChange`) es: requerido && !mfaEnabled.
 */
@Injectable()
export class MfaRequirementService {
  constructor(private readonly prisma: PrismaService) {}

  /** Modo global vigente (OPTIONAL si la política aún no se sembró). */
  async getMode(): Promise<MfaMode> {
    const policy = await this.prisma.passwordPolicy.findUnique({
      where: { id: "singleton" },
      select: { mfaMode: true },
    });
    return policy?.mfaMode ?? "OPTIONAL";
  }

  /** ¿El usuario está OBLIGADO a tener MFA según el modo global y sus roles? */
  async isRequiredForUser(userId: string): Promise<boolean> {
    const mode = await this.getMode();
    if (mode === "OPTIONAL") return false;
    if (mode === "REQUIRED_FOR_ALL") return true;
    // REQUIRED_BY_ROLE: basta un rol con requireMfa.
    const count = await this.prisma.userRole.count({
      where: { userId, role: { requireMfa: true } },
    });
    return count > 0;
  }

  /**
   * ¿La sesión debe quedar limitada al enrolamiento? True cuando el usuario está
   * obligado a MFA y todavía no lo tiene activo. Un único lookup de `mfaEnabled`
   * si no se provee.
   */
  async isEnrollmentPending(user: { id: string; mfaEnabled?: boolean }): Promise<boolean> {
    let enabled = user.mfaEnabled;
    if (enabled === undefined) {
      const row = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { mfaEnabled: true },
      });
      enabled = row?.mfaEnabled ?? false;
    }
    if (enabled) return false;
    return this.isRequiredForUser(user.id);
  }
}
