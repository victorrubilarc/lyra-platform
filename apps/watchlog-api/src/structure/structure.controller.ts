import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  createOrgLevelRequestSchema,
  createOrgNodeRequestSchema,
  createOrgStructureRequestSchema,
  updateOrgLevelRequestSchema,
  updateOrgNodeRequestSchema,
  updateOrgStructureRequestSchema,
  type CreateOrgLevelRequest,
  type CreateOrgNodeRequest,
  type CreateOrgStructureRequest,
  type UpdateOrgLevelRequest,
  type UpdateOrgNodeRequest,
  type UpdateOrgStructureRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { StructureService } from "./structure.service";

@Controller("structure")
export class StructureController {
  constructor(private readonly structure: StructureService) {}

  // --- Estructuras ---

  @Get("structures")
  @RequirePermission("orgnode:read")
  listStructures(@CurrentUser() user: RequestUser) {
    return this.structure.listStructures(user.id);
  }

  @Post("structures")
  @RequirePermission("orglevel:manage")
  createStructure(
    @Body(new ZodValidationPipe(createOrgStructureRequestSchema)) dto: CreateOrgStructureRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.createStructure(dto, this.ctx(user, req));
  }

  @Patch("structures/:id")
  @RequirePermission("orglevel:manage")
  updateStructure(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrgStructureRequestSchema)) dto: UpdateOrgStructureRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.updateStructure(id, dto, this.ctx(user, req));
  }

  @Delete("structures/:id")
  @HttpCode(204)
  @RequirePermission("orglevel:manage")
  async deleteStructure(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.structure.deleteStructure(id, this.ctx(user, req));
  }

  // --- Niveles ---

  @Get("levels")
  @RequirePermission("orgnode:read")
  listLevels(@Query("structureId") structureId?: string) {
    return this.structure.listLevels(structureId);
  }

  @Post("levels")
  @RequirePermission("orglevel:manage")
  createLevel(
    @Body(new ZodValidationPipe(createOrgLevelRequestSchema)) dto: CreateOrgLevelRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.createLevel(dto, this.ctx(user, req));
  }

  @Patch("levels/:id")
  @RequirePermission("orglevel:manage")
  updateLevel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrgLevelRequestSchema)) dto: UpdateOrgLevelRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.updateLevel(id, dto, this.ctx(user, req));
  }

  @Delete("levels/:id")
  @HttpCode(204)
  @RequirePermission("orglevel:manage")
  async deleteLevel(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.structure.deleteLevel(id, this.ctx(user, req));
  }

  // --- Nodos ---

  @Get("nodes")
  @RequirePermission("orgnode:read")
  getTree(@Query("structureId") structureId?: string) {
    return this.structure.getTree(structureId);
  }

  /**
   * Árbol de nodos ACOTADO al alcance ABAC del usuario, para los SELECTORES de
   * flujo operacional (crear incidencia/bitácora…), NO para la administración.
   * NO exige `orgnode:read` (un operador no administra la estructura): el alcance
   * del propio usuario ES la autorización — el servicio nunca devuelve nodos
   * ajenos. Un usuario sin restricción de alcance recibe el árbol completo.
   */
  @Get("accessible-nodes")
  getAccessibleTree(@CurrentUser() user: RequestUser, @Query("structureId") structureId?: string) {
    return this.structure.getAccessibleTree(user.id, structureId);
  }

  @Post("nodes")
  @RequirePermission("orgnode:create")
  createNode(
    @Body(new ZodValidationPipe(createOrgNodeRequestSchema)) dto: CreateOrgNodeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.createNode(dto, this.ctx(user, req));
  }

  @Patch("nodes/:id")
  @RequirePermission("orgnode:edit")
  updateNode(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOrgNodeRequestSchema)) dto: UpdateOrgNodeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.structure.updateNode(id, dto, this.ctx(user, req));
  }

  @Delete("nodes/:id")
  @HttpCode(204)
  @RequirePermission("orgnode:delete")
  async deleteNode(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    await this.structure.deleteNode(id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
