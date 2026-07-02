import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  assignWorkOrderRequestSchema,
  cancelWorkOrderRequestSchema,
  createWorkOrderRequestSchema,
  updateWorkOrderRequestSchema,
  upsertWorkOrderTagRequestSchema,
  upsertWorkOrderTypeRequestSchema,
  workOrderListQuerySchema,
  type AssignWorkOrderRequest,
  type CancelWorkOrderRequest,
  type CreateWorkOrderRequest,
  type UpdateWorkOrderRequest,
  type UpsertSpecialtyRequest,
  type UpsertWorkOrderTypeRequest,
  type WorkOrderListQuery,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WorkOrdersService } from "./work-orders.service";

@Controller("work-orders")
export class WorkOrdersController {
  constructor(private readonly workOrders: WorkOrdersService) {}

  // --- Catálogos (antes de :id para no chocar) -------------------------------

  @Get("types")
  @RequirePermission("workorder:view")
  listTypes(@Query("includeInactive") includeInactive?: string) {
    return this.workOrders.listTypes(includeInactive === "true");
  }

  @Post("types")
  @RequirePermission("workordercatalog:manage")
  upsertType(
    @Body(new ZodValidationPipe(upsertWorkOrderTypeRequestSchema)) dto: UpsertWorkOrderTypeRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Query("create") create?: string,
  ) {
    return this.workOrders.upsertType(dto, this.ctx(user, req), create === "true");
  }

  @Get("specialties")
  @RequirePermission("workorder:view")
  listSpecialties(@Query("includeInactive") includeInactive?: string) {
    return this.workOrders.listSpecialties(includeInactive === "true");
  }

  @Post("specialties")
  @RequirePermission("workordercatalog:manage")
  upsertSpecialty(
    @Body(new ZodValidationPipe(upsertWorkOrderTagRequestSchema)) dto: UpsertSpecialtyRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Query("create") create?: string,
  ) {
    return this.workOrders.upsertSpecialty(dto, this.ctx(user, req), create === "true");
  }

  // --- KPIs / selectores -----------------------------------------------------

  @Get("stats")
  @RequirePermission("workorder:view")
  stats(@CurrentUser() user: RequestUser, @Query("structureId") structureId?: string) {
    return this.workOrders.stats(user.id, structureId);
  }

  @Get("users")
  @RequirePermission("workorder:view")
  assignableUsers() {
    return this.workOrders.assignableUsers();
  }

  @Get("equipment-options")
  @RequirePermission("workorder:view")
  equipmentOptions(@Query("nodeId") nodeId: string, @CurrentUser() user: RequestUser) {
    return nodeId ? this.workOrders.equipmentOptions(user.id, nodeId) : [];
  }

  // --- Listado / detalle -----------------------------------------------------

  @Get()
  @RequirePermission("workorder:view")
  list(
    @Query(new ZodValidationPipe(workOrderListQuerySchema)) q: WorkOrderListQuery,
    @CurrentUser() user: RequestUser,
    @Query("structureId") structureId?: string,
  ) {
    return this.workOrders.list(user.id, q, structureId);
  }

  @Get(":id")
  @RequirePermission("workorder:view")
  getDetail(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.workOrders.getDetail(user.id, id);
  }

  // --- Mutaciones ------------------------------------------------------------

  @Post()
  @RequirePermission("workorder:create")
  create(
    @Body(new ZodValidationPipe(createWorkOrderRequestSchema)) dto: CreateWorkOrderRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workOrders.create(user.id, dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("workorder:edit")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateWorkOrderRequestSchema)) dto: UpdateWorkOrderRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workOrders.update(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/assign")
  @HttpCode(200)
  @RequirePermission("workorder:assign")
  assign(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignWorkOrderRequestSchema)) dto: AssignWorkOrderRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workOrders.assign(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermission("workorder:cancel")
  cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelWorkOrderRequestSchema)) dto: CancelWorkOrderRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workOrders.cancel(user.id, id, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
