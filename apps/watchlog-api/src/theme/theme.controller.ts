import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  createPaletteRequestSchema,
  publishPaletteRequestSchema,
  selectPaletteRequestSchema,
  updatePaletteRequestSchema,
  type CreatePaletteRequest,
  type PublishPaletteRequest,
  type SelectPaletteRequest,
  type UpdatePaletteRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ThemeService } from "./theme.service";

/**
 * Temas / paletas (EST-TEMAS). CONSTRUIR/PUBLICAR/DEFAULT exige `theme:manage`; LISTAR
 * publicadas y ELEGIR una NO requiere permiso (sólo sesión válida — preferencia del
 * usuario). El orden de las rutas pone las concretas (`palettes`, `me`) antes de `:id`.
 */
@Controller("theme")
export class ThemeController {
  constructor(private readonly theme: ThemeService) {}

  // --- Usuario (cualquier sesión válida; sin permiso) ---

  /** Paletas publicadas, para el selector del usuario. */
  @Get("palettes")
  listPublished() {
    return this.theme.listPublished();
  }

  /** Preferencia de tema efectiva del usuario (paleta elegida o por defecto). */
  @Get("me")
  getMine(@CurrentUser() user: RequestUser) {
    return this.theme.getMyPreference(user.id);
  }

  /** El usuario elige una paleta publicada (o `null` para volver a la por defecto). */
  @Put("me")
  selectMine(
    @Body(new ZodValidationPipe(selectPaletteRequestSchema)) dto: SelectPaletteRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.theme.selectForMe(user.id, dto.paletteId);
  }

  // --- Admin (theme:manage) ---

  /** Todas las paletas (admin). */
  @Get("admin/palettes")
  @RequirePermission("theme:manage")
  listAll() {
    return this.theme.listAll();
  }

  @Post("admin/palettes")
  @RequirePermission("theme:manage")
  create(
    @Body(new ZodValidationPipe(createPaletteRequestSchema)) dto: CreatePaletteRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.theme.create(dto, user.id, this.ctx(user, req));
  }

  @Patch("admin/palettes/:id")
  @RequirePermission("theme:manage")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updatePaletteRequestSchema)) dto: UpdatePaletteRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.theme.update(id, dto, user.id, this.ctx(user, req));
  }

  @Put("admin/palettes/:id/publish")
  @RequirePermission("theme:manage")
  publish(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(publishPaletteRequestSchema)) dto: PublishPaletteRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.theme.setPublished(id, dto.isPublished, user.id, this.ctx(user, req));
  }

  /** Marca esta paleta como la por defecto de la instalación (debe estar publicada). */
  @Put("admin/palettes/:id/default")
  @RequirePermission("theme:manage")
  setDefault(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.theme.setDefault(id, user.id, this.ctx(user, req));
  }

  /** Quita la paleta por defecto (vuelve a la marca base). */
  @Delete("admin/default")
  @RequirePermission("theme:manage")
  clearDefault(@CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.theme.setDefault(null, user.id, this.ctx(user, req));
  }

  @Delete("admin/palettes/:id")
  @RequirePermission("theme:manage")
  remove(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.theme.remove(id, user.id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return {
      actorId: user.id,
      actorEmail: user.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
    };
  }
}
