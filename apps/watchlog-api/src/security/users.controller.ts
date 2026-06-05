import { Body, Controller, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  assignRolesRequestSchema,
  assignScopeRequestSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  type AssignRolesRequest,
  type AssignScopeRequest,
  type CreateUserRequest,
  type UpdateUserRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { UsersService } from "./users.service";

@Controller("security/users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission("user:read")
  list() {
    return this.users.list();
  }

  @Get(":id")
  @RequirePermission("user:read")
  get(@Param("id") id: string) {
    return this.users.get(id);
  }

  @Post()
  @RequirePermission("user:create")
  create(
    @Body(new ZodValidationPipe(createUserRequestSchema)) dto: CreateUserRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.create(dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("user:edit")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateUserRequestSchema)) dto: UpdateUserRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.update(id, dto, this.ctx(user, req));
  }

  @Put(":id/roles")
  @RequirePermission("user:assign-roles")
  assignRoles(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignRolesRequestSchema)) dto: AssignRolesRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.assignRoles(id, dto, this.ctx(user, req));
  }

  @Put(":id/scope")
  @RequirePermission("user:assign-scope")
  assignScope(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignScopeRequestSchema)) dto: AssignScopeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.assignScope(id, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
