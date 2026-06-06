import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import type { RequestUser } from "./auth-user";
import { ALLOW_PENDING_ENROLLMENT_KEY, IS_PUBLIC_KEY } from "./authz.decorators";

/**
 * Hace cumplir el ENROLAMIENTO FORZADO de MFA en el backend (no solo en la UI).
 * Si el access token trae `mfaPending`, la sesión está limitada al enrolamiento:
 * cualquier endpoint que no esté marcado con @AllowPendingEnrollment recibe 403
 * con `code: "MFA_ENROLLMENT_REQUIRED"`, para que el frontend desvíe al gate.
 *
 * Sin esto, un usuario con credenciales válidas cuyo rol exige MFA podría operar
 * solo con contraseña llamando la API directo: un downgrade de AAL2 a AAL1.
 *
 * Es el tercer guard global (tras Jwt y Permisos). El claim `mfaPending` se
 * recalcula en cada emisión/rotación del token, así que al terminar el
 * enrolamiento un `/auth/refresh` entrega un token sin la marca.
 */
@Injectable()
export class MfaEnrollmentGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();
    if (!req.user?.mfaPending) return true;

    const allowed = this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING_ENROLLMENT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed) return true;

    throw new ForbiddenException({
      code: "MFA_ENROLLMENT_REQUIRED",
      message: "Debes activar la verificación en dos pasos (MFA) antes de continuar.",
    });
  }
}
