import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  createReferenceItemRequestSchema,
  createReferenceListRequestSchema,
  updateReferenceItemRequestSchema,
  updateReferenceListRequestSchema,
  type CreateReferenceItemRequest,
  type CreateReferenceListRequest,
  type UpdateReferenceItemRequest,
  type UpdateReferenceListRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ReferenceListsService } from "./reference-lists.service";

@Controller("reference-lists")
export class ReferenceListsController {
  constructor(private readonly lists: ReferenceListsService) {}

  // --- Listas ---

  @Get()
  @RequirePermission("referencelist:view")
  list() {
    return this.lists.list();
  }

  @Get(":id")
  @RequirePermission("referencelist:view")
  getDetail(@Param("id") id: string) {
    return this.lists.getDetail(id);
  }

  /** Resuelve los ítems activos de una lista (por id o key) para pickers/preview. */
  @Get(":idOrKey/resolve")
  @RequirePermission("referencelist:view")
  resolve(@Param("idOrKey") idOrKey: string) {
    return this.lists.resolve(idOrKey);
  }

  @Post()
  @RequirePermission("referencelist:manage")
  create(
    @Body(new ZodValidationPipe(createReferenceListRequestSchema)) dto: CreateReferenceListRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.lists.create(dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("referencelist:manage")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateReferenceListRequestSchema)) dto: UpdateReferenceListRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.lists.update(id, dto, this.ctx(user, req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("referencelist:manage")
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.lists.remove(id, this.ctx(user, req));
  }

  // --- Ítems ---

  @Post(":id/items")
  @RequirePermission("referencelist:manage")
  createItem(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createReferenceItemRequestSchema)) dto: CreateReferenceItemRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.lists.createItem(id, dto, this.ctx(user, req));
  }

  @Patch(":id/items/:itemId")
  @RequirePermission("referencelist:manage")
  updateItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateReferenceItemRequestSchema)) dto: UpdateReferenceItemRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.lists.updateItem(id, itemId, dto, this.ctx(user, req));
  }

  @Delete(":id/items/:itemId")
  @HttpCode(204)
  @RequirePermission("referencelist:manage")
  async removeItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.lists.removeItem(id, itemId, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
