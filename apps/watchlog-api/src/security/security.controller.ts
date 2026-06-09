import { Body, Controller, Get, Put, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
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
import { toCsv } from "../common/csv";
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

  private parseDate(v?: string): Date | undefined {
    if (!v) return undefined;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }

  private auditFilters(q: { from?: string; to?: string; action?: string; actor?: string; entityType?: string }) {
    return {
      from: this.parseDate(q.from),
      to: this.parseDate(q.to),
      action: q.action?.trim() || undefined,
      actor: q.actor?.trim() || undefined,
      entityType: q.entityType?.trim() || undefined,
    };
  }

  /** Exporta la auditoría filtrada a CSV (set completo, no solo la página actual). */
  @Get("audit/export")
  @RequirePermission("audit:read")
  async auditExport(
    @Res() reply: FastifyReply,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("action") action?: string,
    @Query("actor") actor?: string,
    @Query("entityType") entityType?: string,
  ): Promise<void> {
    const { rows, truncated } = await this.audit.findForExport(
      this.auditFilters({ from, to, action, actor, entityType }),
    );
    const csv = toCsv(rows, [
      { header: "Fecha (ISO)", value: (r) => r.occurredAt.toISOString() },
      { header: "Acción", value: (r) => r.action },
      { header: "Actor", value: (r) => r.actorEmail },
      { header: "ActorId", value: (r) => r.actorId },
      { header: "Entidad", value: (r) => r.entityType },
      { header: "EntidadId", value: (r) => r.entityId },
      { header: "IP", value: (r) => r.ip },
      { header: "Navegador", value: (r) => r.userAgent },
      { header: "Antes", value: (r) => r.before },
      { header: "Después", value: (r) => r.after },
      { header: "Metadatos", value: (r) => r.metadata },
    ]);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    await reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="auditoria-${stamp}.csv"`)
      .header("X-Export-Truncated", String(truncated))
      .send(csv);
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
    const rows = await this.audit.list({
      take: take ? Number(take) : undefined,
      cursor,
      ...this.auditFilters({ from, to, action, actor, entityType }),
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
