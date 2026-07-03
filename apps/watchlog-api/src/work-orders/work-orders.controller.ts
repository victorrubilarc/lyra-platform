import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  addWorkOrderChecklistRequestSchema,
  addWorkOrderWorkerRequestSchema,
  assignWorkOrderRequestSchema,
  cancelWorkOrderRequestSchema,
  confirmRosterRequestSchema,
  removeWorkOrderWorkerRequestSchema,
  createWorkActivitiesBatchRequestSchema,
  createWorkActivityRequestSchema,
  createWorkOrderRequestSchema,
  recordWorkActivityProgressRequestSchema,
  reorderWorkActivitiesRequestSchema,
  reviewWorkOrderChecklistRequestSchema,
  transitionWorkOrderRequestSchema,
  updateWorkActivityRequestSchema,
  updateWorkOrderRequestSchema,
  upsertWorkOrderChecklistRuleRequestSchema,
  upsertWorkOrderTagRequestSchema,
  upsertWorkOrderTypeRequestSchema,
  workOrderDashboardQuerySchema,
  workOrderListQuerySchema,
  type AddWorkOrderChecklistRequest,
  type AddWorkOrderWorkerRequest,
  type AssignWorkOrderRequest,
  type CancelWorkOrderRequest,
  type ConfirmRosterRequest,
  type RemoveWorkOrderWorkerRequest,
  type CreateWorkActivitiesBatchRequest,
  type CreateWorkActivityRequest,
  type CreateWorkOrderRequest,
  type RecordWorkActivityProgressRequest,
  type ReorderWorkActivitiesRequest,
  type ReviewWorkOrderChecklistRequest,
  type TransitionWorkOrderRequest,
  type UpdateWorkActivityRequest,
  type UpdateWorkOrderRequest,
  type UpsertSpecialtyRequest,
  type UpsertWorkOrderChecklistRuleRequest,
  type UpsertWorkOrderTypeRequest,
  type WorkOrderDashboardQuery,
  type WorkOrderListQuery,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WorkOrdersService } from "./work-orders.service";
import { WorkOrderChecklistsService } from "./work-order-checklists.service";
import { WorkActivitiesService } from "./work-activities.service";
import { WorkOrderRosterService } from "./work-order-roster.service";
import { WorkOrderDashboardService } from "./work-order-dashboard.service";

