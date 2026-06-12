import { ForbiddenException, Injectable } from "@nestjs/common";
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

  /**
   * Dimensión 4, 2.º eje (ABAC): alcance por PLANTILLA. Ids de plantilla
   * accesibles, o `null` si el usuario no tiene NINGUNA restricción de plantilla
   * (semántica PERMISIVA: sin scope = ve TODAS). Une los scopes propios con los
   * de sus roles (espejo de `getAccessibleNodeIds`). Un Set vacío sería
   * imposible aquí: si no hay filas, devolvemos `null` (sin restricción).
   *
   * Es un eje ORTOGONAL al de nodo: la decisión final combina ambos en AND
   * ("gana la más estricta").
   */
  async getAccessibleTemplateIds(userId: string): Promise<Set<string> | null> {
    const scopes = await this.prisma.templateScope.findMany({
      where: { OR: [{ userId }, { role: { users: { some: { userId } } } }] },
      select: { templateId: true },
    });

    // Sin scopes de plantilla => sin restricción de plantilla (ve todas).
    if (scopes.length === 0) return null;

    return new Set(scopes.map((s) => s.templateId));
  }

  /** ¿El usuario puede usar/ver esta plantilla según su alcance de plantilla? */
  async canAccessTemplate(userId: string, templateId: string): Promise<boolean> {
    const accessible = await this.getAccessibleTemplateIds(userId);
    return accessible === null || accessible.has(templateId);
  }

  /**
   * Gate duro del eje de plantilla: lanza 403 si la plantilla no está en el
   * alcance del usuario. Defensa en profundidad para las rutas de lectura/llenado
   * que reciben un id directo (el front ya filtra, el backend AUTORIZA).
   */
  async assertTemplateInScope(userId: string, templateId: string): Promise<void> {
    if (!(await this.canAccessTemplate(userId, templateId))) {
      throw new ForbiddenException("La plantilla está fuera de tu alcance");
    }
  }
}
