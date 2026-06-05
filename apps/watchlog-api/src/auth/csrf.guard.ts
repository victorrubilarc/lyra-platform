import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { CSRF_COOKIE, CSRF_HEADER } from "./auth.cookies";

/**
 * Protección CSRF de doble envío para endpoints que confían en la cookie de
 * refresh (refresh/logout). El cliente debe reenviar el valor de la cookie CSRF
 * (no httpOnly) en el header `x-csrf-token`. Defensa en profundidad sobre el
 * SameSite=Strict de la cookie.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<FastifyRequest & { cookies?: Record<string, string> }>();
    const cookieToken = req.cookies?.[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER];
    if (!cookieToken || typeof headerToken !== "string" || cookieToken !== headerToken) {
      throw new ForbiddenException("Token CSRF inválido o ausente");
    }
    return true;
  }
}
