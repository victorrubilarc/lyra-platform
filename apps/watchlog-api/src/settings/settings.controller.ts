import { Body, Controller, Get, Patch, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { updateSystemSettingsRequestSchema, type UpdateSystemSettingsRequest } from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SettingsService } from "./settings.service";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @RequirePermission("module:settings:view")
  get() {
    return this.settings.get();
  }

  @Patch()
  @RequirePermission("settings:manage")
  update(
    @Body(new ZodValidationPipe(updateSystemSettingsRequestSchema)) dto: UpdateSystemSettingsRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.settings.update(dto, user.id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
