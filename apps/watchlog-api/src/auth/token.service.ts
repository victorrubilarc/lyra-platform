import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, randomUUID } from "node:crypto";
import type { Env } from "../config/env.schema";
import { EncryptionService } from "../crypto/encryption.service";
import { PrismaService } from "../prisma/prisma.service";

/** Contexto de petición para sesiones y auditoría. */
export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Par de tokens recién emitido. El refresh va en claro SOLO una vez (cookie). */
export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  sessionId: string;
}

/**
 * Emisión y rotación de tokens. El access es un JWT corto (header Bearer); el
 * refresh es un secreto opaco cuyo hash SHA-256 se guarda en BD. Rotación con
 * familia y detección de reuso: si un refresh ya rotado se vuelve a presentar,
 * se revoca toda la familia (señal de robo de token).
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly enc: EncryptionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get accessTtl(): number {
    return this.config.get("JWT_ACCESS_TTL", { infer: true });
  }

  private get refreshTtlMs(): number {
    return this.config.get("JWT_REFRESH_TTL", { infer: true }) * 1000;
  }

  private signAccess(userId: string, email: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId, email, sid: sessionId });
  }

  private newRawToken(): string {
    return randomBytes(32).toString("base64url");
  }

  /** Crea una sesión nueva con su primer refresh token. */
  async issueSession(
    user: { id: string; email: string },
    meta: RequestMeta,
  ): Promise<IssuedTokens> {
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
      },
    });

    const raw = this.newRawToken();
    await this.prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        tokenHash: this.enc.sha256(raw),
        familyId: randomUUID(),
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });

    const accessToken = await this.signAccess(user.id, user.email, session.id);
    return { accessToken, refreshToken: raw, expiresIn: this.accessTtl, sessionId: session.id };
  }

  /**
   * Rota un refresh token. Lanza Unauthorized si es inválido/expirado/revocado.
   * Si detecta reuso de un token ya rotado, revoca toda la familia.
   */
  async rotate(rawToken: string, _meta: RequestMeta): Promise<IssuedTokens> {
    const tokenHash = this.enc.sha256(rawToken);
    const token = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { session: true, user: { select: { id: true, email: true } } },
    });

    if (!token || token.revokedAt) {
      throw new UnauthorizedException("Refresh token inválido");
    }

    // Reuso de un token ya rotado: posible robo. Revocar la familia entera.
    if (token.usedAt) {
      await this.revokeFamily(token.familyId);
      throw new UnauthorizedException("Refresh token reutilizado: sesión revocada");
    }

    if (token.expiresAt < new Date() || token.session.revokedAt) {
      throw new UnauthorizedException("Sesión expirada o revocada");
    }

    const raw = this.newRawToken();
    const created = await this.prisma.refreshToken.create({
      data: {
        sessionId: token.sessionId,
        userId: token.userId,
        tokenHash: this.enc.sha256(raw),
        familyId: token.familyId,
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
      },
    });

    await this.prisma.refreshToken.update({
      where: { id: token.id },
      data: { usedAt: new Date(), replacedById: created.id },
    });
    await this.prisma.session.update({
      where: { id: token.sessionId },
      data: { lastSeenAt: new Date() },
    });

    const accessToken = await this.signAccess(token.user.id, token.user.email, token.sessionId);
    return {
      accessToken,
      refreshToken: raw,
      expiresIn: this.accessTtl,
      sessionId: token.sessionId,
    };
  }

  /** Revoca una sesión y todos sus refresh tokens (logout). */
  async revokeSession(sessionId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { sessionId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: now } }),
    ]);
  }

  /**
   * Revoca TODAS las sesiones y refresh tokens vigentes de un usuario. Se usa al
   * restablecer la contraseña (posible recuperación de un compromiso): cualquier
   * sesión existente queda invalidada de inmediato.
   */
  async revokeAllForUser(userId: string): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  /** Revoca toda una familia de refresh tokens y su sesión (reuso detectado). */
  async revokeFamily(familyId: string): Promise<void> {
    const now = new Date();
    const tokens = await this.prisma.refreshToken.findMany({
      where: { familyId },
      select: { sessionId: true },
      take: 1,
    });
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    const sessionId = tokens[0]?.sessionId;
    if (sessionId) {
      await this.prisma.session.update({ where: { id: sessionId }, data: { revokedAt: now } });
    }
  }
}
