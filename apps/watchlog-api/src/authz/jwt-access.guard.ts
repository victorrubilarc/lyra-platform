import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import type { FastifyRequest } from "fastify";
import type { Env } from "../config/env.schema";
import type { AccessTokenClaims, RequestUser } from "./auth-user";
import { IS_PUBLIC_KEY } from "./authz.decorators";

/**
 * Autenticación: valida el access token (Bearer) y adjunta `req.user`. Los
 * endpoints marcados con @Public() se saltan. Es el primer guard global.
 */
@Injectable()
export class JwtAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();
    const token = this.extractBearer(req);
    if (!token) throw new UnauthorizedException("Falta el token de acceso");

    try {
      const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
        secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
      });
      req.user = {
        id: claims.sub,
        email: claims.email,
        sessionId: claims.sid,
        mfaPending: claims.mfaPending === true,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Token de acceso inválido o expirado");
    }
  }

  private extractBearer(req: FastifyRequest): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(" ");
    return scheme === "Bearer" && value ? value : null;
  }
}
