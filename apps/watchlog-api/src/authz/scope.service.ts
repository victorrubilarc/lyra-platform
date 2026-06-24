import { ForbiddenException, Injectable } from "@nestjs/common";
import type { PermissionKey } from "@lyra/contracts";
import { PermissionService } from "./permission.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Permiso de SUPER-ADMIN de estructura (L2b): quien lo tiene administra TODAS las
 * estructuras y reparte las delegaciones (`StructureAdmin`). Se REUSA la clave de
 * módulo `module:structure:manage` (antes latente): el rol de sistema "Administrador"
 * ya la posee, así que conserva acceso total sin migrar grants. Un administrador
 * DELEGADO tiene `orglevel:manage`/`orgnode:*` pero NO esta clave, y queda acotado a
 * las estructuras que se le delegan.
 */
export const STRUCTURE_SUPER_ADMIN_PERMISSION: PermissionKey = "module:structure:manage";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
  ) {}

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

  // === Administración DELEGADA por estructura (L2b) =========================
  // Eje DISTINTO del ABAC de datos de arriba: decide quién puede ADMINISTRAR
  // (mutar) una estructura (su árbol/niveles/ciclo de vida), no quién VE sus
  // datos. La autorización es CONTEXTUAL: permiso ∧ estructura delegada (o
  // super-admin). Centralizada aquí para no dispersarla endpoint por endpoint.

  /** ¿El usuario es SUPER-ADMIN de estructura (administra todas y delega)? */
  async isSuperStructureAdmin(userId: string): Promise<boolean> {
    const held = await this.permissions.getEffectivePermissions(userId);
    return held.has(STRUCTURE_SUPER_ADMIN_PERMISSION);
  }

  /**
   * Ids de las estructuras que el usuario puede ADMINISTRAR, o `null` si las
   * administra TODAS (super-admin). A diferencia de `getAccessibleStructureIds`,
   * NO se deriva de los nodos: se lee de `StructureAdmin` (unión de las filas
   * propias del usuario + las de sus roles, espejo de la unión de `Scope`). Por
   * eso un delegado ve su estructura aunque aún no tenga nodos accesibles (cierra
   * la deuda "(b)" de multi-estructura). Un usuario sin super-admin y sin
   * delegaciones obtiene un Set VACÍO (no administra ninguna).
   */
  async getAdministrableStructureIds(userId: string): Promise<Set<string> | null> {
    if (await this.isSuperStructureAdmin(userId)) return null; // administra todas
    const rows = await this.prisma.structureAdmin.findMany({
      where: { OR: [{ userId }, { role: { users: { some: { userId } } } }] },
      select: { structureId: true },
    });
    return new Set(rows.map((r) => r.structureId));
  }

  /** ¿El usuario puede ADMINISTRAR esta estructura concreta (delegado o super-admin)? */
  async canAdministerStructure(userId: string, structureId: string): Promise<boolean> {
    const administrable = await this.getAdministrableStructureIds(userId);
    return administrable === null || administrable.has(structureId);
  }

  /**
   * Gate duro de administración por estructura: lanza 403 si el usuario no es
   * super-admin ni tiene delegada esta estructura. Se invoca en CADA mutación de
   * structure/levels/nodes, ADEMÁS del permiso de catálogo del controller (patrón
   * híbrido: el gate grueso lo pone el decorador, el fino —contextual— el servicio).
   */
  async assertCanAdministerStructure(userId: string, structureId: string): Promise<void> {
    if (!(await this.canAdministerStructure(userId, structureId))) {
      throw new ForbiddenException("No tienes delegada la administración de esta estructura");
    }
  }

  /**
   * Gate duro de SUPER-ADMIN: lanza 403 si el usuario no administra TODAS las
   * estructuras. Reservado para actos de provisión que afectan al conjunto global
   * (crear/eliminar una estructura, reordenar el selector) o que delegan a otros.
   */
  async assertSuperStructureAdmin(userId: string): Promise<void> {
    if (!(await this.isSuperStructureAdmin(userId))) {
      throw new ForbiddenException(
        "Solo un administrador general de estructura puede realizar esta acción",
      );
    }
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
