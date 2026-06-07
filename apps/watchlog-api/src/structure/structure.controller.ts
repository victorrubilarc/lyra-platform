import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  createOrgLevelRequestSchema,
  createOrgNodeRequestSchema,
  updateOrgLevelRequestSchema,
  updateOrgNodeRequestSchema,
  type CreateOrgLevelRequest,
  type CreateOrgNodeRequest,
  type UpdateOrgLevelRequest,
  type UpdateOrgNodeRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StructureService } from "./structure.service";

@Controller("structure")
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  // --- Niveles ---

  @Get("levels")
  @RequirePermission("orgnode:read")
  listLevels() {
    return this.structure.listLevels();
  }

  @Post("levels")
  @RequirePermission("orglevel:manage")
  createLevel(
    @Body(new ZodValidationPipe(createOrgLevelRequestSchema)) dto: CreateOrgLevelRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.createLevel(dto, this.ctx(user, req));
  }

  @Patch("levels/:id")
  @RequirePermission("orglevel:manage")
  updateLevel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrgLevelRequestSchema)) dto: UpdateOrgLevelRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.updateLevel(id, dto, this.ctx(user, req));
  }

  @Delete("levels/:id")
  @HttpCode(204)
  @RequirePermission("orglevel:manage")
  async deleteLevel(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.structure.deleteLevel(id, this.ctx(user, req));
  }

  // --- Nodos ---

  @Get("nodes")
  @RequirePermission("orgnode:read")
  getTree() {
    return this.structure.getTree();
  }

  @Post("nodes")
  @RequirePermission("orgnode:create")
  createNode(
    @Body(new ZodValidationPipe(createOrgNodeRequestSchema)) dto: CreateOrgNodeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.createNode(dto, this.ctx(user, req));
  }

  @Patch("nodes/:id")
  @RequirePermission("orgnode:edit")
  updateNode(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrgNodeRequestSchema)) dto: UpdateOrgNodeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.updateNode(id, dto, this.ctx(user, req));
  }

  @Delete("nodes/:id")
  @HttpCode(204)
  @RequirePermission("orgnode:delete")
  async deleteNode(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.structure.deleteNode(id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
