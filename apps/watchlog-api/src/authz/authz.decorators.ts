import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { RequestUser } from "./auth-user";

/** Marca un endpoint como público (sin access token). */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Permite el acceso aunque la sesión esté pendiente de enrolar MFA. Solo deben
 * marcarse los endpoints imprescindibles para resolver el gate (ver perfil,
 * cerrar sesión, enrolar/verificar MFA, cambiar contraseña). El resto recibe
 * 403 mientras el enrolamiento esté pendiente. Ver `MfaEnrollmentGuard`.
 */
export const ALLOW_PENDING_ENROLLMENT_KEY = "allowPendingEnrollment";
export const AllowPendingEnrollment = (): MethodDecorator =>
  SetMetadata(ALLOW_PENDING_ENROLLMENT_KEY, true);

/**
 * Exige uno o más permisos para acceder al handler. Semántica AND: el usuario
 * debe tener TODOS los permisos listados. Para OR, usar @RequireAnyPermission.
 */
export const PERMISSIONS_KEY = "requiredPermissions";
export const PERMISSIONS_MODE_KEY = "requiredPermissionsMode";

export const RequirePermission = (...keys: string[]): MethodDecorator & ClassDecorator => {
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(PERMISSIONS_KEY, keys)(target, propertyKey as string, descriptor as never);
    SetMetadata(PERMISSIONS_MODE_KEY, "all")(target, propertyKey as string, descriptor as never);
  };
};

export const RequireAnyPermission = (...keys: string[]): MethodDecorator & ClassDecorator => {
  return (target: object, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(PERMISSIONS_KEY, keys)(target, propertyKey as string, descriptor as never);
    SetMetadata(PERMISSIONS_MODE_KEY, "any")(target, propertyKey as string, descriptor as never);
  };
};

/** Inyecta el usuario autenticado de la request en un parámetro del handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user: RequestUser }>();
    return req.user;
  },
);
