import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CacheService } from "../redis/cache.service";

/**
 * Resuelve los permisos efectivos de un usuario = unión de los permisos de
 * todos sus roles. Resultado cacheado (Redis o memoria) con TTL corto e
 * invalidación explícita cuando cambian roles o permisos.
 */
@Injectable()
export class PermissionService {
  private static readonly TTL_SECONDS = 300; // 5 min
  private static readonly keyFor = (userId: string): string => `authz:perms:${userId}`;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /** Claves de permiso efectivas del usuario (cacheadas). */
  async getEffectivePermissions(userId: string): Promise<Set<string>> {
    const cached = await this.cache.get(PermissionService.keyFor(userId));
    if (cached !== null) {
      return new Set<string>(JSON.parse(cached) as string[]);
    }
    const keys = await this.loadFromDb(userId);
    await this.cache.set(
      PermissionService.keyFor(userId),
      JSON.stringify(keys),
      PermissionService.TTL_SECONDS,
    );
    return new Set<string>(keys);
  }

  /** Invalida la caché de un usuario (tras cambiar sus roles). */
  async invalidateUser(userId: string): Promise<void> {
    await this.cache.del(PermissionService.keyFor(userId));
  }

  /**
   * Invalida a todos los usuarios afectados por un rol (al cambiar sus permisos).
   * Single-tenant: el número de usuarios es acotado, así que iteramos.
   */
  async invalidateRole(roleId: string): Promise<void> {
    const members = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });
    await Promise.all(members.map((m) => this.invalidateUser(m.userId)));
  }

  private async loadFromDb(userId: string): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { users: { some: { userId } } } },
      select: { permission: { select: { key: true } } },
      distinct: ["permissionId"],
    });
    return [...new Set(rows.map((r) => r.permission.key))];
  }
}
