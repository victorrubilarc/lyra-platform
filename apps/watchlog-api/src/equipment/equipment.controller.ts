import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  createEquipmentCategoryRequestSchema,
  createEquipmentRequestSchema,
  updateEquipmentCategoryRequestSchema,
  updateEquipmentRequestSchema,
  type CreateEquipmentCategoryRequest,
  type CreateEquipmentRequest,
  type UpdateEquipmentCategoryRequest,
  type UpdateEquipmentRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { EquipmentService } from "./equipment.service";
import { RequireModule } from "../licensing/module-entitlement.guard";

@RequireModule("structure")
@Controller("structure/equipment")
export class EquipmentController {
  constructor(private readonly equipment: EquipmentService) {}

  // --- Catálogo de categorías ---

  @Get("categories")
  @RequirePermission("equipment:view")
  listCategories() {
    return this.equipment.listCategories();
  }

  @Post("categories")
  @RequirePermission("equipmentcategory:manage")
  createCategory(
    @Body(new ZodValidationPipe(createEquipmentCategoryRequestSchema)) dto: CreateEquipmentCategoryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.equipment.createCategory(dto, this.ctx(user, req));
  }

  @Patch("categories/:id")
  @RequirePermission("equipmentcategory:manage")
  updateCategory(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEquipmentCategoryRequestSchema)) dto: UpdateEquipmentCategoryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.equipment.updateCategory(id, dto, this.ctx(user, req));
  }

  @Delete("categories/:id")
  @HttpCode(204)
  @RequirePermission("equipmentcategory:manage")
  async deleteCategory(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.equipment.deleteCategory(id, this.ctx(user, req));
  }

  // --- Equipos ---

  @Get()
  @RequirePermission("equipment:view")
  list(
    @CurrentUser() user: RequestUser,
    @Query("orgNodeId") orgNodeId?: string,
    @Query("search") search?: string,
    @Query("structureId") structureId?: string,
  ) {
    // Aislamiento (L1a/L1b): la búsqueda se acota al ABAC por nodo del usuario y a
    // la estructura activa; el listado por nodo valida que el nodo sea accesible.
    if (search && search.trim()) return this.equipment.search(user.id, search, structureId);
    if (!orgNodeId) throw new BadRequestException("Falta el parámetro orgNodeId");
    return this.equipment.listByNode(user.id, orgNodeId);
  }

  @Post()
  @RequirePermission("equipment:create")
  create(
    @Body(new ZodValidationPipe(createEquipmentRequestSchema)) dto: CreateEquipmentRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.equipment.create(dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("equipment:edit")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateEquipmentRequestSchema)) dto: UpdateEquipmentRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.equipment.update(id, dto, this.ctx(user, req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("equipment:delete")
  async delete(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.equipment.delete(id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
