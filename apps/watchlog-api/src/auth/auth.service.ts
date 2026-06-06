import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type {
  LoginRequest,
  MfaChallengeRequest,
  SessionInfo,
} from "@lyra/contracts";
import type { Env } from "../config/env.schema";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PasswordService } from "../crypto/password.service";
import { PermissionService } from "../authz/permission.service";
import { ScopeService } from "../authz/scope.service";
import { PrismaService } from "../prisma/prisma.service";
import { LocalAuthProvider } from "./providers/local-auth.provider";
import { MfaService } from "./mfa.service";
import { MfaRequirementService } from "./mfa-requirement.service";
import { PasswordPolicyService } from "./password-policy.service";
import { PasswordResetService } from "./password-reset.service";
import { TokenService, type RequestMeta } from "./token.service";

const GENERIC_INVALID = "Credenciales inválidas";

/** Resultado del login: o sesión iniciada (con refresh para la cookie) o reto MFA. */
export type LoginResult =
  | {
      kind: "authenticated";
      accessToken: string;
      expiresIn: number;
      session: SessionInfo;
      refreshToken: string;
    }
  | { kind: "mfa_required"; mfaToken: string };

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly local: LocalAuthProvider,
    private readonly tokens: TokenService,
    private readonly mfa: MfaService,
    private readonly mfaRequirement: MfaRequirementService,
    private readonly policy: PasswordPolicyService,
    private readonly resets: PasswordResetService,
    private readonly passwords: PasswordService,
    private readonly permissions: PermissionService,
    private readonly scope: ScopeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  //  Login
  // -------------------------------------------------------------------------

  async login(dto: LoginRequest, meta: RequestMeta): Promise<LoginResult> {
    const email = dto.email.trim().toLowerCase();
    const ctx: AuditContext = { actorEmail: email, ip: meta.ip, userAgent: meta.userAgent };

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      await this.local.burnTiming(dto.password); // timing constante
      await this.audit.record({ ...ctx, action: "auth.login.failure", metadata: { reason: "unknown_user" } });
      throw new UnauthorizedException(GENERIC_INVALID);
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.audit.record({ ...ctx, actorId: user.id, action: "auth.login.locked" });
      throw new UnauthorizedException("Cuenta bloqueada temporalmente. Intenta más tarde.");
    }

    const valid = await this.local.verifyCredentials(user, dto.password);
    if (!valid) {
      await this.registerFailure(user.id, user.failedLoginCount);
      await this.audit.record({ ...ctx, actorId: user.id, action: "auth.login.failure", metadata: { reason: "bad_password" } });
      throw new UnauthorizedException(GENERIC_INVALID);
    }

    if (user.status === "DISABLED") {
      await this.audit.record({ ...ctx, actorId: user.id, action: "auth.login.disabled" });
      throw new ForbiddenException("Cuenta deshabilitada");
    }

    await this.resetFailures(user.id, user.failedLoginCount, user.lockedUntil);

    if (user.mfaEnabled) {
      if (dto.totp) {
        await this.verifySecondFactor(user, dto.totp, ctx);
        return this.finalizeLogin(user.id, user.email, meta, ctx);
      }
      const mfaToken = await this.jwt.signAsync(
        { sub: user.id, purpose: "mfa" },
        { secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }), expiresIn: 300 },
      );
      await this.audit.record({ ...ctx, actorId: user.id, action: "auth.login.mfa_challenge" });
      return { kind: "mfa_required", mfaToken };
    }

    return this.finalizeLogin(user.id, user.email, meta, ctx);
  }

  /** Segundo paso del login cuando se exigió MFA. */
  async completeMfaChallenge(dto: MfaChallengeRequest, meta: RequestMeta): Promise<LoginResult> {
    let sub: string;
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; purpose: string }>(dto.mfaToken, {
        secret: this.config.get("JWT_REFRESH_SECRET", { infer: true }),
      });
      if (payload.purpose !== "mfa") throw new Error("bad purpose");
      sub = payload.sub;
    } catch {
      throw new UnauthorizedException("Reto MFA inválido o expirado");
    }

    const user = await this.prisma.user.findUnique({ where: { id: sub } });
    if (!user || user.status === "DISABLED") throw new UnauthorizedException(GENERIC_INVALID);

    const ctx: AuditContext = {
      actorId: user.id,
      actorEmail: user.email,
      ip: meta.ip,
      userAgent: meta.userAgent,
    };
    await this.verifySecondFactor(user, dto.totp, ctx);
    return this.finalizeLogin(user.id, user.email, meta, ctx);
  }

  private async finalizeLogin(
    userId: string,
    email: string,
    meta: RequestMeta,
    ctx: AuditContext,
  ): Promise<LoginResult> {
    const issued = await this.tokens.issueSession({ id: userId, email }, meta);
    await this.prisma.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    await this.audit.record({ ...ctx, action: "auth.login.success", metadata: { sessionId: issued.sessionId } });
    const session = await this.getSessionInfo(userId);
    return {
      kind: "authenticated",
      accessToken: issued.accessToken,
      expiresIn: issued.expiresIn,
      session,
      refreshToken: issued.refreshToken,
    };
  }

  // -------------------------------------------------------------------------
  //  Sesión / refresh / logout
  // -------------------------------------------------------------------------

  async refresh(rawToken: string, meta: RequestMeta): Promise<{ accessToken: string; expiresIn: number; refreshToken: string }> {
    const issued = await this.tokens.rotate(rawToken, meta);
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn, refreshToken: issued.refreshToken };
  }

  async logout(sessionId: string, ctx: AuditContext): Promise<void> {
    await this.tokens.revokeSession(sessionId);
    await this.audit.record({ ...ctx, action: "auth.logout", metadata: { sessionId } });
  }

  /** Perfil + permisos efectivos + alcance para `/auth/me` y el login. */
  async getSessionInfo(userId: string): Promise<SessionInfo> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, displayName: true, mfaEnabled: true, forcePasswordChange: true },
    });
    const permissions = [...(await this.permissions.getEffectivePermissions(userId))];
    const nodeIds = await this.scope.getAccessibleNodeIds(userId);
    const mfaRequired = await this.mfaRequirement.isRequiredForUser(user.id);
    const mfaEnrollmentRequired = mfaRequired && !user.mfaEnabled;
    return {
      user: { ...user, mfaRequired, mfaEnrollmentRequired },
      permissions,
      scope: { orgNodeIds: nodeIds === null ? null : [...nodeIds] },
    };
  }

  // -------------------------------------------------------------------------
  //  Contraseña y MFA del propio usuario
  // -------------------------------------------------------------------------

  async changePassword(userId: string, current: string, next: string, ctx: AuditContext): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await this.passwords.verify(user.passwordHash, current))) {
      throw new UnauthorizedException("La contraseña actual no es correcta");
    }
    await this.policy.assertComplexity(next);
    await this.policy.assertNotReused(userId, next);
    const passwordHash = await this.passwords.hash(next);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, forcePasswordChange: false },
    });
    await this.policy.recordHistory(userId, passwordHash);
    // Cualquier enlace de restablecimiento emitido antes queda invalidado.
    await this.resets.invalidatePending(userId);
    await this.audit.record({ ...ctx, action: "auth.password.changed" });
  }

  async setupMfa(userId: string, email: string): Promise<{ secret: string; otpauthUrl: string }> {
    return this.mfa.setup(userId, email);
  }

  async activateMfa(userId: string, totp: string, ctx: AuditContext): Promise<string[]> {
    const codes = await this.mfa.verifyAndActivate(userId, totp);
    await this.audit.record({ ...ctx, action: "auth.mfa.enabled" });
    return codes;
  }

  async disableMfa(userId: string, password: string, ctx: AuditContext): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new BadRequestException("La contraseña no es correcta");
    }
    // Un factor EXIGIDO por la política no se puede auto-desactivar (sería un
    // downgrade de AAL). Si perdió el dispositivo, un admin lo restablece.
    if (await this.mfaRequirement.isRequiredForUser(userId)) {
      throw new ForbiddenException(
        "Tu rol exige verificación en dos pasos; no puedes desactivarla. Pide a un administrador que la restablezca si perdiste el dispositivo.",
      );
    }
    await this.mfa.disable(userId);
    await this.audit.record({ ...ctx, action: "auth.mfa.disabled" });
  }

  /**
   * RESET de MFA por un administrador (dispositivo perdido). El admin NUNCA
   * enrola por el usuario: solo limpia su segundo factor. Borra secreto+códigos,
   * desactiva MFA y **revoca TODAS las sesiones** del objetivo, para que ninguna
   * sesión rancia siga operando con el AAL anterior. Si su rol sigue exigiendo
   * MFA, en el próximo login caerá al gate de enrolamiento forzado.
   */
  async adminResetMfa(targetUserId: string, ctx: AuditContext): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, mfaEnabled: true },
    });
    if (!target) throw new NotFoundException("Usuario no encontrado");
    await this.mfa.disable(targetUserId);
    await this.tokens.revokeAllForUser(targetUserId);
    await this.audit.record({
      ...ctx,
      action: "auth.mfa.admin_reset",
      entityType: "User",
      entityId: targetUserId,
      before: { mfaEnabled: target.mfaEnabled },
    });
  }

  /** Regenera los códigos de recuperación (reconfirmando contraseña). */
  async regenerateRecoveryCodes(userId: string, password: string, ctx: AuditContext): Promise<string[]> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.passwordHash || !(await this.passwords.verify(user.passwordHash, password))) {
      throw new BadRequestException("La contraseña no es correcta");
    }
    const codes = await this.mfa.regenerateRecoveryCodes(userId);
    await this.audit.record({ ...ctx, action: "auth.mfa.recovery_regenerated" });
    return codes;
  }

  // -------------------------------------------------------------------------
  //  Throttle del SEGUNDO factor (contador persistente, separado del de password)
  // -------------------------------------------------------------------------

  /**
   * Verifica el segundo factor con protección contra fuerza bruta (NIST 800-63B
   * §5.2.2 / OWASP ASVS §2.2.1). Tras `maxFailedAttempts` fallos, bloquea durante
   * `lockoutMinutes`. El contador es propio de MFA: una contraseña correcta no lo
   * reinicia (eso debilitaría el tope del segundo factor).
   */
  private async verifySecondFactor(
    user: { id: string; mfaFailedCount: number; mfaLockedUntil: Date | null },
    code: string,
    ctx: AuditContext,
  ): Promise<void> {
    if (user.mfaLockedUntil && user.mfaLockedUntil > new Date()) {
      await this.audit.record({ ...ctx, action: "auth.mfa.locked" });
      throw new UnauthorizedException("Demasiados intentos de verificación. Intenta más tarde.");
    }
    try {
      await this.mfa.assertSecondFactor(user.id, code);
    } catch {
      await this.registerMfaFailure(user.id, user.mfaFailedCount);
      await this.audit.record({ ...ctx, action: "auth.mfa.challenge_failed" });
      throw new UnauthorizedException("Segundo factor inválido");
    }
    await this.resetMfaFailures(user.id, user.mfaFailedCount, user.mfaLockedUntil);
  }

  private async registerMfaFailure(userId: string, current: number): Promise<void> {
    const policy = await this.policy.getPolicy();
    const next = current + 1;
    if (next >= policy.maxFailedAttempts) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          mfaFailedCount: 0,
          mfaLockedUntil: new Date(Date.now() + policy.lockoutMinutes * 60_000),
        },
      });
    } else {
      await this.prisma.user.update({ where: { id: userId }, data: { mfaFailedCount: next } });
    }
  }

  private async resetMfaFailures(
    userId: string,
    current: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    if (current === 0 && lockedUntil === null) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaFailedCount: 0, mfaLockedUntil: null },
    });
  }

  // -------------------------------------------------------------------------
  //  Lockout por fuerza bruta (contador persistente en BD)
  // -------------------------------------------------------------------------

  private async registerFailure(userId: string, current: number): Promise<void> {
    const policy = await this.policy.getPolicy();
    const next = current + 1;
    if (next >= policy.maxFailedAttempts) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + policy.lockoutMinutes * 60_000),
        },
      });
    } else {
      await this.prisma.user.update({ where: { id: userId }, data: { failedLoginCount: next } });
    }
  }

  private async resetFailures(
    userId: string,
    current: number,
    lockedUntil: Date | null,
  ): Promise<void> {
    if (current === 0 && lockedUntil === null) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }
}
