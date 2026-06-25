import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma, ThemePalette } from "@prisma/client";
import {
  paletteTokensSchema,
  type CreatePaletteRequest,
  type PalettePublicDto,
  type PaletteTokens,
  type ThemePaletteDto,
  type UpdatePaletteRequest,
  type UserThemePreferenceDto,
} from "@lyra/contracts";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

const SETTINGS_ID = "system";

/**
 * Sistema de TEMAS / PALETAS administrable (EST-TEMAS). Las paletas son overrides
 * PARCIALES de los tokens temáticos (whitelist en `@lyra/contracts`), por variante
 * clara/oscura. Un admin (`theme:manage`) las crea/edita/publica y marca la por defecto
 * de la instalación (`SystemSettings.defaultPaletteId`). Cualquier usuario autenticado
 * puede LISTAR las publicadas y ELEGIR una (preferencia portable `User.themePaletteId`),
 * sin permiso. Toda mutación de admin queda AUDITADA (config de seguridad/apariencia).
 */
@Injectable()
export class ThemeService {
  private readonly logger = new Logger(ThemeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ Admin --

  /** Todas las paletas (admin), con `isDefault` derivado del default de la instalación. */
  async listAll(): Promise<ThemePaletteDto[]> {
    const [rows, defaultId] = await Promise.all([
      this.prisma.themePalette.findMany({ orderBy: { createdAt: "asc" } }),
      this.defaultPaletteId(),
    ]);
    const names = await this.creatorNames(rows);
    return rows.map((r) => this.toDto(r, defaultId, names));
  }

  async create(dto: CreatePaletteRequest, actorId: string, ctx: AuditContext): Promise<ThemePaletteDto> {
    const row = await this.prisma.themePalette.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        tokensDark: dto.tokensDark as Prisma.InputJsonValue,
        tokensLight: dto.tokensLight as Prisma.InputJsonValue,
        createdById: actorId,
        updatedById: actorId,
      },
    });
    await this.audit.record({
      ...ctx,
      action: "theme.palette.created",
      entityType: "ThemePalette",
      entityId: row.id,
      after: this.auditShape(row),
    });
    return this.toDto(row, await this.defaultPaletteId());
  }

  async update(
    id: string,
    dto: UpdatePaletteRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<ThemePaletteDto> {
    const before = await this.mustFind(id);
    const row = await this.prisma.themePalette.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.tokensDark !== undefined ? { tokensDark: dto.tokensDark as Prisma.InputJsonValue } : {}),
        ...(dto.tokensLight !== undefined ? { tokensLight: dto.tokensLight as Prisma.InputJsonValue } : {}),
        updatedById: actorId,
      },
    });
    await this.audit.record({
      ...ctx,
      action: "theme.palette.updated",
      entityType: "ThemePalette",
      entityId: id,
      before: this.auditShape(before),
      after: this.auditShape(row),
    });
    return this.toDto(row, await this.defaultPaletteId());
  }

  /** Publica o despublica. Despublicar la paleta por defecto la quita de default. */
  async setPublished(
    id: string,
    isPublished: boolean,
    actorId: string,
    ctx: AuditContext,
  ): Promise<ThemePaletteDto> {
    const before = await this.mustFind(id);
    const row = await this.prisma.themePalette.update({
      where: { id },
      data: { isPublished, updatedById: actorId },
    });
    let defaultId = await this.defaultPaletteId();
    if (!isPublished && defaultId === id) {
      // Una paleta no publicada no puede ser la por defecto.
      await this.writeDefault(null, actorId);
      defaultId = null;
    }
    await this.audit.record({
      ...ctx,
      action: isPublished ? "theme.palette.published" : "theme.palette.unpublished",
      entityType: "ThemePalette",
      entityId: id,
      before: { isPublished: before.isPublished },
      after: { isPublished: row.isPublished },
    });
    return this.toDto(row, defaultId);
  }

  /** Marca la paleta por defecto de la instalación (debe estar PUBLICADA). `null` = sin default. */
  async setDefault(id: string | null, actorId: string, ctx: AuditContext): Promise<ThemePaletteDto[]> {
    const before = await this.defaultPaletteId();
    if (id !== null) {
      const palette = await this.mustFind(id);
      if (!palette.isPublished) {
        throw new BadRequestException("No se puede marcar por defecto una paleta sin publicar.");
      }
    }
    await this.writeDefault(id, actorId);
    await this.audit.record({
      ...ctx,
      action: "theme.default.changed",
      entityType: "SystemSettings",
      entityId: SETTINGS_ID,
      before: { defaultPaletteId: before },
      after: { defaultPaletteId: id },
    });
    return this.listAll();
  }

  async remove(id: string, actorId: string, ctx: AuditContext): Promise<void> {
    const before = await this.mustFind(id);
    const defaultId = await this.defaultPaletteId();
    if (defaultId === id) await this.writeDefault(null, actorId);
    // Los usuarios que la eligieron quedan con themePaletteId = NULL (FK SetNull).
    await this.prisma.themePalette.delete({ where: { id } });
    await this.audit.record({
      ...ctx,
      action: "theme.palette.deleted",
      entityType: "ThemePalette",
      entityId: id,
      before: this.auditShape(before),
    });
  }

  // ---------------------------------------------------- Usuario / compartido --

  /** Paletas PUBLICADAS (para el selector del usuario). */
  async listPublished(): Promise<PalettePublicDto[]> {
    const [rows, defaultId] = await Promise.all([
      this.prisma.themePalette.findMany({ where: { isPublished: true }, orderBy: { name: "asc" } }),
      this.defaultPaletteId(),
    ]);
    return rows.map((r) => this.toPublic(r, defaultId));
  }

  /**
   * Preferencia EFECTIVA del usuario: su paleta elegida si sigue publicada; si no, la
   * por defecto de la instalación (si está publicada); si tampoco, `null` (marca base).
   */
  async getMyPreference(userId: string): Promise<UserThemePreferenceDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { themePaletteId: true },
    });
    const defaultId = await this.defaultPaletteId();
    const candidateId = user?.themePaletteId ?? defaultId;
    let palette = candidateId ? await this.findPublished(candidateId) : null;
    // El usuario eligió una que luego se despublicó/borró ⇒ caer a la por defecto.
    if (!palette && user?.themePaletteId && defaultId && defaultId !== user.themePaletteId) {
      palette = await this.findPublished(defaultId);
    }
    return { palette: palette ? this.toPublic(palette, defaultId) : null };
  }

  /** El usuario elige una paleta publicada (o `null` para volver a la por defecto). */
  async selectForMe(userId: string, paletteId: string | null): Promise<UserThemePreferenceDto> {
    if (paletteId !== null) {
      const palette = await this.findPublished(paletteId);
      if (!palette) throw new NotFoundException("Paleta no disponible.");
    }
    await this.prisma.user.update({ where: { id: userId }, data: { themePaletteId: paletteId } });
    return this.getMyPreference(userId);
  }

  // ------------------------------------------------------------- Internos ----

  private async mustFind(id: string): Promise<ThemePalette> {
    const row = await this.prisma.themePalette.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Paleta no encontrada.");
    return row;
  }

  private async findPublished(id: string): Promise<ThemePalette | null> {
    return this.prisma.themePalette.findFirst({ where: { id, isPublished: true } });
  }

  private async defaultPaletteId(): Promise<string | null> {
    const s = await this.prisma.systemSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { defaultPaletteId: true },
    });
    return s?.defaultPaletteId ?? null;
  }

  private async writeDefault(id: string | null, actorId: string): Promise<void> {
    await this.prisma.systemSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, defaultPaletteId: id, updatedById: actorId },
      update: { defaultPaletteId: id, updatedById: actorId },
    });
  }

  /** Parsea defensivamente el JSON de tokens (whitelist + formato). Corrupto ⇒ {} + warning. */
  private parseTokens(value: Prisma.JsonValue): PaletteTokens {
    const parsed = paletteTokensSchema.safeParse(value ?? {});
    if (parsed.success) return parsed.data;
    this.logger.warn(`Tokens de paleta inválidos en BD, se ignoran: ${parsed.error.message}`);
    return {};
  }

  private async creatorNames(rows: ThemePalette[]): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.createdById).filter((x): x is string => !!x))];
    if (ids.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private toDto(row: ThemePalette, defaultId: string | null, names?: Map<string, string>): ThemePaletteDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tokensDark: this.parseTokens(row.tokensDark),
      tokensLight: this.parseTokens(row.tokensLight),
      isPublished: row.isPublished,
      isDefault: defaultId === row.id,
      createdByName: row.createdById ? (names?.get(row.createdById) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toPublic(row: ThemePalette, defaultId: string | null): PalettePublicDto {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      tokensDark: this.parseTokens(row.tokensDark),
      tokensLight: this.parseTokens(row.tokensLight),
      isDefault: defaultId === row.id,
    };
  }

  private auditShape(row: ThemePalette) {
    return {
      name: row.name,
      description: row.description,
      isPublished: row.isPublished,
      tokensDark: row.tokensDark as Prisma.InputJsonValue,
      tokensLight: row.tokensLight as Prisma.InputJsonValue,
    };
  }
}
