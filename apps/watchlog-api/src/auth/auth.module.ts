import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MfaService } from "./mfa.service";
import { PasswordPolicyService } from "./password-policy.service";
import { TokenService } from "./token.service";
import { CsrfGuard } from "./csrf.guard";
import { LocalAuthProvider } from "./providers/local-auth.provider";

/**
 * Autenticación: login local (Argon2id), sesiones con refresh rotativo y
 * detección de reuso, MFA TOTP, cambio de contraseña. La autorización (guards,
 * permisos, scope) vive en AuthzModule, que es global.
 */
@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    MfaService,
    PasswordPolicyService,
    CsrfGuard,
    LocalAuthProvider,
  ],
  exports: [AuthService, PasswordPolicyService],
})
export class AuthModule {}
