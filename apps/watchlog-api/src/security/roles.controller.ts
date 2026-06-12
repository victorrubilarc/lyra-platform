import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  assignTemplateScopeRequestSchema,
  createRoleRequestSchema,
  updateRoleRequestSchema,
  type AssignTemplateScopeRequest,
  type CreateRoleRequest,
  type UpdateRoleRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { RolesService } from "./roles.service";

@Controller("security/roles")
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermission("role:read")
  list() {
    return this.roles.list();
  }

  @Get(":id")
  @RequirePermission("role:read")
  get(@Param("id") id: string) {
    return this.roles.get(id);
  }

  @Post()
  @RequirePermission("role:manage")
  create(
    @Body(new ZodValidationPipe(createRoleRequestSchema)) dto: CreateRoleRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.roles.create(dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("role:manage")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateRoleRequestSchema)) dto: UpdateRoleRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.roles.update(id, dto, this.ctx(user, req));
  }

  /** Alcance por PLANTILLA del rol (2.º eje ABAC, Fase 2.8). */
  @Put(":id/template-scope")
  @RequirePermission("role:manage")
  assignTemplateScope(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignTemplateScopeRequestSchema)) dto: AssignTemplateScopeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.roles.assignTemplateScope(id, dto, this.ctx(user, req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("role:manage")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.roles.remove(id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
