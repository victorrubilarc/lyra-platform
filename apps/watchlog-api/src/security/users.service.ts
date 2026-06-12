import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AssignRolesRequest,
  AssignScopeRequest,
  AssignTemplateScopeRequest,
  CreateUserRequest,
  UpdateUserRequest,
  UserDetail,
  UserSummary,
} from "@lyra/contracts";
import type { Prisma } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PermissionService } from "../authz/permission.service";
import { PasswordService } from "../crypto/password.service";
import { AuthService } from "../auth/auth.service";
import { MfaRequirementService } from "../auth/mfa-requirement.service";
import { PasswordPolicyService } from "../auth/password-policy.service";
import { PrismaService } from "../prisma/prisma.service";

const userInclude = {
  roles: { select: { role: { select: { id: true, name: true } } } },
} satisfies Prisma.UserInclude;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly policy: PasswordPolicyService,
    private readonly permissions: PermissionService,
    private readonly mfaRequirement: MfaRequirementService,
    private readonly auth: AuthService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<UserSummary[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { displayName: "asc" },
      include: userInclude,
    });
    return users.map((u) => this.toSummary(u));
  }

  async get(id: string): Promise<UserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        ...userInclude,
        scopes: { where: { userId: id } },
        templateScopes: { where: { userId: id }, select: { templateId: true } },
      },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    const mfaRequired = await this.mfaRequirement.isRequiredForUser(id);
    return {
      ...this.toSummary(user),
      forcePasswordChange: user.forcePasswordChange,
      mfaRequired,
      scopes: user.scopes.map((s) => ({ orgNodeId: s.orgNodeId, includeDescendants: s.includeDescendants })),
      templateScopes: user.templateScopes.map((s) => s.templateId),
    };
  }

  /**
   * RESET del MFA de un usuario (acción de administrador, dispositivo perdido).
   * Delega en AuthService (borra factor, revoca sesiones del objetivo, audita).
   */
  async resetMfa(id: string, ctx: AuditContext): Promise<UserDetail> {
    await this.auth.adminResetMfa(id, ctx);
    return this.get(id);
  }

  /**
   * RESET de contraseña por un administrador (contraseña temporal). Delega en
   * AuthService (valida política, fuerza cambio, revoca sesiones, audita; no
   * toca el MFA).
   */
  async resetPassword(id: string, password: string, ctx: AuditContext): Promise<UserDetail> {
    await this.auth.adminResetPassword(id, password, ctx);
    return this.get(id);
  }

  async create(dto: CreateUserRequest, ctx: AuditContext): Promise<UserDetail> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new BadRequestException("Ya existe un usuario con ese email");

    await this.policy.assertComplexity(dto.password);
    await this.assertRolesExist(dto.roleIds);
    const passwordHash = await this.passwords.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email,
        displayName: dto.displayName,
        passwordHash,
        forcePasswordChange: true,
        roles: { create: dto.roleIds.map((roleId) => ({ roleId, assignedById: ctx.actorId ?? null })) },
      },
    });
    await this.policy.recordHistory(user.id, passwordHash);
    await this.audit.record({ ...ctx, action: "user.created", entityType: "User", entityId: user.id, after: { email, displayName: dto.displayName, roleIds: dto.roleIds } });
    return this.get(user.id);
  }

  async update(id: string, dto: UpdateUserRequest, ctx: AuditContext): Promise<UserDetail> {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Usuario no encontrado");
    await this.prisma.user.update({
      where: { id },
      data: { displayName: dto.displayName ?? undefined, status: dto.status ?? undefined },
    });
    await this.audit.record({ ...ctx, action: "user.updated", entityType: "User", entityId: id, before: { displayName: before.displayName, status: before.status }, after: { ...dto } });
    return this.get(id);
  }

  async assignRoles(id: string, dto: AssignRolesRequest, ctx: AuditContext): Promise<UserDetail> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    await this.assertRolesExist(dto.roleIds);

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: id } }),
      this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId, assignedById: ctx.actorId ?? null })),
      }),
    ]);
    await this.permissions.invalidateUser(id);
    await this.audit.record({ ...ctx, action: "user.roles.assigned", entityType: "User", entityId: id, after: { roleIds: dto.roleIds } });
    return this.get(id);
  }

  async assignScope(id: string, dto: AssignScopeRequest, ctx: AuditContext): Promise<UserDetail> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    const nodeIds = [...new Set(dto.scopes.map((s) => s.orgNodeId))];
    if (nodeIds.length > 0) {
      const found = await this.prisma.orgNode.count({ where: { id: { in: nodeIds }, deletedAt: null } });
      if (found !== nodeIds.length) throw new BadRequestException("Uno o más nodos no existen");
    }

    await this.prisma.$transaction([
      this.prisma.scope.deleteMany({ where: { userId: id } }),
      this.prisma.scope.createMany({
        data: dto.scopes.map((s) => ({ userId: id, orgNodeId: s.orgNodeId, includeDescendants: s.includeDescendants })),
      }),
    ]);
    await this.audit.record({ ...ctx, action: "user.scope.assigned", entityType: "User", entityId: id, after: { scopes: dto.scopes } });
    return this.get(id);
  }

  /**
   * Reemplaza el alcance por PLANTILLA del usuario (2.º eje ABAC, Fase 2.8).
   * Lista vacía ⇒ sin restricción (ve todas). Audita el cambio de scope.
   */
  async assignTemplateScope(id: string, dto: AssignTemplateScopeRequest, ctx: AuditContext): Promise<UserDetail> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    const templateIds = [...new Set(dto.templateIds)];
    if (templateIds.length > 0) {
      const found = await this.prisma.template.count({ where: { id: { in: templateIds }, deletedAt: null } });
      if (found !== templateIds.length) throw new BadRequestException("Una o más plantillas no existen");
    }

    await this.prisma.$transaction([
      this.prisma.templateScope.deleteMany({ where: { userId: id } }),
      this.prisma.templateScope.createMany({
        data: templateIds.map((templateId) => ({ userId: id, templateId })),
      }),
    ]);
    await this.audit.record({ ...ctx, action: "user.templatescope.assigned", entityType: "User", entityId: id, after: { templateIds } });
    return this.get(id);
  }

  private async assertRolesExist(roleIds: string[]): Promise<void> {
    const unique = [...new Set(roleIds)];
    if (unique.length === 0) return;
    const count = await this.prisma.role.count({ where: { id: { in: unique } } });
    if (count !== unique.length) throw new BadRequestException("Uno o más roles no existen");
  }

  private toSummary(
    user: Prisma.UserGetPayload<{ include: typeof userInclude }>,
  ): UserSummary {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      status: user.status,
      mfaEnabled: user.mfaEnabled,
      roles: user.roles.map((r) => ({ id: r.role.id, name: r.role.name })),
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
