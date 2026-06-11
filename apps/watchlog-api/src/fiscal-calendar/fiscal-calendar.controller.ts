import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  assignFiscalNodesRequestSchema,
  createFiscalCalendarRequestSchema,
  updateFiscalCalendarRequestSchema,
  type AssignFiscalNodesRequest,
  type CreateFiscalCalendarRequest,
  type UpdateFiscalCalendarRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FiscalCalendarService } from "./fiscal-calendar.service";

/**
 * Mantenedor del calendario fiscal. Reusa los permisos del módulo de calendario
 * operacional (`module:opscalendar` cubre "turnos y periodos"): `opscalendar:view`
 * para leer y `opscalendar:manage` para administrar la config de período/asignaciones.
 */
@Controller("fiscal-calendars")
export class FiscalCalendarController {
  constructor(private readonly calendars: FiscalCalendarService) {}

  @Get()
  @RequirePermission("opscalendar:view")
  list() {
    return this.calendars.list();
  }

  @Get(":id")
  @RequirePermission("opscalendar:view")
  getDetail(@Param("id") id: string) {
    return this.calendars.getDetail(id);
  }

  @Post()
  @RequirePermission("opscalendar:manage")
  create(
    @Body(new ZodValidationPipe(createFiscalCalendarRequestSchema)) dto: CreateFiscalCalendarRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.calendars.create(dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("opscalendar:manage")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateFiscalCalendarRequestSchema)) dto: UpdateFiscalCalendarRequest,
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
    @Body(new ZodValidationPipe(assignFiscalNodesRequestSchema)) dto: AssignFiscalNodesRequest,
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
