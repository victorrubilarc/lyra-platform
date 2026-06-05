import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import {
  PERMISSION_CATALOG,
  updatePasswordPolicyRequestSchema,
  type UpdatePasswordPolicyRequest,
} from "@lyra/contracts";
import { AuditService } from "../audit/audit.service";
import { PasswordPolicyService } from "../auth/password-policy.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

/** Endpoints transversales de seguridad: catálogo, política y auditoría. */
@Controller("security")
export class SecurityController {
  constructor(
    private readonly policy: PasswordPolicyService,
    private readonly audit: AuditService,
  ) {}

  /** Catálogo de permisos disponibles (para la UI de roles). */
  @Get("permissions")
  @RequirePermission("role:read")
  permissions() {
    return PERMISSION_CATALOG;
  }

  @Get("password-policy")
  @RequirePermission("security:policy:manage")
  getPolicy() {
    return this.policy.getPolicy();
  }

  @Put("password-policy")
  @RequirePermission("security:policy:manage")
  updatePolicy(
    @Body(new ZodValidationPipe(updatePasswordPolicyRequestSchema)) dto: UpdatePasswordPolicyRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.policy.updatePolicy(dto, user.id);
  }

  @Get("audit")
  @RequirePermission("audit:read")
  audit_(@Query("take") take?: string, @Query("cursor") cursor?: string) {
    return this.audit.list({ take: take ? Number(take) : undefined, cursor });
  }
}
