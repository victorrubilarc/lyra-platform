import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  assignCalendarNodesRequestSchema,
  createOperationalCalendarRequestSchema,
  operationalCalendarPreviewRequestSchema,
  updateOperationalCalendarRequestSchema,
  type AssignCalendarNodesRequest,
  type CreateOperationalCalendarRequest,
  type OperationalCalendarPreviewRequest,
  type UpdateOperationalCalendarRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OperationalCalendarService } from "./operational-calendar.service";

@Controller("operational-calendars")
export class OperationalCalendarController {
  constructor(private readonly calendars: OperationalCalendarService) {}

  @Get()
  @RequirePermission("opscalendar:view")
  list(@Query("structureId") structureId?: string) {
    return this.calendars.list(structureId);
  }

  @Get(":id")
  @RequirePermission("opscalendar:view")
  getDetail(@Param("id") id: string) {
    return this.calendars.getDetail(id);
  }

  /** Probador: resuelve un instante (turno/día operacional/periodo) contra el calendario. */
  @Post(":id/preview")
  @RequirePermission("opscalendar:view")
  preview(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(operationalCalendarPreviewRequestSchema)) dto: OperationalCalendarPreviewRequest,
  ) {
    return this.calendars.preview(id, new Date(dto.at));
  }

  @Post()
  @RequirePermission("opscalendar:manage")
  create(
    @Body(new ZodValidationPipe(createOperationalCalendarRequestSchema)) dto: CreateOperationalCalendarRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.calendars.create(dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("opscalendar:manage")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateOperationalCalendarRequestSchema)) dto: UpdateOperationalCalendarRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.calendars.update(id, dto, this.ctx(user, req));
  }

  @Post(":id/default")
  @RequirePermission("opscalendar:manage")
  setDefault(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.calendars.setDefault(id, this.ctx(user, req));
  }

  @Post(":id/nodes")
  @RequirePermission("opscalendar:manage")
  assignNodes(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(assignCalendarNodesRequestSchema)) dto: AssignCalendarNodesRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.calendars.assignNodes(id, dto, this.ctx(user, req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("opscalendar:manage")
  async remove(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest): Promise<void> {
    await this.calendars.remove(id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
