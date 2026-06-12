import { Body, Controller, Get, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  closePeriodRequestSchema,
  generatePeriodsRequestSchema,
  lockPeriodRequestSchema,
  reopenPeriodRequestSchema,
  unlockPeriodRequestSchema,
  type ClosePeriodRequest,
  type GeneratePeriodsRequest,
  type LockPeriodRequest,
  type ReopenPeriodRequest,
  type UnlockPeriodRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OperationalPeriodService } from "./operational-periods.service";

/**
 * Mantenedor de períodos contables gobernados (Fase 2.7.1.1). Los períodos pertenecen a
 * un calendario FISCAL y se MATERIALIZAN con "Generar". El `periodKey` puede contener "/"
 * en teoría, así que viaja por query, no por path.
 */
@Controller("operational-periods")
export class OperationalPeriodController {
  constructor(private readonly periods: OperationalPeriodService) {}

  @Get()
  @RequirePermission("opsperiod:view")
  list(@Query("fiscalCalendarId") fiscalCalendarId: string) {
    return this.periods.list(fiscalCalendarId);
  }

  /** Generar (materializar) los períodos de un año. Acción de configuración del calendario. */
  @Post("generate")
  @RequirePermission("opscalendar:manage")
  generate(
    @Query("fiscalCalendarId") fiscalCalendarId: string,
    @Body(new ZodValidationPipe(generatePeriodsRequestSchema)) dto: GeneratePeriodsRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.periods.generate(fiscalCalendarId, dto.year, this.ctx(user, req));
  }

  @Post("close")
  @RequirePermission("opsperiod:close")
  close(
    @Query("fiscalCalendarId") fiscalCalendarId: string,
    @Query("periodKey") periodKey: string,
    @Body(new ZodValidationPipe(closePeriodRequestSchema)) dto: ClosePeriodRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.periods.close(fiscalCalendarId, periodKey, dto.reason, { password: dto.password, mfaCode: dto.mfaCode }, user.id, this.ctx(user, req));
  }

  @Post("reopen")
  @RequirePermission("opsperiod:reopen")
  reopen(
    @Query("fiscalCalendarId") fiscalCalendarId: string,
    @Query("periodKey") periodKey: string,
    @Body(new ZodValidationPipe(reopenPeriodRequestSchema)) dto: ReopenPeriodRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.periods.reopen(
      fiscalCalendarId,
      periodKey,
      dto.reason,
      dto.acknowledgeLaterClosed ?? false,
      { password: dto.password, mfaCode: dto.mfaCode },
      user.id,
      this.ctx(user, req),
    );
  }

  @Post("lock")
  @RequirePermission("opsperiod:lock")
  lock(
    @Query("fiscalCalendarId") fiscalCalendarId: string,
    @Query("periodKey") periodKey: string,
    @Body(new ZodValidationPipe(lockPeriodRequestSchema)) dto: LockPeriodRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.periods.lock(fiscalCalendarId, periodKey, dto.reason, { password: dto.password, mfaCode: dto.mfaCode }, user.id, this.ctx(user, req));
  }

  @Post("unlock")
  @RequirePermission("opsperiod:unlock")
  unlock(
    @Query("fiscalCalendarId") fiscalCalendarId: string,
    @Query("periodKey") periodKey: string,
    @Body(new ZodValidationPipe(unlockPeriodRequestSchema)) dto: UnlockPeriodRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.periods.unlock(fiscalCalendarId, periodKey, dto.reason, { password: dto.password, mfaCode: dto.mfaCode }, user.id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