@Controller("work-orders")
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrdersService,
    private readonly checklists: WorkOrderChecklistsService,
    private readonly activities: WorkActivitiesService,
    private readonly roster: WorkOrderRosterService,
    private readonly dashboard: WorkOrderDashboardService,
  ) {}

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

  // --- Reglas de checklist (Capa A · catálogo; antes de :id) -----------------

  @Get("checklist-rules")
  @RequirePermission("workorder:view")
  listChecklistRules(@Query("includeInactive") includeInactive?: string) {
    return this.checklists.listRules(includeInactive === "true");
  }

  @Post("checklist-rules")
  @RequirePermission("workordercatalog:manage")
  upsertChecklistRule(
    @Body(new ZodValidationPipe(upsertWorkOrderChecklistRuleRequestSchema)) dto: UpsertWorkOrderChecklistRuleRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.checklists.upsertRule(dto, this.ctx(user, req));
  }

  @Delete("checklist-rules/:ruleId")
  @HttpCode(204)
  @RequirePermission("workordercatalog:manage")
  async deleteChecklistRule(@Param("ruleId") ruleId: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    await this.checklists.deleteRule(ruleId, this.ctx(user, req));
  }

  // --- KPIs / selectores -----------------------------------------------------

  @Get("stats")
  @RequirePermission("workorder:view")
  stats(@CurrentUser() user: RequestUser, @Query("structureId") structureId?: string) {
    return this.workOrders.stats(user.id, structureId);
  }

  /**
   * Dashboard analítico de OT (S7a). Read-only, agregado en el backend con el MISMO ABAC
   * por nodo ∩ estructura activa que la lista: no expone nada que el usuario no vea, solo
   * lo agrega. Gate REUSANDO `workorder:view` (sin permiso nuevo, como incidencias reusó
   * `incident:view`). Ruta ESTÁTICA antes de `:id`.
   */
  @Get("dashboard")
  @RequirePermission("workorder:view")
  dashboardData(
    @Query(new ZodValidationPipe(workOrderDashboardQuerySchema)) q: WorkOrderDashboardQuery,
    @CurrentUser() user: RequestUser,
    @Query("structureId") structureId?: string,
  ) {
    return this.dashboard.build(user.id, q, structureId);
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

  // Puerta 1 (S2): ejecutar una transición del flujo congelado. El gate base es
  // `workorder:transition` (dim. WORKFLOW, fork W2); QUIÉN puede cada puerta es DATO
  // (WorkflowTransitionRole) y lo re-verifica el servicio, junto con la firma Part 11.
  @Post(":id/transitions")
  @HttpCode(200)
  @RequirePermission("workorder:transition")
  transition(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(transitionWorkOrderRequestSchema)) dto: TransitionWorkOrderRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.workOrders.transition(user.id, id, dto, this.ctx(user, req));
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

  // --- Checklists de una OT (Capa B · Puerta 2, S3) --------------------------

  @Get(":id/checklists")
  @RequirePermission("workorder:view")
  listChecklists(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.checklists.listForWorkOrder(user.id, id);
  }

  @Post(":id/checklists/suggest")
  @HttpCode(200)
  @RequirePermission("workorder:checklist:manage")
  suggestChecklists(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.checklists.suggest(user.id, id, this.ctx(user, req));
  }

  // Gobierno 2 (S5b): el aprobador CONFIRMA el set de verificaciones de EJECUCIÓN antes de
  // autorizar el permiso. Ruta literal ANTES de `:cid` para no colisionar con el param.
  @Post(":id/checklists/execution-set/confirm")
  @HttpCode(200)
  @RequirePermission("workorder:checklist:manage")
  confirmExecutionSet(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.checklists.confirmExecutionSet(user.id, id, this.ctx(user, req));
  }

  @Post(":id/checklists")
  @RequirePermission("workorder:checklist:manage")
  addChecklist(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addWorkOrderChecklistRequestSchema)) dto: AddWorkOrderChecklistRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.checklists.addManual(user.id, id, dto, this.ctx(user, req));
  }

  @Delete(":id/checklists/:cid")
  @HttpCode(204)
  @RequirePermission("workorder:checklist:manage")
  async removeChecklist(@Param("id") id: string, @Param("cid") cid: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    await this.checklists.remove(user.id, id, cid, this.ctx(user, req));
  }

  @Post(":id/checklists/:cid/instantiate")
  @HttpCode(200)
  @RequirePermission("workorder:checklist:manage")
  instantiateChecklist(@Param("id") id: string, @Param("cid") cid: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.checklists.instantiate(user.id, id, cid, this.ctx(user, req));
  }

  @Post(":id/checklists/:cid/submit")
  @HttpCode(200)
  @RequirePermission("workorder:checklist:manage")
  submitChecklist(@Param("id") id: string, @Param("cid") cid: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.checklists.submit(user.id, id, cid, this.ctx(user, req));
  }

  @Post(":id/checklists/:cid/review")
  @HttpCode(200)
  @RequirePermission("workorder:checklist:manage")
  reviewChecklist(
    @Param("id") id: string,
    @Param("cid") cid: string,
    @Body(new ZodValidationPipe(reviewWorkOrderChecklistRequestSchema)) dto: ReviewWorkOrderChecklistRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.checklists.review(user.id, id, cid, dto, this.ctx(user, req));
  }

  // --- Plan de actividades de una OT (Puerta 3, S4) --------------------------

  @Get(":id/activities")
  @RequirePermission("workorder:view")
  listActivities(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.activities.listForWorkOrder(user.id, id);
  }

  @Post(":id/activities")
  @RequirePermission("workorder:activity:manage")
  createActivity(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createWorkActivityRequestSchema)) dto: CreateWorkActivityRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.activities.create(user.id, id, dto, this.ctx(user, req));
  }

  // Alta en lote (lo usa el asistente guiado que genera el plan completo).
  @Post(":id/activities/batch")
  @HttpCode(200)
  @RequirePermission("workorder:activity:manage")
  createActivitiesBatch(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createWorkActivitiesBatchRequestSchema)) dto: CreateWorkActivitiesBatchRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.activities.createBatch(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/activities/reorder")
  @HttpCode(200)
  @RequirePermission("workorder:activity:manage")
  reorderActivities(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(reorderWorkActivitiesRequestSchema)) dto: ReorderWorkActivitiesRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.activities.reorder(user.id, id, dto, this.ctx(user, req));
  }

  @Patch(":id/activities/:aid")
  @RequirePermission("workorder:activity:manage")
  updateActivity(
    @Param("id") id: string,
    @Param("aid") aid: string,
    @Body(new ZodValidationPipe(updateWorkActivityRequestSchema)) dto: UpdateWorkActivityRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.activities.update(user.id, id, aid, dto, this.ctx(user, req));
  }

  @Delete(":id/activities/:aid")
  @HttpCode(204)
  @RequirePermission("workorder:activity:manage")
  async removeActivity(@Param("id") id: string, @Param("aid") aid: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    await this.activities.remove(user.id, id, aid, this.ctx(user, req));
  }

  // === Seguimiento del avance (S5 — Puerta 4) ================================

  /** Historial (append-only) de avance de una actividad. Solo lectura + ABAC. */
  @Get(":id/activities/:aid/updates")
  @RequirePermission("workorder:view")
  listActivityUpdates(@Param("id") id: string, @Param("aid") aid: string, @CurrentUser() user: RequestUser) {
    return this.activities.listUpdates(user.id, id, aid);
  }

  /** Registra un avance de la actividad (crea un registro append-only + actualiza la foto vigente). */
  @Post(":id/activities/:aid/progress")
  @RequirePermission("workorder:activity:manage")
  recordActivityProgress(
    @Param("id") id: string,
    @Param("aid") aid: string,
    @Body(new ZodValidationPipe(recordWorkActivityProgressRequestSchema)) dto: RecordWorkActivityProgressRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.activities.recordProgress(user.id, id, aid, dto, this.ctx(user, req));
  }

  // --- Dotación del permiso (S1) ---------------------------------------------

  /** Estado de la dotación de la OT (roster + roles + confirmación + semáforo). */
  @Get(":id/roster")
  @RequirePermission("workorder:view")
  getRoster(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.roster.getRoster(user.id, id);
  }

  /** Agrega una persona a la dotación con su rol (invalida una confirmación previa). */
  @Post(":id/roster")
  @RequirePermission("workorder:roster:manage")
  addWorker(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addWorkOrderWorkerRequestSchema)) dto: AddWorkOrderWorkerRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.roster.addWorker(user.id, id, dto, this.ctx(user, req));
  }

  /**
   * Confirma (sella) la dotación con FIRMA Part 11 = gate para autorizar el permiso.
   * Ruta literal ANTES de `:workerId` para no colisionar con el param.
   */
  @Post(":id/roster/confirm")
  @HttpCode(200)
  @RequirePermission("workorder:roster:manage")
  confirmRoster(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(confirmRosterRequestSchema)) dto: ConfirmRosterRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.roster.confirmRoster(user.id, id, dto, this.ctx(user, req));
  }

  /** Quita (soft) una persona de la dotación con motivo opcional. */
  @Post(":id/roster/:workerId/remove")
  @HttpCode(200)
  @RequirePermission("workorder:roster:manage")
  removeWorker(
    @Param("id") id: string,
    @Param("workerId") workerId: string,
    @Body(new ZodValidationPipe(removeWorkOrderWorkerRequestSchema)) dto: RemoveWorkOrderWorkerRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.roster.removeWorker(user.id, id, workerId, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
