import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateReferenceItemRequest,
  CreateReferenceListRequest,
  ResolvedOption,
  UpdateReferenceItemRequest,
  UpdateReferenceListRequest,
} from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import type { ReferenceItem, ReferenceList } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Datos de referencia / Listas (ReferenceList + ReferenceItem).
 *
 * Catálogo GOBERNADO (no versionado-inmutable como Template/Workflow): code
 * estable + activar/desactivar + sortOrder + borrado lógico de la lista. Ver
 * docs/DECISIONS.md (2026-06-09). El `code` es el valor que el llenado (Fase 2.4)
 * persiste, no el label. Un code en uso se desactiva, no se borra.
 *
 * La `key` de la lista es la clave de join que referencia el
 * `optionSource.referenceList.listKey` de un campo SELECT/MULTISELECT. Una lista
 * referenciada por una plantilla no se puede borrar (guard en `remove`).
 */
@Injectable()
export class ReferenceListsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Listas ----------------------------------------------------------------

  /** Lista todas las listas vivas con su conteo de ítems. */
  async list(): Promise<(ReferenceList & { itemCount: number })[]> {
    const lists = await this.prisma.referenceList.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { _count: { select: { items: true } } },
    });
    return lists.map(({ _count, ...l }) => ({ ...l, itemCount: _count.items }));
  }

  /** Detalle de una lista con sus ítems ordenados. */
  async getDetail(id: string): Promise<ReferenceList & { items: ReferenceItem[] }> {
    const list = await this.prisma.referenceList.findFirst({
      where: { id, deletedAt: null },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
    });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");
    return list;
  }

  async create(dto: CreateReferenceListRequest, ctx: AuditContext): Promise<ReferenceList & { items: ReferenceItem[] }> {
    const list = await this.prisma.referenceList
      .create({
        data: {
          key: dto.key,
          name: dto.name,
          description: dto.description ?? null,
          source: dto.source ?? "MANUAL",
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
        },
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateKey(err, dto.key);
      });
    await this.audit.record({ ...ctx, action: "referencelist.created", entityType: "ReferenceList", entityId: list.id, after: { ...list } });
    return { ...list, items: [] };
  }

  async update(id: string, dto: UpdateReferenceListRequest, ctx: AuditContext): Promise<ReferenceList & { items: ReferenceItem[] }> {
    const before = await this.prisma.referenceList.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException("Lista de referencia no encontrada");
    const list = await this.prisma.referenceList.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description === undefined ? undefined : dto.description,
        source: dto.source ?? undefined,
        active: dto.active === undefined ? undefined : dto.active,
        sortOrder: dto.sortOrder === undefined ? undefined : dto.sortOrder,
      },
    });
    await this.audit.record({ ...ctx, action: "referencelist.updated", entityType: "ReferenceList", entityId: id, before: { ...before }, after: { ...list } });
    return this.getDetail(id);
  }

  /**
   * Borrado lógico de la lista. Se bloquea si alguna plantilla referencia su
   * `key` desde un campo (`optionSource.referenceList.listKey`), para no dejar
   * configuraciones colgando (integridad, espejo del guard de Flujos).
   */
  async remove(id: string, ctx: AuditContext): Promise<void> {
    const list = await this.prisma.referenceList.findFirst({ where: { id, deletedAt: null } });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");

    const usedBy = await this.countTemplateFieldsUsing(list.key);
    if (usedBy > 0) {
      throw new BadRequestException(
        `La lista está en uso por ${usedBy} campo${usedBy === 1 ? "" : "s"} de plantilla y no puede eliminarse. Desactívela si ya no debe usarse.`,
      );
    }

    await this.prisma.referenceList.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ ...ctx, action: "referencelist.deleted", entityType: "ReferenceList", entityId: id, before: { key: list.key, name: list.name } });
  }

  // --- Ítems -----------------------------------------------------------------

  async createItem(listId: string, dto: CreateReferenceItemRequest, ctx: AuditContext): Promise<ReferenceItem> {
    const list = await this.prisma.referenceList.findFirst({ where: { id: listId, deletedAt: null } });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");
    const item = await this.prisma.referenceItem
      .create({
        data: {
          listId,
          code: dto.code,
          label: dto.label,
          active: dto.active ?? true,
          sortOrder: dto.sortOrder ?? 0,
          metadata: this.toJsonInput(dto.metadata),
        },
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateCode(err, dto.code);
      });
    await this.audit.record({ ...ctx, action: "referencelist.item.created", entityType: "ReferenceItem", entityId: item.id, after: { ...item } });
    return item;
  }

  async updateItem(listId: string, itemId: string, dto: UpdateReferenceItemRequest, ctx: AuditContext): Promise<ReferenceItem> {
    const before = await this.prisma.referenceItem.findFirst({ where: { id: itemId, listId } });
    if (!before) throw new NotFoundException("Ítem no encontrado");
    const item = await this.prisma.referenceItem
      .update({
        where: { id: itemId },
        data: {
          code: dto.code ?? undefined,
          label: dto.label ?? undefined,
          active: dto.active === undefined ? undefined : dto.active,
          sortOrder: dto.sortOrder === undefined ? undefined : dto.sortOrder,
          metadata: dto.metadata === undefined ? undefined : this.toJsonInput(dto.metadata),
        },
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateCode(err, dto.code ?? before.code);
      });
    await this.audit.record({ ...ctx, action: "referencelist.item.updated", entityType: "ReferenceItem", entityId: itemId, before: { ...before }, after: { ...item } });
    return item;
  }

  /**
   * Elimina (HARD) un ítem. La acción gobernada en la UI es DESACTIVAR
   * (`active=false`) — un code en uso no se borra. El hard-delete existe para
   * limpiar errores de captura mientras no haya ejecución; el guard de "code en
   * uso" real (valores de LogEntry) se incorpora en Fase 2.4.
   */
  async removeItem(listId: string, itemId: string, ctx: AuditContext): Promise<void> {
    const item = await this.prisma.referenceItem.findFirst({ where: { id: itemId, listId } });
    if (!item) throw new NotFoundException("Ítem no encontrado");
    await this.prisma.referenceItem.delete({ where: { id: itemId } });
    await this.audit.record({ ...ctx, action: "referencelist.item.deleted", entityType: "ReferenceItem", entityId: itemId, before: { code: item.code, label: item.label } });
  }

  // --- Resolución (Form Builder y, en 2.4, el llenado) -----------------------

  /**
   * Resuelve los ítems ACTIVOS de una lista (por id o por key) como opciones
   * {code, label, metadata} ordenadas. Es lo que consume el preview del Form
   * Builder y el llenado. La lista debe existir y estar viva.
   */
  async resolve(idOrKey: string): Promise<ResolvedOption[]> {
    const list = await this.prisma.referenceList.findFirst({
      where: { deletedAt: null, OR: [{ id: idOrKey }, { key: idOrKey }] },
      include: { items: { where: { active: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] } },
    });
    if (!list) throw new NotFoundException("Lista de referencia no encontrada");
    return list.items.map((i) => ({
      code: i.code,
      label: i.label,
      metadata: (i.metadata as ResolvedOption["metadata"]) ?? null,
    }));
  }

  // --- Helpers ---------------------------------------------------------------

  /** Cuenta los campos de plantilla que referencian una lista por su `key`. */
  private async countTemplateFieldsUsing(key: string): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "TemplateField"
      WHERE "config"->'optionSource'->>'kind' = 'referenceList'
        AND "config"->'optionSource'->>'listKey' = ${key}
    `;
    return Number(rows[0]?.count ?? 0);
  }

  private toJsonInput(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    if (value === null || value === undefined) return Prisma.JsonNull;
    return value as Prisma.InputJsonValue;
  }

  private mapDuplicateKey(err: unknown, key: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new BadRequestException(`Ya existe una lista con la clave "${key}".`);
    }
    return err;
  }

  private mapDuplicateCode(err: unknown, code: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new BadRequestException(`Ya existe un ítem con el código "${code}" en esta lista.`);
    }
    return err;
  }
}
