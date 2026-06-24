import { Body, Controller, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  adminResetPasswordRequestSchema,
  assignAdminStructuresRequestSchema,
  assignRolesRequestSchema,
  assignScopeRequestSchema,
  assignTemplateScopeRequestSchema,
  createUserRequestSchema,
  updateUserRequestSchema,
  type AdminResetPasswordRequest,
  type AssignAdminStructuresRequest,
  type AssignRolesRequest,
  type AssignScopeRequest,
  type AssignTemplateScopeRequest,
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

  /** Alcance por PLANTILLA (2.º eje ABAC, Fase 2.8). Reusa el permiso de scope. */
  @Put(":id/template-scope")
  @RequirePermission("user:assign-scope")
  assignTemplateScope(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignTemplateScopeRequestSchema)) dto: AssignTemplateScopeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.assignTemplateScope(id, dto, this.ctx(user, req));
  }

  /**
   * Administración DELEGADA por estructura del usuario (L2b): qué estructuras puede
   * ADMINISTRAR. Gateado por `module:structure:manage` (solo el super-admin de
   * estructura reparte delegaciones), no por `user:assign-scope`.
   */
  @Put(":id/admin-structures")
  @RequirePermission("module:structure:manage")
  assignAdminStructures(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignAdminStructuresRequestSchema)) dto: AssignAdminStructuresRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.assignAdminStructures(id, dto, this.ctx(user, req));
  }

  /** Restablece el MFA del usuario (dispositivo perdido). El admin nunca enrola por él. */
  @Post(":id/mfa/reset")
  @RequirePermission("user:reset-mfa")
  resetMfa(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.resetMfa(id, this.ctx(user, req));
  }

  /** Restablece la contraseña del usuario (temporal + cambio forzado + revoca sesiones). */
  @Post(":id/reset-password")
  @RequirePermission("user:reset-password")
  resetPassword(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(adminResetPasswordRequestSchema)) dto: AdminResetPasswordRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.users.resetPassword(id, dto.password, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
