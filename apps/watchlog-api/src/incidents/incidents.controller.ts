import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  addIncidentCommentRequestSchema,
  assignIncidentRequestSchema,
  cancelIncidentRequestSchema,
  createIncidentRequestSchema,
  incidentListQuerySchema,
  transitionIncidentRequestSchema,
  updateIncidentRequestSchema,
  upsertIncidentCategoryRequestSchema,
  upsertIncidentTypeRequestSchema,
  type AddIncidentCommentRequest,
  type AssignIncidentRequest,
  type CancelIncidentRequest,
  type CreateIncidentRequest,
  type IncidentListQuery,
  type TransitionIncidentRequest,
  type UpdateIncidentRequest,
  type UpsertIncidentCategoryRequest,
  type UpsertIncidentTypeRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { IncidentsService } from "./incidents.service";

@Controller("incidents")
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  // --- Catálogos (antes de :id para no chocar) -------------------------------

  @Get("types")
  @RequirePermission("incident:view")
  listTypes(@Query("includeInactive") includeInactive?: string) {
    return this.incidents.listTypes(includeInactive === "true");
  }

  @Get("categories")
  @RequirePermission("incident:view")
  listCategories(@Query("includeInactive") includeInactive?: string) {
    return this.incidents.listCategories(includeInactive === "true");
  }

  @Post("types")
  @RequirePermission("incidentcatalog:manage")
  upsertType(
    @Body(new ZodValidationPipe(upsertIncidentTypeRequestSchema)) dto: UpsertIncidentTypeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Query("create") create?: string,
  ) {
    return this.incidents.upsertType(dto, this.ctx(user, req), create === "true");
  }

  @Post("categories")
  @RequirePermission("incidentcatalog:manage")
  upsertCategory(
    @Body(new ZodValidationPipe(upsertIncidentCategoryRequestSchema)) dto: UpsertIncidentCategoryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Query("create") create?: string,
  ) {
    return this.incidents.upsertCategory(dto, this.ctx(user, req), create === "true");
  }

  // --- KPIs ------------------------------------------------------------------

  @Get("stats")
  @RequirePermission("incident:view")
  stats(@CurrentUser() user: RequestUser) {
    return this.incidents.stats(user.id);
  }

  /** Usuarios asignables como responsable (selector del detalle). */
  @Get("users")
  @RequirePermission("incident:view")
  assignableUsers() {
    return this.incidents.assignableUsers();
  }

  /** Equipos/activos del nodo para el selector del alta (ABAC por nodo). */
  @Get("equipment-options")
  @RequirePermission("incident:view")
  equipmentOptions(@Query("nodeId") nodeId: string, @CurrentUser() user: RequestUser) {
    return nodeId ? this.incidents.equipmentOptions(user.id, nodeId) : [];
  }

  // --- Listado / detalle -----------------------------------------------------

  @Get()
  @RequirePermission("incident:view")
  list(
    @Query(new ZodValidationPipe(incidentListQuerySchema)) q: IncidentListQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.incidents.list(user.id, q);
  }

  @Get(":id")
  @RequirePermission("incident:view")
  getDetail(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.incidents.getDetail(user.id, id);
  }

  // --- Mutaciones ------------------------------------------------------------

  @Post()
  @RequirePermission("incident:create")
  create(
    @Body(new ZodValidationPipe(createIncidentRequestSchema)) dto: CreateIncidentRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.incidents.create(user.id, dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("incident:edit")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateIncidentRequestSchema)) dto: UpdateIncidentRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.incidents.update(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/assign")
  @HttpCode(200)
  @RequirePermission("incident:assign")
  assign(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignIncidentRequestSchema)) dto: AssignIncidentRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.incidents.assign(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/comments")
  @RequirePermission("incident:comment")
  addComment(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addIncidentCommentRequestSchema)) dto: AddIncidentCommentRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.incidents.addComment(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/transitions")
  @HttpCode(200)
  @RequirePermission("incident:transition")
  transition(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(transitionIncidentRequestSchema)) dto: TransitionIncidentRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.incidents.transition(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermission("incident:cancel")
  cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelIncidentRequestSchema)) dto: CancelIncidentRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.incidents.cancel(user.id, id, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
