import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AssignAdminStructuresRequest,
  AssignScopeRequest,
  AssignTemplateScopeRequest,
  CreateRoleRequest,
  RoleDetail,
  RoleSummary,
  UpdateRoleRequest,
} from "@lyra/contracts";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PermissionService } from "../authz/permission.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<RoleSummary[]> {
    const roles = await this.prisma.role.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { permissions: true, users: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      requireMfa: r.requireMfa,
      permissionCount: r._count.permissions,
      userCount: r._count.users,
    }));
  }

  async get(id: string): Promise<RoleDetail> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { select: { permission: { select: { key: true } } } },
        scopes: { where: { roleId: id }, select: { orgNodeId: true, includeDescendants: true } },
        templateScopes: { select: { templateId: true } },
        structureAdmins: { select: { structureId: true } },
        _count: { select: { permissions: true, users: true } },
      },
    });
    if (!role) throw new NotFoundException("Rol no encontrado");
    return {
      id: role.id,
      key: role.key,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      requireMfa: role.requireMfa,
      permissionCount: role._count.permissions,
      userCount: role._count.users,
      permissionKeys: role.permissions.map((p) => p.permission.key),
      scopes: role.scopes.map((s) => ({ orgNodeId: s.orgNodeId, includeDescendants: s.includeDescendants })),
      templateScopes: role.templateScopes.map((s) => s.templateId),
      adminStructureIds: role.structureAdmins.map((s) => s.structureId),
    };
  }

  /**
   * Reemplaza el alcance por NODO (ABAC dim. 4) del rol. Espejo de
   * `UsersService.assignScope` pero con sujeto `roleId`: el `ScopeService` une
   * en read-time los scopes del usuario con los de sus roles (unión), así que
   * este alcance AMPLÍA el de cada miembro del rol y se re-acota EN VIVO al
   * quitarle el rol (no se denormaliza). Vacío ⇒ el rol no aporta restricción
   * de nodo. La autorización efectiva la sigue decidiendo el backend.
   */
  async assignScope(id: string, dto: AssignScopeRequest, ctx: AuditContext): Promise<RoleDetail> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException("Rol no encontrado");

    const nodeIds = [...new Set(dto.scopes.map((s) => s.orgNodeId))];
    if (nodeIds.length > 0) {
      const found = await this.prisma.orgNode.count({ where: { id: { in: nodeIds }, deletedAt: null } });
      if (found !== nodeIds.length) throw new BadRequestException("Uno o más nodos no existen");
    }

    await this.prisma.$transaction([
      this.prisma.scope.deleteMany({ where: { roleId: id } }),
      this.prisma.scope.createMany({
        data: dto.scopes.map((s) => ({ roleId: id, orgNodeId: s.orgNodeId, includeDescendants: s.includeDescendants })),
      }),
    ]);
    await this.audit.record({ ...ctx, action: "role.scope.assigned", entityType: "Role", entityId: id, after: { scopes: dto.scopes } });
    return this.get(id);
  }

  /**
   * Reemplaza el alcance por PLANTILLA del rol (2.º eje ABAC, Fase 2.8). Se suma
   * en el read-time al alcance del usuario (unión user+roles). Vacío ⇒ el rol no
   * aporta restricción de plantilla. Audita el cambio de scope.
   */
  async assignTemplateScope(id: string, dto: AssignTemplateScopeRequest, ctx: AuditContext): Promise<RoleDetail> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException("Rol no encontrado");

    const templateIds = [...new Set(dto.templateIds)];
    if (templateIds.length > 0) {
      const found = await this.prisma.template.count({ where: { id: { in: templateIds }, deletedAt: null } });
      if (found !== templateIds.length) throw new BadRequestException("Una o más plantillas no existen");
    }

    await this.prisma.$transaction([
      this.prisma.templateScope.deleteMany({ where: { roleId: id } }),
      this.prisma.templateScope.createMany({
        data: templateIds.map((templateId) => ({ roleId: id, templateId })),
      }),
    ]);
    await this.audit.record({ ...ctx, action: "role.templatescope.assigned", entityType: "Role", entityId: id, after: { templateIds } });
    return this.get(id);
  }

  /**
   * Reemplaza el conjunto de estructuras que los miembros de este rol pueden
   * ADMINISTRAR por delegación (L2b). Espejo de `assignScope` con sujeto `roleId`:
   * el `ScopeService` une en read-time la delegación del rol con la propia del
   * usuario, así que se re-acota EN VIVO al quitarle el rol (sin denormalizar). Lista
   * vacía ⇒ el rol no delega ninguna. No invalida la caché de permisos: la delegación
   * es un eje aparte que se consulta en vivo, no forma parte de los permisos efectivos.
   */
  async assignAdminStructures(id: string, dto: AssignAdminStructuresRequest, ctx: AuditContext): Promise<RoleDetail> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException("Rol no encontrado");

    const structureIds = [...new Set(dto.structureIds)];
    if (structureIds.length > 0) {
      const found = await this.prisma.orgStructure.count({
        where: { id: { in: structureIds }, deletedAt: null },
      });
      if (found !== structureIds.length) throw new BadRequestException("Una o más estructuras no existen");
    }

    await this.prisma.$transaction([
      this.prisma.structureAdmin.deleteMany({ where: { roleId: id } }),
      this.prisma.structureAdmin.createMany({
        data: structureIds.map((structureId) => ({ roleId: id, structureId })),
      }),
    ]);
    await this.audit.record({ ...ctx, action: "role.adminstructures.assigned", entityType: "Role", entityId: id, after: { structureIds } });
    return this.get(id);
  }

  async create(dto: CreateRoleRequest, ctx: AuditContext): Promise<RoleDetail> {
    const existing = await this.prisma.role.findUnique({ where: { key: dto.key } });
    if (existing) throw new BadRequestException(`Ya existe un rol con la clave "${dto.key}"`);

    const permissionIds = await this.resolvePermissionIds(dto.permissionKeys);
    const role = await this.prisma.role.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        requireMfa: dto.requireMfa,
        permissions: { create: permissionIds.map((permissionId) => ({ permissionId })) },
      },
    });
    await this.audit.record({ ...ctx, action: "role.created", entityType: "Role", entityId: role.id, after: { key: role.key, name: role.name, permissionKeys: dto.permissionKeys } });
    return this.get(role.id);
  }

  async update(id: string, dto: UpdateRoleRequest, ctx: AuditContext): Promise<RoleDetail> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException("Rol no encontrado");

    const before = await this.get(id);

    // CANDADO A (red anti-lockout): el rol de sistema "Administrador" es el super-admin
    // de facto (tiene TODOS los permisos). Bloquear cualquier cambio a SU conjunto de
    // permisos garantiza que el llavero maestro nunca se vacíe (ni por error ni a
    // propósito) y que la instalación conserve siempre quién administre todo. Se permite
    // el guardado idempotente (mismo set) para no romper un "Guardar" del formulario.
    if (role.isSystem && dto.permissionKeys !== undefined) {
      const current = new Set(before.permissionKeys);
      const next = new Set(dto.permissionKeys);
      const changed = current.size !== next.size || [...next].some((k) => !current.has(k));
      if (changed) {
        throw new ForbiddenException(
          "El rol de sistema no puede modificar sus permisos (protección anti-bloqueo).",
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.role.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description === undefined ? undefined : dto.description,
          requireMfa: dto.requireMfa ?? undefined,
        },
      });
      if (dto.permissionKeys) {
        const permissionIds = await this.resolvePermissionIds(dto.permissionKeys);
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        });
      }
    });

    // Cambió el conjunto de permisos: invalida la caché de todos sus miembros.
    if (dto.permissionKeys) await this.permissions.invalidateRole(id);

    const after = await this.get(id);
    await this.audit.record({ ...ctx, action: "role.updated", entityType: "Role", entityId: id, before: { ...before }, after: { ...after } });
    return after;
  }

  async remove(id: string, ctx: AuditContext): Promise<void> {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw new NotFoundException("Rol no encontrado");
    if (role.isSystem) throw new ForbiddenException("No se puede eliminar un rol de sistema");

    await this.permissions.invalidateRole(id);
    await this.prisma.role.delete({ where: { id } });
    await this.audit.record({ ...ctx, action: "role.deleted", entityType: "Role", entityId: id, before: { key: role.key, name: role.name } });
  }

  /** Valida claves de permiso contra la BD y devuelve sus ids. */
  private async resolvePermissionIds(keys: string[]): Promise<string[]> {
    const unique = [...new Set(keys)];
    if (unique.length === 0) return [];
    const found = await this.prisma.permission.findMany({
      where: { key: { in: unique } },
      select: { id: true, key: true },
    });
    if (found.length !== unique.length) {
      const known = new Set(found.map((p) => p.key));
      const missing = unique.filter((k) => !known.has(k));
      throw new BadRequestException(`Permisos desconocidos: ${missing.join(", ")}`);
    }
    return found.map((p) => p.id);
  }
}
