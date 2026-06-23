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
/**
 * Conjunto de nodos accesibles (ids + rutas materializadas, ya expandido a
 * descendientes), o `null` si el usuario no tiene restricción de alcance. Las
 * rutas habilitan comprobar intersección con el SUBÁRBOL de una asignación de
 * plantilla (multi-nodo, Fase 2.8.0) sin volver a consultar la BD.
 */
export interface AccessibleNodes {
  ids: Set<string>;
  paths: Set<string>;
}

@Injectable()
export class ScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Nodos accesibles (ids + rutas), o `null` si el usuario no tiene restricción.
   * Un conjunto vacío significa "no accede a ningún nodo". Fuente única que
   * usan `getAccessibleNodeIds`, `canAccessNode` y la visibilidad por nodo de
   * las plantillas multi-nodo.
   */
  async getAccessibleNodes(userId: string): Promise<AccessibleNodes | null> {
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

    const ids = new Set<string>();
    const paths = new Set<string>();
    const directPathById = new Map<string, string>();
    const descendantPrefixes: string[] = [];
    for (const s of scopes) {
      ids.add(s.orgNodeId);
      directPathById.set(s.orgNodeId, s.orgNode.path);
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
        select: { id: true, path: true },
      });
      for (const d of descendants) {
        ids.add(d.id);
        paths.add(d.path);
      }
    }
    // Garantiza la ruta de los nodos directos sin descendientes (no salieron del query de arriba).
    for (const [, p] of directPathById) paths.add(p);

    return { ids, paths };
  }

  /**
   * Ids de nodos accesibles, o `null` si el usuario no tiene restricción de
   * alcance. Un Set vacío significa "no accede a ningún nodo".
   */
  async getAccessibleNodeIds(userId: string): Promise<Set<string> | null> {
    const access = await this.getAccessibleNodes(userId);
    return access === null ? null : access.ids;
  }

  /** ¿El usuario puede acceder a este nodo según su alcance? */
  async canAccessNode(userId: string, orgNodeId: string): Promise<boolean> {
    const accessible = await this.getAccessibleNodeIds(userId);
    return accessible === null || accessible.has(orgNodeId);
  }

  /**
   * Multi-estructura: ids de las ESTRUCTURAS que el usuario alcanza, o `null` si no
   * tiene restricción de alcance (ve todas). Se DERIVA de los nodos accesibles (cada
   * nodo lleva su `structureId`): un usuario alcanza una estructura si tiene acceso a
   * algún nodo de ella. Es la fuente que filtra el selector de estructura del front y
   * autoriza el acceso por estructura en el backend.
   */
  async getAccessibleStructureIds(userId: string): Promise<Set<string> | null> {
    const ids = await this.getAccessibleNodeIds(userId);
    if (ids === null) return null; // sin restricción => todas las estructuras
    if (ids.size === 0) return new Set();
    const nodes = await this.prisma.orgNode.findMany({
      where: { id: { in: [...ids] } },
      select: { structureId: true },
    });
    return new Set(nodes.map((n) => n.structureId));
  }

  /**
   * ¿Una asignación de plantilla a un nodo cae dentro del alcance del usuario?
   * (Fase 2.8.0 multi-nodo.) La asignación cubre el nodo `orgNodeId` y, si
   * `includeDescendants`, todo su subárbol (`orgNodePath` = ruta materializada).
   * Hay intersección si el usuario alcanza ese nodo directamente, o —cuando la
   * asignación incluye descendientes— si alcanza CUALQUIER nodo bajo él.
   */
  nodeAssignmentInScope(
    assignment: { orgNodeId: string; includeDescendants: boolean; orgNodePath: string },
    access: AccessibleNodes | null,
  ): boolean {
    if (access === null) return true; // usuario sin restricción de nodo
    if (access.ids.has(assignment.orgNodeId)) return true;
    if (assignment.includeDescendants) {
      // La ruta materializada termina en "/", así que el prefijo no colisiona
      // entre nodos hermanos ("/a/" no es prefijo de "/ab/").
      for (const p of access.paths) {
        if (p.startsWith(assignment.orgNodePath)) return true;
      }
    }
    return false;
  }

  /**
   * ¿La plantilla es visible/usable por el usuario según el eje de NODO?
   * (Fase 2.8.0.) CERO asignaciones = GLOBAL (visible en todo nodo). Con
   * asignaciones, basta que ALGUNA intersecte el alcance del usuario.
   */
  isTemplateVisibleByNode(
    assignments: Array<{ orgNodeId: string; includeDescendants: boolean; orgNodePath: string }>,
    access: AccessibleNodes | null,
  ): boolean {
    if (assignments.length === 0) return true; // global
    if (access === null) return true; // usuario sin restricción
    return assignments.some((a) => this.nodeAssignmentInScope(a, access));
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
