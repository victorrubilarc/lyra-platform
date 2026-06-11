import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  closePeriodRequestSchema,
  reopenPeriodRequestSchema,
  type ClosePeriodRequest,
  type ReopenPeriodRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OperationalPeriodService } from "./operational-periods.service";

/**
 * Mantenedor de períodos contables gobernados (Fase 2.7.1). Vive bajo el calendario
 * (los períodos derivan de su configuración). El `periodKey` puede contener "/" en
 * teoría, así que viaja por query, no por path.
 */
@Controller("operational-periods")
export class OperationalPeriodController {
  constructor(private readonly periods: OperationalPeriodService) {}

  @Get()
  @RequirePermission("opsperiod:view")
  list(@Query("calendarId") calendarId: string) {
    return this.periods.list(calendarId);
  }

  @Post("close")
  @RequirePermission("opsperiod:close")
  close(
    @Query("calendarId") calendarId: string,
    @Query("periodKey") periodKey: string,
    @Body(new ZodValidationPipe(closePeriodRequestSchema)) dto: ClosePeriodRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.periods.close(calendarId, periodKey, dto, user.id, this.ctx(user, req));
  }

  @Post("reopen")
  @RequirePermission("opsperiod:reopen")
  reopen(
    @Query("calendarId") calendarId: string,
    @Query("periodKey") periodKey: string,
    @Body(new ZodValidationPipe(reopenPeriodRequestSchema)) dto: ReopenPeriodRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.periods.reopen(calendarId, periodKey, dto, user.id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
