import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Dimensión 4 (ABAC): alcance de datos. Calcula el conjunto de nodos de la
 * estructura a los que un usuario tiene acceso, combinando sus scopes propios
 * con los de sus roles y expandiendo descendientes vía la ruta materializada.
 *
 * `null` significa "sin restricción" (acceso a toda la estructura): se da cuando
 * el usuario no tiene NINGÚN scope asignado. Un Set (posiblemente vacío) acota.
 */
@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ids de nodos accesibles, o `null` si el usuario no tiene restricción de
   * alcance. Un Set vacío significa "no accede a ningún nodo".
   */
  async getAccessibleNodeIds(userId: string): Promise<Set<string> | null> {
    const scopes = await this.prisma.scope.findMany({
      where: { OR: [{ userId }, { role: { users: { some: { userId } } } }] },
      select: {
        orgNodeId: true,
        includeDescendants: true,
        orgNode: { select: { path: true } },
      },
    });

    // Sin scopes => sin restricción (acceso total).
    if (scopes.length === 0) return null;

    const direct = new Set<string>();
    const descendantPrefixes: string[] = [];
    for (const s of scopes) {
      direct.add(s.orgNodeId);
      if (s.includeDescendants) {
        // La ruta del propio nodo es el prefijo de las rutas de sus descendientes.
        descendantPrefixes.push(s.orgNode.path);
      }
    }

    if (descendantPrefixes.length > 0) {
      const descendants = await this.prisma.orgNode.findMany({
        where: {
          deletedAt: null,
          OR: descendantPrefixes.map((prefix) => ({ path: { startsWith: prefix } })),
        },
        select: { id: true },
      });
      for (const d of descendants) direct.add(d.id);
    }

    return direct;
  }

  /** ¿El usuario puede acceder a este nodo según su alcance? */
  async canAccessNode(userId: string, orgNodeId: string): Promise<boolean> {
    const accessible = await this.getAccessibleNodeIds(userId);
    return accessible === null || accessible.has(orgNodeId);
  }
}
