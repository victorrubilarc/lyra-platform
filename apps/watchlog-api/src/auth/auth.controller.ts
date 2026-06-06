import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  changePasswordRequestSchema,
  forgotPasswordRequestSchema,
  loginRequestSchema,
  mfaChallengeRequestSchema,
  mfaDisableRequestSchema,
  mfaRegenerateRequestSchema,
  mfaVerifyRequestSchema,
  resetPasswordRequestSchema,
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  type LoginRequest,
  type LoginResponse,
  type MfaActivatedResponse,
  type MfaChallengeRequest,
  type MfaDisableRequest,
  type MfaRegenerateRequest,
  type MfaSetupResponse,
  type MfaVerifyRequest,
  type RefreshResponse,
  type ResetPasswordRequest,
  type SessionInfo,
} from "@lyra/contracts";
import type { Env } from "../config/env.schema";
import type { AuditContext } from "../audit/audit.service";
import { AllowPendingEnrollment, CurrentUser, Public } from "../authz/authz.decorators";
import type { RequestUser } from "../authz/auth-user";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthService, type LoginResult } from "./auth.service";
import { PasswordResetService } from "./password-reset.service";
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from "./auth.cookies";
import { CsrfGuard } from "./csrf.guard";
import type { RequestMeta } from "./token.service";

type ReqWithCookies = FastifyRequest & { cookies?: Record<string, string>; user?: RequestUser };

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly resets: PasswordResetService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // --- Login y sesión ---

  @Public()
  @Post("login")
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginRequestSchema)) dto: LoginRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const result = await this.auth.login(dto, this.meta(req));
    return this.respondLogin(result, reply);
  }

  @Public()
  @Post("mfa/challenge")
  @HttpCode(200)
  async mfaChallenge(
    @Body(new ZodValidationPipe(mfaChallengeRequestSchema)) dto: MfaChallengeRequest,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const result = await this.auth.completeMfaChallenge(dto, this.meta(req));
    return this.respondLogin(result, reply);
  }

  @Public()
  @UseGuards(CsrfGuard)
  @Post("refresh")
  @HttpCode(200)
  async refresh(
    @Req() req: ReqWithCookies,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<RefreshResponse> {
    const raw = req.cookies?.[REFRESH_COOKIE];
    if (!raw) throw new UnauthorizedException("No hay sesión que refrescar");
    const issued = await this.auth.refresh(raw, this.meta(req));
    this.writeCookies(reply, issued.refreshToken);
    return { accessToken: issued.accessToken, expiresIn: issued.expiresIn };
  }

  @AllowPendingEnrollment()
  @UseGuards(CsrfGuard)
  @Post("logout")
  @HttpCode(204)
  async logout(
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    await this.auth.logout(user.sessionId, this.auditCtx(user, req));
    clearAuthCookies(reply, { domain: this.config.get("COOKIE_DOMAIN", { infer: true }) });
  }

  @AllowPendingEnrollment()
  @Get("me")
  async me(@CurrentUser() user: RequestUser): Promise<SessionInfo> {
    return this.auth.getSessionInfo(user.id);
  }

  // --- Contraseña propia ---

  @AllowPendingEnrollment()
  @Post("change-password")
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordRequestSchema)) dto: ChangePasswordRequest,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.auth.changePassword(
      user.id,
      dto.currentPassword,
      dto.newPassword,
      this.auditCtx(user, req),
    );
  }

  // --- Recuperación de contraseña self-service (público) ---

  @Public()
  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordRequestSchema)) dto: ForgotPasswordRequest,
    @Req() req: FastifyRequest,
  ): Promise<ForgotPasswordResponse> {
    // Respuesta neutra SIEMPRE (no se revela si el correo existe).
    await this.resets.requestReset(dto.email, this.meta(req));
    return { ok: true };
  }

  @Public()
  @Post("reset-password")
  @HttpCode(204)
  async resetPassword(
    @Body(new ZodValidationPipe(resetPasswordRequestSchema)) dto: ResetPasswordRequest,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.resets.resetPassword(dto.token, dto.newPassword, this.meta(req));
  }

  // --- MFA (enrolamiento del propio usuario) ---

  @AllowPendingEnrollment()
  @Post("mfa/setup")
  @HttpCode(200)
  async mfaSetup(@CurrentUser() user: RequestUser): Promise<MfaSetupResponse> {
    return this.auth.setupMfa(user.id, user.email);
  }

  @AllowPendingEnrollment()
  @Post("mfa/verify")
  @HttpCode(200)
  async mfaVerify(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(mfaVerifyRequestSchema)) dto: MfaVerifyRequest,
    @Req() req: FastifyRequest,
  ): Promise<MfaActivatedResponse> {
    const recoveryCodes = await this.auth.activateMfa(user.id, dto.totp, this.auditCtx(user, req));
    return { recoveryCodes };
  }

  @Post("mfa/disable")
  @HttpCode(204)
  async mfaDisable(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(mfaDisableRequestSchema)) dto: MfaDisableRequest,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.auth.disableMfa(user.id, dto.password, this.auditCtx(user, req));
  }

  @Post("mfa/recovery-codes/regenerate")
  @HttpCode(200)
  async mfaRegenerate(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(mfaRegenerateRequestSchema)) dto: MfaRegenerateRequest,
    @Req() req: FastifyRequest,
  ): Promise<MfaActivatedResponse> {
    const recoveryCodes = await this.auth.regenerateRecoveryCodes(
      user.id,
      dto.password,
      this.auditCtx(user, req),
    );
    return { recoveryCodes };
  }

  // --- helpers ---

  private respondLogin(result: LoginResult, reply: FastifyReply): LoginResponse {
    if (result.kind === "mfa_required") {
      return { result: "mfa_required", mfaToken: result.mfaToken };
    }
    this.writeCookies(reply, result.refreshToken);
    return {
      result: "authenticated",
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      session: result.session,
    };
  }

  private writeCookies(reply: FastifyReply, refreshToken: string): void {
    setAuthCookies(reply, refreshToken, {
      secure: this.config.get("COOKIE_SECURE", { infer: true }),
      domain: this.config.get("COOKIE_DOMAIN", { infer: true }),
      refreshTtlSeconds: this.config.get("JWT_REFRESH_TTL", { infer: true }),
    });
  }

  private meta(req: FastifyRequest): RequestMeta {
    return { ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }

  private auditCtx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
