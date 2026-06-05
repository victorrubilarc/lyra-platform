import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { SecurityController } from "./security.controller";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

/**
 * Administración de seguridad: usuarios, roles/permisos, política de
 * contraseñas y consulta de auditoría. La autorización la aplican los guards
 * globales (AuthzModule) según @RequirePermission de cada endpoint.
 */
@Module({
  imports: [AuthModule], // PasswordPolicyService
  controllers: [UsersController, RolesController, SecurityController],
  providers: [UsersService, RolesService],
})
export class SecurityModule {}
