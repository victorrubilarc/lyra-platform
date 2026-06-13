import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import {
  createSavedViewRequestSchema,
  savedViewModuleSchema,
  updateSavedViewRequestSchema,
  type CreateSavedViewRequest,
  type SavedViewListResponse,
  type UpdateSavedViewRequest,
} from "@lyra/contracts";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SavedViewsService } from "./saved-views.service";

/**
 * Vistas guardadas (Fase 2.8.1b). Gateado por `logentry:view` (único módulo con
 * vistas hoy = LOGBOOK; cuando llegue otro, se gateará por módulo). La autorización
 * REAL es por OWNERSHIP en el service: cada operación filtra por el usuario actual.
 */
@Controller("saved-views")
@RequirePermission("logentry:view")
export class SavedViewsController {
  constructor(private readonly views: SavedViewsService) {}

  @Get()
  async list(@CurrentUser() user: RequestUser, @Query("module") moduleRaw: string): Promise<SavedViewListResponse> {
    const module = savedViewModuleSchema.parse(moduleRaw);
    return { views: await this.views.list(user.id, module) };
  }

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(createSavedViewRequestSchema)) dto: CreateSavedViewRequest,
  ) {
    return this.views.create(user.id, dto);
  }

  @Patch(":id")
  update(
    @CurrentUser() user: RequestUser,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateSavedViewRequestSchema)) dto: UpdateSavedViewRequest,
  ) {
    return this.views.update(user.id, id, dto);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: RequestUser, @Param("id") id: string): Promise<{ ok: true }> {
    await this.views.remove(user.id, id);
    return { ok: true };
  }
}
