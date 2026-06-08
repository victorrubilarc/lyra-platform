import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateEquipmentCategoryRequest,
  CreateEquipmentRequest,
  UpdateEquipmentCategoryRequest,
  UpdateEquipmentRequest,
} from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import type { Equipment, EquipmentCategory } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Equipos (Equipment) y su catálogo de clasificación (EquipmentCategory).
 *
 * Un equipo cuelga de un nodo de la estructura (patrón SAP PM: Functional
 * Location 1:N Equipment). El borrado de equipos es lógico (`deletedAt`); el
 * campo `active` modela el estado operacional (en servicio / fuera).
 */
@Injectable()
export class EquipmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Catálogo de categorías ------------------------------------------------

  listCategories(): Promise<EquipmentCategory[]> {
    return this.prisma.equipmentCategory.findMany({
      orderBy: [{ reportOrder: "asc" }, { name: "asc" }],
    });
  }

  async createCategory(
    dto: CreateEquipmentCategoryRequest,
    ctx: AuditContext,
  ): Promise<EquipmentCategory> {
    const category = await this.prisma.equipmentCategory.create({
      data: {
        name: dto.name,
        code: dto.code ?? null,
        isoRef: dto.isoRef ?? null,
        description: dto.description ?? null,
        reportOrder: dto.reportOrder ?? 0,
        active: dto.active ?? true,
      },
    });
    await this.audit.record({ ...ctx, action: "equipment.category.created", entityType: "EquipmentCategory", entityId: category.id, after: { ...category } });
    return category;
  }

  async updateCategory(
    id: string,
    dto: UpdateEquipmentCategoryRequest,
    ctx: AuditContext,
  ): Promise<EquipmentCategory> {
    const before = await this.prisma.equipmentCategory.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Categoría no encontrada");
    const category = await this.prisma.equipmentCategory.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        code: dto.code === undefined ? undefined : dto.code,
        isoRef: dto.isoRef === undefined ? undefined : dto.isoRef,
        description: dto.description === undefined ? undefined : dto.description,
        reportOrder: dto.reportOrder === undefined ? undefined : dto.reportOrder,
        active: dto.active === undefined ? undefined : dto.active,
      },
    });
    await this.audit.record({ ...ctx, action: "equipment.category.updated", entityType: "EquipmentCategory", entityId: id, before: { ...before }, after: { ...category } });
    return category;
  }

  async deleteCategory(id: string, ctx: AuditContext): Promise<void> {
    const category = await this.prisma.equipmentCategory.findUnique({ where: { id } });
    if (!category) throw new NotFoundException("Categoría no encontrada");
    const inUse = await this.prisma.equipment.count({ where: { categoryId: id, deletedAt: null } });
    if (inUse > 0) {
      throw new BadRequestException(
        `No se puede eliminar la categoría: hay ${inUse} equipo${inUse === 1 ? "" : "s"} activo${inUse === 1 ? "" : "s"} con esta categoría.`,
      );
    }
    await this.prisma.equipmentCategory.delete({ where: { id } });
    await this.audit.record({ ...ctx, action: "equipment.category.deleted", entityType: "EquipmentCategory", entityId: id, before: { ...category } });
  }

  // --- Equipos ---------------------------------------------------------------

  /** Lista los equipos vivos de un nodo, ordenados para informes. */
  listByNode(orgNodeId: string): Promise<Equipment[]> {
    return this.prisma.equipment.findMany({
      where: { orgNodeId, deletedAt: null },
      orderBy: [{ reportOrder: "asc" }, { name: "asc" }],
    });
  }

  async create(dto: CreateEquipmentRequest, ctx: AuditContext): Promise<Equipment> {
    await this.assertNodeExists(dto.orgNodeId);
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    try {
      const equipment = await this.prisma.equipment.create({
        data: {
          name: dto.name,
          code: dto.code ?? null,
          tag: dto.tag ?? null,
          description: dto.description ?? null,
          categoryId: dto.categoryId ?? null,
          manufacturer: dto.manufacturer ?? null,
          model: dto.model ?? null,
          serialNumber: dto.serialNumber ?? null,
          criticality: dto.criticality ?? null,
          active: dto.active ?? true,
          reportOrder: dto.reportOrder ?? 0,
          orgNodeId: dto.orgNodeId,
        },
      });
      await this.audit.record({ ...ctx, action: "equipment.created", entityType: "Equipment", entityId: equipment.id, after: { ...equipment } });
      return equipment;
    } catch (err) {
      throw this.mapKnownErrors(err);
    }
  }

  async update(id: string, dto: UpdateEquipmentRequest, ctx: AuditContext): Promise<Equipment> {
    const before = await this.prisma.equipment.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException("Equipo no encontrado");
    if (dto.orgNodeId) await this.assertNodeExists(dto.orgNodeId);
    if (dto.categoryId) await this.assertCategoryExists(dto.categoryId);

    try {
      const equipment = await this.prisma.equipment.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          code: dto.code === undefined ? undefined : dto.code,
          tag: dto.tag === undefined ? undefined : dto.tag,
          description: dto.description === undefined ? undefined : dto.description,
          categoryId: dto.categoryId === undefined ? undefined : dto.categoryId,
          manufacturer: dto.manufacturer === undefined ? undefined : dto.manufacturer,
          model: dto.model === undefined ? undefined : dto.model,
          serialNumber: dto.serialNumber === undefined ? undefined : dto.serialNumber,
          criticality: dto.criticality === undefined ? undefined : dto.criticality,
          active: dto.active === undefined ? undefined : dto.active,
          reportOrder: dto.reportOrder === undefined ? undefined : dto.reportOrder,
          orgNodeId: dto.orgNodeId ?? undefined,
        },
      });
      await this.audit.record({ ...ctx, action: "equipment.updated", entityType: "Equipment", entityId: id, before: { ...before }, after: { ...equipment } });
      return equipment;
    } catch (err) {
      throw this.mapKnownErrors(err);
    }
  }

  /** Borrado lógico. */
  async delete(id: string, ctx: AuditContext): Promise<void> {
    const equipment = await this.prisma.equipment.findFirst({ where: { id, deletedAt: null } });
    if (!equipment) throw new NotFoundException("Equipo no encontrado");
    await this.prisma.equipment.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ ...ctx, action: "equipment.deleted", entityType: "Equipment", entityId: id, before: { ...equipment } });
  }

  // --- helpers ---------------------------------------------------------------

  private async assertNodeExists(orgNodeId: string): Promise<void> {
    const exists = await this.prisma.orgNode.count({ where: { id: orgNodeId, deletedAt: null } });
    if (exists === 0) throw new BadRequestException("El nodo indicado no existe");
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const exists = await this.prisma.equipmentCategory.count({ where: { id: categoryId } });
    if (exists === 0) throw new BadRequestException("La categoría indicada no existe");
  }

  /** Traduce errores conocidos de Prisma a excepciones HTTP con mensaje útil. */
  private mapKnownErrors(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new BadRequestException("Ya existe un equipo con ese tag (debe ser único).");
    }
    return err;
  }
}
