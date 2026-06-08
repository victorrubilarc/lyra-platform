import { Body, Controller, Get, Put, Query } from "@nestjs/common";
import {
  PERMISSION_CATALOG,
  updatePasswordPolicyRequestSchema,
  type AuditLogEntry,
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
  async audit_(
    @Query("take") take?: string,
    @Query("cursor") cursor?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("action") action?: string,
    @Query("actor") actor?: string,
    @Query("entityType") entityType?: string,
  ): Promise<AuditLogEntry[]> {
    const parseDate = (v?: string): Date | undefined => {
      if (!v) return undefined;
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const rows = await this.audit.list({
      take: take ? Number(take) : undefined,
      cursor,
      from: parseDate(from),
      to: parseDate(to),
      action: action?.trim() || undefined,
      actor: actor?.trim() || undefined,
      entityType: entityType?.trim() || undefined,
    });
    return rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt.toISOString(),
      actorId: r.actorId,
      actorEmail: r.actorEmail,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      before: r.before ?? null,
      after: r.after ?? null,
      ip: r.ip,
      userAgent: r.userAgent,
      metadata: r.metadata ?? null,
    }));
  }
}
