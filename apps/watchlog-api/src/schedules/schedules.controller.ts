import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  createLogScheduleRequestSchema,
  updateLogScheduleRequestSchema,
  occurrenceQuerySchema,
  skipOccurrenceRequestSchema,
  type CreateLogScheduleRequest,
  type UpdateLogScheduleRequest,
  type OccurrenceQuery,
  type SkipOccurrenceRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SchedulesService } from "./schedules.service";

@Controller("schedules")
export class SchedulesController {
  constructor(private readonly schedules: SchedulesService) {}

  // --- Horarios --------------------------------------------------------------

  @Get()
  @RequirePermission("schedule:view")
  list(@CurrentUser() user: RequestUser) {
    return this.schedules.list(user.id);
  }

  // Ocurrencias (rondas pendientes/vencidas). Antes de `:id` para no chocar con él.
  @Get("occurrences")
  @RequirePermission("schedule:view")
  listOccurrences(
    @Query(new ZodValidationPipe(occurrenceQuerySchema)) q: OccurrenceQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.schedules.listOccurrences(user.id, q);
  }

  @Get("occurrences/stats")
  @RequirePermission("schedule:view")
  occurrenceStats(@CurrentUser() user: RequestUser) {
    return this.schedules.occurrenceStats(user.id);
  }

  @Get(":id")
  @RequirePermission("schedule:view")
  getDetail(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.schedules.getDetail(user.id, id);
  }

  @Post()
  @RequirePermission("schedule:manage")
  create(
    @Body(new ZodValidationPipe(createLogScheduleRequestSchema)) dto: CreateLogScheduleRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.schedules.create(user.id, dto, this.ctx(user, req));
  }

  @Patch(":id")
  @RequirePermission("schedule:manage")
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateLogScheduleRequestSchema)) dto: UpdateLogScheduleRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.schedules.update(user.id, id, dto, this.ctx(user, req));
  }

  @Delete(":id")
  @HttpCode(204)
  @RequirePermission("schedule:manage")
  async remove(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest): Promise<void> {
    await this.schedules.remove(user.id, id, this.ctx(user, req));
  }

  /** Generación manual idempotente (botón "Generar"). */
  @Post("generate")
  @RequirePermission("schedule:manage")
  generate(@Body() body: { scheduleId?: string }, @CurrentUser() user: RequestUser) {
    return this.schedules.generateAll(user.id, body?.scheduleId);
  }

  // --- Ocurrencias -----------------------------------------------------------

  @Post("occurrences/:id/start")
  @RequirePermission("schedule:manage")
  start(
    @Param("id") id: string,
    @Body() body: { equipmentId?: string | null },
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.schedules.startOccurrence(user.id, id, this.ctx(user, req), body?.equipmentId ?? null);
  }

  @Post("occurrences/:id/skip")
  @RequirePermission("schedule:manage")
  skip(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(skipOccurrenceRequestSchema)) dto: SkipOccurrenceRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.schedules.skipOccurrence(user.id, id, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
