import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateOrgLevelRequest,
  CreateOrgNodeRequest,
  OrgNodeTree,
  UpdateOrgLevelRequest,
  UpdateOrgNodeRequest,
} from "@lyra/contracts";
import type { OrgLevel, OrgNode } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Estructura organizacional: niveles (OrgLevel) y nodos jerárquicos (OrgNode).
 * Mantiene la ruta materializada `path` ("/<id>/<id>/.../") para consultar
 * descendientes de forma eficiente (usada por el ScopeService de ABAC).
 */
@Injectable()
export class StructureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Niveles ---

  listLevels(): Promise<OrgLevel[]> {
    return this.prisma.orgLevel.findMany({ orderBy: { order: "asc" } });
  }

  async createLevel(dto: CreateOrgLevelRequest, ctx: AuditContext): Promise<OrgLevel> {
    const level = await this.prisma.orgLevel.create({ data: dto });
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

  /** Devuelve el árbol completo de nodos vivos. */
  async getTree(): Promise<OrgNodeTree[]> {
    const nodes = await this.prisma.orgNode.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
    return this.buildTree(nodes);
  }

  async createNode(dto: CreateOrgNodeRequest, ctx: AuditContext): Promise<OrgNode> {
    await this.assertLevelExists(dto.levelId);
    const parentPath = await this.resolveParentPath(dto.parentId ?? null);

    // El path incluye el propio id, que solo se conoce tras crear: 2 pasos.
    const created = await this.prisma.orgNode.create({
      data: {
        name: dto.name,
        code: dto.code ?? null,
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
    if (dto.levelId) await this.assertLevelExists(dto.levelId);

    const reparenting = dto.parentId !== undefined && dto.parentId !== before.parentId;
    if (reparenting) await this.assertValidReparent(before, dto.parentId ?? null);

    const node = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.orgNode.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          code: dto.code === undefined ? undefined : dto.code,
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
    await this.prisma.orgNode.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ ...ctx, action: "structure.node.deleted", entityType: "OrgNode", entityId: id, before: { ...node } });
  }

  // --- helpers ---

  private async assertLevelExists(levelId: string): Promise<void> {
    const exists = await this.prisma.orgLevel.count({ where: { id: levelId } });
    if (exists === 0) throw new BadRequestException("El nivel indicado no existe");
  }

  private async resolveParentPath(parentId: string | null): Promise<string> {
    if (parentId == null) return "/";
    const parent = await this.prisma.orgNode.findFirst({ where: { id: parentId, deletedAt: null } });
    if (!parent) throw new BadRequestException("El nodo padre no existe");
    return parent.path;
  }

  /** Evita ciclos: el nuevo padre no puede ser el propio nodo ni un descendiente. */
  private async assertValidReparent(node: OrgNode, newParentId: string | null): Promise<void> {
    if (newParentId == null) return;
    if (newParentId === node.id) throw new BadRequestException("Un nodo no puede ser su propio padre");
    const newParent = await this.prisma.orgNode.findFirst({
      where: { id: newParentId, deletedAt: null },
    });
    if (!newParent) throw new BadRequestException("El nodo padre no existe");
    if (newParent.path.startsWith(node.path)) {
      throw new BadRequestException("No se puede mover un nodo dentro de su propio subárbol");
    }
  }

  private buildTree(nodes: OrgNode[]): OrgNodeTree[] {
    const toDto = (n: OrgNode): OrgNodeTree => ({
      id: n.id,
      name: n.name,
      code: n.code,
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
