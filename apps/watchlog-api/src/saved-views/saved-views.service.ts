import { Injectable, NotFoundException } from "@nestjs/common";
import {
  savedViewConfigSchema,
  savedViewModuleSchema,
  type CreateSavedViewRequest,
  type SavedViewDto,
  type SavedViewModule,
  type UpdateSavedViewRequest,
} from "@lyra/contracts";
import type { SavedView } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/**
 * Vistas guardadas (Fase 2.8.1b). Entidad de PLATAFORMA: snapshot personal de
 * presentación de un listado (Bitácoras hoy). La autorización es por OWNERSHIP
 * (toda consulta/mutación filtra por `userId`), NO por RBAC: es preferencia del
 * usuario, como favoritos/ui-store, pero server-side para cross-device. El
 * controller exige además acceso al módulo (`logentry:view`) por defensa en capas.
 *
 * Invariante: UNA default por (userId, module) — garantizada por índice único
 * PARCIAL en BD; aquí se desmarcan las demás en la MISMA transacción para no
 * chocar con el constraint al marcar una nueva default.
 */
@Injectable()
export class SavedViewsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vistas del usuario para un módulo: la default primero, luego por nombre. */
  async list(userId: string, module: SavedViewModule): Promise<SavedViewDto[]> {
    const rows = await this.prisma.savedView.findMany({
      where: { userId, module },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(userId: string, dto: CreateSavedViewRequest): Promise<SavedViewDto> {
    const config = savedViewConfigSchema.parse(dto.config);
    const makeDefault = dto.isDefault === true;
    const row = await this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.savedView.updateMany({
          where: { userId, module: dto.module, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.savedView.create({
        data: { userId, module: dto.module, name: dto.name, config, isDefault: makeDefault },
      });
    });
    return this.toDto(row);
  }

  async update(userId: string, id: string, dto: UpdateSavedViewRequest): Promise<SavedViewDto> {
    const existing = await this.prisma.savedView.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Vista no encontrada");

    const config = dto.config !== undefined ? savedViewConfigSchema.parse(dto.config) : undefined;
    const row = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true && !existing.isDefault) {
        await tx.savedView.updateMany({
          where: { userId, module: existing.module, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.savedView.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(config !== undefined ? { config } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });
    return this.toDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const existing = await this.prisma.savedView.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundException("Vista no encontrada");
    await this.prisma.savedView.delete({ where: { id } });
  }

  private toDto(row: SavedView): SavedViewDto {
    return {
      id: row.id,
      module: savedViewModuleSchema.parse(row.module),
      name: row.name,
      // El config se validó al persistir; re-parse aplica defaults a filas viejas.
      config: savedViewConfigSchema.parse(row.config),
      isDefault: row.isDefault,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
