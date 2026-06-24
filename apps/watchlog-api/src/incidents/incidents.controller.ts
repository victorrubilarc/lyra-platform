import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  addIncidentCommentRequestSchema,
  assignIncidentRequestSchema,
  cancelIncidentActionRequestSchema,
  cancelIncidentReportRequestSchema,
  cancelIncidentRequestSchema,
  completeIncidentActionRequestSchema,
  completeIncidentInvestigationRequestSchema,
  createIncidentActionRequestSchema,
  createIncidentReportRequestSchema,
  createIncidentRequestSchema,
  incidentDashboardQuerySchema,
  incidentListQuerySchema,
  markIncidentReportNotApplicableRequestSchema,
  submitIncidentReportRequestSchema,
  transitionIncidentRequestSchema,
  updateIncidentActionRequestSchema,
  updateIncidentReportRequestSchema,
  upsertIncidentInvestigationRequestSchema,
  updateIncidentRequestSchema,
  upsertIncidentCategoryRequestSchema,
  upsertIncidentTypeRequestSchema,
  upsertReportingObligationRequestSchema,
  verifyIncidentActionRequestSchema,
  type AddIncidentCommentRequest,
  type AssignIncidentRequest,
  type CancelIncidentActionRequest,
  type CancelIncidentReportRequest,
  type CancelIncidentRequest,
  type CompleteIncidentActionRequest,
  type CompleteIncidentInvestigationRequest,
  type CreateIncidentActionRequest,
  type CreateIncidentReportRequest,
  type CreateIncidentRequest,
  type IncidentDashboardQuery,
  type IncidentListQuery,
  type MarkIncidentReportNotApplicableRequest,
  type SubmitIncidentReportRequest,
  type TransitionIncidentRequest,
  type UpdateIncidentActionRequest,
  type UpdateIncidentReportRequest,
  type UpdateIncidentRequest,
  type UpsertIncidentInvestigationRequest,
  type UpsertIncidentCategoryRequest,
  type UpsertIncidentTypeRequest,
  type UpsertReportingObligationRequest,
  type VerifyIncidentActionRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { IncidentActionsService } from "./incident-actions.service";
import { IncidentDashboardService } from "./incident-dashboard.service";
import { IncidentInvestigationService } from "./incident-investigation.service";
import { IncidentReportsService } from "./incident-reports.service";
import { IncidentsService } from "./incidents.service";

@Controller("incidents")
export class IncidentsController {
  constructor(
    private readonly incidents: IncidentsService,
    private readonly actions: IncidentActionsService,
    private readonly investigation: IncidentInvestigationService,
    private readonly reports: IncidentReportsService,
    private readonly dashboard: IncidentDashboardService,
  ) {}

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

  // --- Catálogo de obligaciones de reporte (Fase 4.3) ------------------------

  @Get("obligations")
  @RequirePermission("incident:view")
  listObligations(@Query("includeInactive") includeInactive?: string) {
    return this.reports.listObligations(includeInactive === "true");
  }

  @Post("obligations")
  @RequirePermission("incidentcatalog:manage")
  upsertObligation(
    @Body(new ZodValidationPipe(upsertReportingObligationRequestSchema)) dto: UpsertReportingObligationRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Query("create") create?: string,
  ) {
    return this.reports.upsertObligation(dto, this.ctx(user, req), create === "true");
  }

  // --- KPIs ------------------------------------------------------------------

  @Get("stats")
  @RequirePermission("incident:view")
  stats(@CurrentUser() user: RequestUser, @Query("structureId") structureId?: string) {
    return this.incidents.stats(user.id, structureId);
  }

