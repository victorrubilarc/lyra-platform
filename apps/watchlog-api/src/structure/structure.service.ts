import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateOrgLevelRequest,
  CreateOrgNodeRequest,
  CreateOrgStructureRequest,
  OrgNodeTree,
  UpdateOrgLevelRequest,
  UpdateOrgNodeRequest,
  UpdateOrgStructureRequest,
} from "@lyra/contracts";
import type { OrgLevel, OrgNode, OrgStructure } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Estructura organizacional: estructuras (OrgStructure), niveles (OrgLevel) y nodos
 * jerárquicos (OrgNode). Multi-estructura: cada estructura tiene su propio set de
 * niveles (`order` único POR ESTRUCTURA) y su propio árbol de nodos. Mantiene la ruta
 * materializada `path` ("/<id>/<id>/.../") — IDs de nodo (cuid únicos), así que NO
 * colisiona entre estructuras — usada por el ScopeService de ABAC. Aislamiento
 * ESTRICTO: un nodo no se reparenta entre estructuras (invariante
 * node.structureId == parent.structureId, forzado aquí).
 */
@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  // --- Estructuras ---

  /**
   * Estructuras vivas que el usuario alcanza (ABAC), ordenadas para el selector (la
   * por defecto primero). Sin restricción de alcance (super admin) = todas, incluidas
   * las recién creadas aún sin nodos. Un usuario acotado ve solo las estructuras de
   * sus nodos accesibles.
   */
  async listStructures(userId?: string): Promise<(OrgStructure & { nodeCount: number })[]> {
    const all = await this.prisma.orgStructure.findMany({
      where: { deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { reportOrder: "asc" }, { name: "asc" }],
    });
    // Conteo de nodos vivos por estructura: distingue CONFIGURADAS (≥1 nodo) de vacías.
    const counts = await this.prisma.orgNode.groupBy({
      by: ["structureId"],
      where: { deletedAt: null },
      _count: { _all: true },
    });
    const countBy = new Map(counts.map((c) => [c.structureId, c._count._all]));
    const enrich = (s: OrgStructure): OrgStructure & { nodeCount: number } => ({
      ...s,
      nodeCount: countBy.get(s.id) ?? 0,
    });
    if (!userId) return all.map(enrich);
    const accessible = await this.scope.getAccessibleStructureIds(userId);
    const visible = accessible === null ? all : all.filter((s) => accessible.has(s.id));
    return visible.map(enrich);
  }

  /** Id de la estructura por defecto (la que absorbió lo legado). Cae a la 1ª viva. */
  async defaultStructureId(): Promise<string> {
    const def = await this.prisma.orgStructure.findFirst({
      where: { isDefault: true, deletedAt: null },
      select: { id: true },
    });
    if (def) return def.id;
    const any = await this.prisma.orgStructure.findFirst({ where: { deletedAt: null }, select: { id: true } });
    if (!any) throw new BadRequestException("No hay ninguna estructura organizacional configurada");
    return any.id;
  }

  /** Resuelve el id de estructura a usar: el dado (si existe y vive) o el por defecto. */
  async resolveStructureId(structureId?: string | null): Promise<string> {
    if (structureId) {
      const exists = await this.prisma.orgStructure.count({ where: { id: structureId, deletedAt: null } });
      if (exists === 0) throw new BadRequestException("La estructura indicada no existe");
      return structureId;
    }
    return this.defaultStructureId();
  }

  async createStructure(dto: CreateOrgStructureRequest, ctx: AuditContext): Promise<OrgStructure> {
    const dup = await this.prisma.orgStructure.count({ where: { key: dto.key } });
    if (dup > 0) throw new BadRequestException(`Ya existe una estructura con la clave "${dto.key}"`);
    const structure = await this.prisma.orgStructure.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        reportOrder: dto.reportOrder ?? 0,
        // Las estructuras nuevas NUNCA son la por defecto (esa es la migrada).
        isDefault: false,
        active: true,
      },
    });
    await this.audit.record({ ...ctx, action: "structure.structure.created", entityType: "OrgStructure", entityId: structure.id, after: { ...structure } });
    return structure;
  }

  async updateStructure(id: string, dto: UpdateOrgStructureRequest, ctx: AuditContext): Promise<OrgStructure> {
    const before = await this.prisma.orgStructure.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException("Estructura no encontrada");
    if (before.isDefault && dto.active === false) {
      throw new BadRequestException("La estructura por defecto no se puede desactivar");
    }
    const structure = await this.prisma.orgStructure.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description === undefined ? undefined : dto.description,
        active: dto.active ?? undefined,
        reportOrder: dto.reportOrder ?? undefined,
      },
    });
    await this.audit.record({ ...ctx, action: "structure.structure.updated", entityType: "OrgStructure", entityId: id, before: { ...before }, after: { ...structure } });
    return structure;
  }

  /**
   * Borrado lógico. Bloquea la estructura por defecto y cualquiera que tenga nodos —
   * ACTIVOS o ya eliminados— porque esos nodos arrastran datos (bitácoras/incidencias,
   * relaciones `Restrict`) y borrarlos sería destructivo. Los NIVELES no bloquean: la
   * relación `OrgLevel→OrgStructure` es `Cascade`, así que se limpian solos con la
   * estructura. Una estructura solo con niveles (sin nodos) sí se puede eliminar.
   */
  async deleteStructure(id: string, ctx: AuditContext): Promise<void> {
    const structure = await this.prisma.orgStructure.findFirst({ where: { id, deletedAt: null } });
    if (!structure) throw new NotFoundException("Estructura no encontrada");
    if (structure.isDefault) throw new BadRequestException("No se puede eliminar la estructura por defecto");
    const nodeCount = await this.prisma.orgNode.count({ where: { structureId: id } });
    if (nodeCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar la estructura: tiene ${nodeCount} nodo${nodeCount === 1 ? "" : "s"} (incluidos eliminados). Una estructura con historial de nodos no se puede borrar.`,
      );
    }
    // Limpia los niveles (la cascada de la BD también lo haría al borrar físicamente;
    // aquí es borrado lógico de la estructura, así que los retiramos explícitamente).
    await this.prisma.$transaction([
      this.prisma.orgLevel.deleteMany({ where: { structureId: id } }),
      this.prisma.orgStructure.update({ where: { id }, data: { deletedAt: new Date() } }),
    ]);
    await this.audit.record({ ...ctx, action: "structure.structure.deleted", entityType: "OrgStructure", entityId: id, before: { ...structure } });
  }

  // --- Niveles ---

  /** Niveles de una estructura (la dada o la por defecto). */
  async listLevels(structureId?: string | null): Promise<OrgLevel[]> {
    const sid = await this.resolveStructureId(structureId);
    return this.prisma.orgLevel.findMany({ where: { structureId: sid }, orderBy: { order: "asc" } });
  }

  async createLevel(dto: CreateOrgLevelRequest, ctx: AuditContext): Promise<OrgLevel> {
    const structureId = await this.resolveStructureId(dto.structureId ?? null);
    const level = await this.prisma.orgLevel.create({
      data: { structureId, name: dto.name, order: dto.order },
    });
    await this.audit.record({ ...ctx, action: "structure.level.created", entityType: "OrgLevel", entityId: level.id, after: { ...level } });
    return level;
  }

  async updateLevel(id: string, dto: UpdateOrgLevelRequest, ctx: AuditContext): Promise<OrgLevel> {
    const before = await this.prisma.orgLevel.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Nivel no encontrado");
    const level = await this.prisma.orgLevel.update({ where: { id }, data: dto });
    await this.audit.record({ ...ctx, action: "structure.level.updated", entityType: "OrgLevel", entityId: id, before: { ...before }, after: { ...level } });
    return level;
  }

  async deleteLevel(id: string, ctx: AuditContext): Promise<void> {
    const level = await this.prisma.orgLevel.findUnique({ where: { id } });
    if (!level) throw new NotFoundException("Nivel no encontrado");
    const nodeCount = await this.prisma.orgNode.count({ where: { levelId: id, deletedAt: null } });
    if (nodeCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar el nivel: hay ${nodeCount} nodo${nodeCount === 1 ? "" : "s"} activo${nodeCount === 1 ? "" : "s"} con este nivel.`,
      );
    }
    await this.prisma.orgLevel.delete({ where: { id } });
    await this.audit.record({ ...ctx, action: "structure.level.deleted", entityType: "OrgLevel", entityId: id, before: { ...level } });
  }

  // --- Nodos ---

  /** Devuelve el árbol completo de nodos vivos de una estructura (la dada o la por defecto). */
  async getTree(structureId?: string | null): Promise<OrgNodeTree[]> {
    const sid = await this.resolveStructureId(structureId);
    const nodes = await this.prisma.orgNode.findMany({
      where: { deletedAt: null, structureId: sid },
      // Orden en informes (asc) con desempate alfabético; aplica a árbol y grilla.
      orderBy: [{ reportOrder: "asc" }, { name: "asc" }],
    });
    return this.buildTree(nodes);
  }

  /**
   * Árbol de nodos vivos de una estructura ACOTADO al alcance ABAC del usuario.
   * Es el camino para los SELECTORES de FLUJO OPERACIONAL (crear incidencia,
   * abrir bitácora, etc.): a diferencia de `getTree()` —que sirve a la ADMINISTRACIÓN
   * y debe mostrar TODOS los nodos—, aquí solo aparecen los que el usuario alcanza.
   * `ScopeService.getAccessibleNodeIds` devuelve `null` para un usuario sin
   * restricción de alcance (admin) ⇒ árbol completo; un Set vacío ⇒ árbol vacío.
   * Si un nodo accesible cuelga de un ancestro NO accesible, `buildTree` lo deja
   * como raíz: el usuario ve su subárbol, nunca nodos ajenos.
   */
  async getAccessibleTree(userId: string, structureId?: string | null): Promise<OrgNodeTree[]> {
    const sid = await this.resolveStructureId(structureId);
    const accessibleIds = await this.scope.getAccessibleNodeIds(userId);
    const nodes = await this.prisma.orgNode.findMany({
      where: {
        deletedAt: null,
        structureId: sid,
        ...(accessibleIds === null ? {} : { id: { in: [...accessibleIds] } }),
      },
      orderBy: [{ reportOrder: "asc" }, { name: "asc" }],
    });
    return this.buildTree(nodes);
  }

  async createNode(dto: CreateOrgNodeRequest, ctx: AuditContext): Promise<OrgNode> {
    // La estructura del nodo la DICTA el padre (aislamiento estricto): un nodo con
    // padre hereda su estructura; una raíz toma `dto.structureId` (o la por defecto).
    const parent = dto.parentId ? await this.loadLiveNode(dto.parentId) : null;
    const structureId = parent ? parent.structureId : await this.resolveStructureId(dto.structureId ?? null);
    await this.assertLevelInStructure(dto.levelId, structureId);
    const parentPath = parent ? parent.path : "/";

    // El path incluye el propio id, que solo se conoce tras crear: 2 pasos.
    const created = await this.prisma.orgNode.create({
      data: {
        structureId,
        name: dto.name,
        code: dto.code ?? null,
        description: dto.description ?? null,
        reportOrder: dto.reportOrder ?? 0,
        externalCode: dto.externalCode ?? null,
        parentId: dto.parentId ?? null,
        levelId: dto.levelId,
      },
    });
    const node = await this.prisma.orgNode.update({
      where: { id: created.id },
      data: { path: `${parentPath}${created.id}/` },
    });
    await this.audit.record({ ...ctx, action: "structure.node.created", entityType: "OrgNode", entityId: node.id, after: { ...node } });
    return node;
  }

  async updateNode(id: string, dto: UpdateOrgNodeRequest, ctx: AuditContext): Promise<OrgNode> {
    const before = await this.prisma.orgNode.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException("Nodo no encontrado");
    if (dto.levelId) await this.assertLevelInStructure(dto.levelId, before.structureId);

    const reparenting = dto.parentId !== undefined && dto.parentId !== before.parentId;
    if (reparenting) await this.assertValidReparent(before, dto.parentId ?? null);

    const node = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.orgNode.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          code: dto.code === undefined ? undefined : dto.code,
          description: dto.description === undefined ? undefined : dto.description,
          reportOrder: dto.reportOrder === undefined ? undefined : dto.reportOrder,
          externalCode: dto.externalCode === undefined ? undefined : dto.externalCode,
          levelId: dto.levelId ?? undefined,
          parentId: reparenting ? (dto.parentId ?? null) : undefined,
        },
      });

      if (reparenting) {
        const parentPath =
          dto.parentId == null
            ? "/"
            : (await tx.orgNode.findUniqueOrThrow({ where: { id: dto.parentId } })).path;
        const newPath = `${parentPath}${id}/`;
        // Reescribe el prefijo de la ruta en el nodo y todos sus descendientes.
        const subtree = await tx.orgNode.findMany({ where: { path: { startsWith: before.path } } });
        for (const n of subtree) {
          await tx.orgNode.update({
            where: { id: n.id },
            data: { path: newPath + n.path.slice(before.path.length) },
          });
        }
        return tx.orgNode.findUniqueOrThrow({ where: { id } });
      }
      return updated;
    });

    await this.audit.record({ ...ctx, action: "structure.node.updated", entityType: "OrgNode", entityId: id, before: { ...before }, after: { ...node } });
    return node;
  }

  /** Borrado lógico. Bloquea si el nodo tiene hijos vivos. */
  async deleteNode(id: string, ctx: AuditContext): Promise<void> {
    const node = await this.prisma.orgNode.findFirst({ where: { id, deletedAt: null } });
    if (!node) throw new NotFoundException("Nodo no encontrado");
    const childCount = await this.prisma.orgNode.count({ where: { parentId: id, deletedAt: null } });
    if (childCount > 0) {
      throw new BadRequestException("No se puede eliminar un nodo con hijos. Elimina los hijos primero.");
    }
    const equipmentCount = await this.prisma.equipment.count({ where: { orgNodeId: id, deletedAt: null } });
    if (equipmentCount > 0) {
      throw new BadRequestException(
        `No se puede eliminar el nodo: tiene ${equipmentCount} equipo${equipmentCount === 1 ? "" : "s"} activo${equipmentCount === 1 ? "" : "s"}. Elimina o reasigna los equipos primero.`,
      );
    }
    await this.prisma.orgNode.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ ...ctx, action: "structure.node.deleted", entityType: "OrgNode", entityId: id, before: { ...node } });
  }

  // --- helpers ---

  /** El nivel debe existir y pertenecer a la MISMA estructura que el nodo. */
  private async assertLevelInStructure(levelId: string, structureId: string): Promise<void> {
    const level = await this.prisma.orgLevel.findUnique({ where: { id: levelId }, select: { structureId: true } });
    if (!level) throw new BadRequestException("El nivel indicado no existe");
    if (level.structureId !== structureId) {
      throw new BadRequestException("El nivel pertenece a otra estructura organizacional");
    }
  }

  private async loadLiveNode(nodeId: string): Promise<OrgNode> {
    const node = await this.prisma.orgNode.findFirst({ where: { id: nodeId, deletedAt: null } });
    if (!node) throw new BadRequestException("El nodo padre no existe");
    return node;
  }

  /**
   * Evita ciclos (el nuevo padre no puede ser el propio nodo ni un descendiente) y
   * cruces de estructura (aislamiento estricto: el padre vive en la misma estructura).
   */
  private async assertValidReparent(node: OrgNode, newParentId: string | null): Promise<void> {
    if (newParentId == null) return;
    if (newParentId === node.id) throw new BadRequestException("Un nodo no puede ser su propio padre");
    const newParent = await this.prisma.orgNode.findFirst({
      where: { id: newParentId, deletedAt: null },
    });
    if (!newParent) throw new BadRequestException("El nodo padre no existe");
    if (newParent.structureId !== node.structureId) {
      throw new BadRequestException("No se puede mover un nodo a otra estructura organizacional");
    }
    if (newParent.path.startsWith(node.path)) {
      throw new BadRequestException("No se puede mover un nodo dentro de su propio subárbol");
    }
  }

  private buildTree(nodes: OrgNode[]): OrgNodeTree[] {
    const toDto = (n: OrgNode): OrgNodeTree => ({
      id: n.id,
      structureId: n.structureId,
      name: n.name,
      code: n.code,
      description: n.description,
      reportOrder: n.reportOrder,
      externalCode: n.externalCode,
      parentId: n.parentId,
      levelId: n.levelId,
      path: n.path,
      createdAt: n.createdAt.toISOString(),
      children: [],
    });
    const map = new Map<string, OrgNodeTree>();
    const roots: OrgNodeTree[] = [];
    for (const n of nodes) map.set(n.id, toDto(n));
    for (const n of nodes) {
      const dto = map.get(n.id)!;
      if (n.parentId && map.has(n.parentId)) {
        map.get(n.parentId)!.children.push(dto);
      } else {
        roots.push(dto);
      }
    }
    return roots;
  }
}
