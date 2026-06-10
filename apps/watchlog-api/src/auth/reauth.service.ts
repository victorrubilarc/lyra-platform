import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { SignatureMethod } from "@lyra/contracts";
import { PasswordService } from "../crypto/password.service";
import { PrismaService } from "../prisma/prisma.service";
import { MfaService } from "./mfa.service";

/** Credenciales de re-autenticación para una acción sensible (firma Part 11). */
export interface ReauthCredentials {
  password?: string;
  /** Segundo factor (TOTP o código de recuperación), si la acción exige step-up. */
  mfaCode?: string;
}

export interface ReauthResult {
  /** Método con que se re-autenticó (componentes §11.200). */
  method: SignatureMethod;
  /** Nombre impreso del firmante, capturado al re-autenticar (§11.50). */
  signerName: string;
}

/**
 * Re-autenticación para acciones que exigen firma electrónica (21 CFR Part 11
 * §11.200: identificación del firmante + al menos dos componentes distintos —ID y
 * contraseña—). Reutilizable por la ejecución de flujo (2.5), incidencias (Fase 4)
 * y notificaciones con acción firmada. NO emite tokens ni eleva la sesión: solo
 * confirma que quien firma es quien dice ser, en este instante.
 *
 * Step-up MFA (NIST SP 800-63B): si la acción lo exige (`requireMfa`), además de
 * la contraseña se reconfirma el segundo factor (TOTP o código de recuperación).
 */
@Injectable()
export class ReauthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly mfa: MfaService,
  ) {}

  async verifyForSignature(
    userId: string,
    creds: ReauthCredentials,
    opts: { requireMfa: boolean },
  ): Promise<ReauthResult> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, passwordHash: true, mfaEnabled: true },
    });
    if (!user) throw new UnauthorizedException("Re-autenticación fallida");

    // Componente 1+2 (§11.200): identidad + contraseña. Mensaje neutro: no se
    // distingue "contraseña vacía" de "incorrecta" más de lo necesario.
    if (!user.passwordHash || !creds.password || !(await this.passwords.verify(user.passwordHash, creds.password))) {
      throw new UnauthorizedException("Re-autenticación fallida: contraseña inválida");
    }

    let method: SignatureMethod = "PASSWORD";
    if (opts.requireMfa) {
      if (!user.mfaEnabled) {
        throw new BadRequestException("La firma exige MFA, pero su cuenta no tiene un segundo factor activo");
      }
      if (!creds.mfaCode) {
        throw new UnauthorizedException("Se requiere el segundo factor para firmar");
      }
      // Lanza si el TOTP/recovery es inválido (consume el recovery si aplica).
      await this.mfa.assertSecondFactor(userId, creds.mfaCode);
      method = "PASSWORD_MFA";
    }

    return { method, signerName: user.displayName ?? user.email };
  }
}
