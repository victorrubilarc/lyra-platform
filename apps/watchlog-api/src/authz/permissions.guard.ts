import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { FastifyRequest } from "fastify";
import type { RequestUser } from "./auth-user";
import { PERMISSIONS_KEY, PERMISSIONS_MODE_KEY } from "./authz.decorators";
import { PermissionService } from "./permission.service";

/**
 * Autorización (dimensiones 1–3): comprueba que el usuario tenga los permisos
 * exigidos por @RequirePermission / @RequireAnyPermission. Es la fuente de
 * verdad: el frontend solo oculta, aquí se decide de verdad.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    // Sin @RequirePermission => basta con estar autenticado (lo cubre JwtAccessGuard).
    if (!required || required.length === 0) return true;

    const mode =
      this.reflector.getAllAndOverride<"all" | "any">(PERMISSIONS_MODE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? "all";

    const req = context.switchToHttp().getRequest<FastifyRequest & { user?: RequestUser }>();
    if (!req.user) throw new ForbiddenException("No autenticado");

    const held = await this.permissions.getEffectivePermissions(req.user.id);
    const ok =
      mode === "any"
        ? required.some((k) => held.has(k))
        : required.every((k) => held.has(k));

    if (!ok) throw new ForbiddenException("No tienes permiso para esta acción");
    return true;
  }
}
