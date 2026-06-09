import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  createWorkflowRequestSchema,
  publishWorkflowRequestSchema,
  saveWorkflowDraftRequestSchema,
  updateWorkflowRequestSchema,
  workflowListQuerySchema,
  type CreateWorkflowRequest,
  type PublishWorkflowRequest,
  type SaveWorkflowDraftRequest,
  type UpdateWorkflowRequest,
  type WorkflowListQuery,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WorkflowsService } from "./workflows.service";

@Controller("workflows")
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  @RequirePermission("workflow:view")
  list(@Query(new ZodValidationPipe(workflowListQuerySchema)) query: WorkflowListQuery) {
    return this.workflows.list(query);
  }

  @Get(":id")
  @RequirePermission("workflow:view")
  get(@Param("id") id: string, @Query("versionId") versionId?: string) {
    return this.workflows.getDetail(id, versionId);
  }

  @Post()
  @RequirePermission("workflow:manage")
  create(
    @Body(new ZodValidationPipe(createWorkflowRequestSchema)) dto: CreateWorkflowRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workflows.create(user.id, dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("workflow:manage")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkflowRequestSchema)) dto: UpdateWorkflowRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workflows.updateMeta(id, dto, this.ctx(user, req));
  }

  @Put(":id/draft")
  @RequirePermission("workflow:manage")
  saveDraft(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(saveWorkflowDraftRequestSchema)) dto: SaveWorkflowDraftRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workflows.saveDraft(id, dto, this.ctx(user, req));
  }

  @Post(":id/publish")
  @RequirePermission("workflow:manage")
  publish(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(publishWorkflowRequestSchema)) dto: PublishWorkflowRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workflows.publish(user.id, id, dto, this.ctx(user, req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("workflow:manage")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.workflows.remove(id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
