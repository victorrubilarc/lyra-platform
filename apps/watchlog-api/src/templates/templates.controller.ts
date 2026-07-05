import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  assignTemplateRoleScopeRequestSchema,
  createTemplateRequestSchema,
  publishTemplateRequestSchema,
  saveTemplateDraftRequestSchema,
  templateListQuerySchema,
  updateTemplateRequestSchema,
  type AssignTemplateRoleScopeRequest,
  type CreateTemplateRequest,
  type PublishTemplateRequest,
  type SaveTemplateDraftRequest,
  type TemplateListQuery,
  type UpdateTemplateRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TemplatesService } from "./templates.service";
import { RequireModule } from "../licensing/module-entitlement.guard";

@RequireModule("templates")
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermission("template:view")
  list(
    @Query(new ZodValidationPipe(templateListQuerySchema)) query: TemplateListQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.templates.list(user.id, query);
  }

  @Get(":id")
  @RequirePermission("template:view")
  get(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Query("versionId") versionId?: string,
  ) {
    return this.templates.getDetail(user.id, id, versionId);
  }

  /** Acceso por ROL de la plantilla (qué roles la ven). Vista recíproca del alcance. */
  @Get(":id/role-scope")
  @RequirePermission("template:edit")
  getRoleScope(@Param("id") id: string) {
    return this.templates.getRoleScope(id);
  }

  @Put(":id/role-scope")
  @RequirePermission("template:edit")
  setRoleScope(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignTemplateRoleScopeRequestSchema)) dto: AssignTemplateRoleScopeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.templates.setRoleScope(id, dto.roleIds, this.ctx(user, req));
  }

  @Post()
  @RequirePermission("template:create")
  create(
    @Body(new ZodValidationPipe(createTemplateRequestSchema)) dto: CreateTemplateRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.templates.create(user.id, dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("template:edit")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTemplateRequestSchema)) dto: UpdateTemplateRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.templates.updateMeta(user.id, id, dto, this.ctx(user, req));
  }

  @Put(":id/draft")
  @RequirePermission("template:edit")
  saveDraft(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveTemplateDraftRequestSchema)) dto: SaveTemplateDraftRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.templates.saveDraft(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/publish")
  @RequirePermission("template:publish")
  publish(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(publishTemplateRequestSchema)) dto: PublishTemplateRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.templates.publish(user.id, id, dto, this.ctx(user, req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("template:delete")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.templates.remove(id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