  /**
   * Dashboard de incidencias (Fase 4.5): analítica agregada read-only con ABAC por
   * nodo (idéntico a la lista). Sin permiso nuevo — `incident:view` ya basta: no
   * expone nada que el usuario no vea ya, solo lo agrega.
   */
  @Get("dashboard")
  @RequirePermission("incident:view")
  dashboardData(
    @Query(new ZodValidationPipe(incidentDashboardQuerySchema)) q: IncidentDashboardQuery,
    @CurrentUser() user: RequestUser,
    @Query("structureId") structureId?: string,
  ) {
    return this.dashboard.build(user.id, q, structureId);
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
    @Query("structureId") structureId?: string,
  ) {
    return this.incidents.list(user.id, q, structureId);
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

  // --- Acciones CAPA (Fase 4.2a) ---------------------------------------------

  @Get(":id/actions")
  @RequirePermission("incident:view")
  listActions(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.actions.list(user.id, id);
  }

  @Post(":id/actions")
  @RequirePermission("incident:action:manage")
  createAction(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createIncidentActionRequestSchema)) dto: CreateIncidentActionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.actions.create(user.id, id, dto, this.ctx(user, req));
  }

  @Patch("actions/:actionId")
  @RequirePermission("incident:action:manage")
  updateAction(
    @Param("actionId") actionId: string,
    @Body(new ZodValidationPipe(updateIncidentActionRequestSchema)) dto: UpdateIncidentActionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.actions.update(user.id, actionId, dto, this.ctx(user, req));
  }

  @Post("actions/:actionId/complete")
  @HttpCode(200)
  @RequirePermission("incident:action:manage")
  completeAction(
    @Param("actionId") actionId: string,
    @Body(new ZodValidationPipe(completeIncidentActionRequestSchema)) dto: CompleteIncidentActionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.actions.complete(user.id, actionId, dto, this.ctx(user, req));
  }

  @Post("actions/:actionId/verify")
  @HttpCode(200)
  @RequirePermission("incident:action:verify")
  verifyAction(
    @Param("actionId") actionId: string,
    @Body(new ZodValidationPipe(verifyIncidentActionRequestSchema)) dto: VerifyIncidentActionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.actions.verify(user.id, actionId, dto, this.ctx(user, req));
  }

  @Post("actions/:actionId/cancel")
  @HttpCode(200)
  @RequirePermission("incident:action:manage")
  cancelAction(
    @Param("actionId") actionId: string,
    @Body(new ZodValidationPipe(cancelIncidentActionRequestSchema)) dto: CancelIncidentActionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.actions.cancel(user.id, actionId, dto, this.ctx(user, req));
  }

  // --- Investigación de causa raíz (Fase 4.2b; gobernada por incident:edit) --

  @Get(":id/investigation")
  @RequirePermission("incident:view")
  getInvestigation(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.investigation.get(user.id, id);
  }

  @Post(":id/investigation")
  @RequirePermission("incident:edit")
  upsertInvestigation(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(upsertIncidentInvestigationRequestSchema)) dto: UpsertIncidentInvestigationRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.investigation.upsert(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/investigation/complete")
  @HttpCode(200)
  @RequirePermission("incident:edit")
  completeInvestigation(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(completeIncidentInvestigationRequestSchema)) dto: CompleteIncidentInvestigationRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.investigation.complete(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/investigation/reopen")
  @HttpCode(200)
  @RequirePermission("incident:edit")
  reopenInvestigation(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.investigation.reopen(user.id, id, this.ctx(user, req));
  }

  // --- Reportabilidad (Fase 4.3; gobernada por incident:edit) ----------------

  @Get(":id/reports")
  @RequirePermission("incident:view")
  listReports(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.reports.list(user.id, id);
  }

  /** Re-derivar los reportes aplicables (materializa los que falten). */
  @Post(":id/reports/materialize")
  @HttpCode(200)
  @RequirePermission("incident:edit")
  materializeReports(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.reports.materializeForIncident(user.id, id, this.ctx(user, req));
  }

  @Post(":id/reports")
  @RequirePermission("incident:edit")
  createReport(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(createIncidentReportRequestSchema)) dto: CreateIncidentReportRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.reports.create(user.id, id, dto, this.ctx(user, req));
  }

  @Patch("reports/:reportId")
  @RequirePermission("incident:edit")
  updateReport(
    @Param("reportId") reportId: string,
    @Body(new ZodValidationPipe(updateIncidentReportRequestSchema)) dto: UpdateIncidentReportRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.reports.update(user.id, reportId, dto, this.ctx(user, req));
  }

  @Post("reports/:reportId/submit")
  @HttpCode(200)
  @RequirePermission("incident:edit")
  submitReport(
    @Param("reportId") reportId: string,
    @Body(new ZodValidationPipe(submitIncidentReportRequestSchema)) dto: SubmitIncidentReportRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.reports.submit(user.id, reportId, dto, this.ctx(user, req));
  }

  @Post("reports/:reportId/not-applicable")
  @HttpCode(200)
  @RequirePermission("incident:edit")
  markReportNotApplicable(
    @Param("reportId") reportId: string,
    @Body(new ZodValidationPipe(markIncidentReportNotApplicableRequestSchema)) dto: MarkIncidentReportNotApplicableRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.reports.markNotApplicable(user.id, reportId, dto, this.ctx(user, req));
  }

  @Post("reports/:reportId/cancel")
  @HttpCode(200)
  @RequirePermission("incident:edit")
  cancelReport(
    @Param("reportId") reportId: string,
    @Body(new ZodValidationPipe(cancelIncidentReportRequestSchema)) dto: CancelIncidentReportRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.reports.cancel(user.id, reportId, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
