import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { JwtModule } from "@nestjs/jwt";
import type { Env } from "../config/env.schema";
import { JwtAccessGuard } from "./jwt-access.guard";
import { PermissionsGuard } from "./permissions.guard";
import { MfaEnrollmentGuard } from "./mfa-enrollment.guard";
import { PermissionService } from "./permission.service";
import { ScopeService } from "./scope.service";

/**
 * Autorización transversal. Registra tres guards GLOBALES en orden:
 *  1. JwtAccessGuard      — exige access token válido (salvo @Public()).
 *  2. PermissionsGuard    — exige los permisos de @RequirePermission.
 *  3. MfaEnrollmentGuard  — limita la sesión al enrolamiento si MFA está pendiente.
 * Expone PermissionService y ScopeService para usarse en services de negocio.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get("JWT_ACCESS_SECRET", { infer: true }),
        signOptions: { expiresIn: config.get("JWT_ACCESS_TTL", { infer: true }) },
      }),
    }),
  ],
  providers: [
    PermissionService,
    ScopeService,
    { provide: APP_GUARD, useClass: JwtAccessGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_GUARD, useClass: MfaEnrollmentGuard },
  ],
  exports: [PermissionService, ScopeService, JwtModule],
})
export class AuthzModule {}
