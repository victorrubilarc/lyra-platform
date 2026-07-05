import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  acknowledgeExceptionRequestSchema,
  associateExceptionRequestSchema,
  convertExceptionRequestSchema,
  correctExceptionRequestSchema,
  createManualExceptionRequestSchema,
  dismissExceptionRequestSchema,
  exceptionListQuerySchema,
  type AcknowledgeExceptionRequest,
  type AssociateExceptionRequest,
  type ConvertExceptionRequest,
  type CorrectExceptionRequest,
  type CreateManualExceptionRequest,
  type DismissExceptionRequest,
  type ExceptionListQuery,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequireAnyPermission, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ExceptionsService } from "./exceptions.service";
import { RequireModule } from "../licensing/module-entitlement.guard";

@RequireModule("exceptions")
@Controller("exceptions")
export class ExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  // --- Lectura (parte del módulo de incidencias) -----------------------------

  @Get()
  @RequirePermission("module:incidents:view")
  list(
    @Query(new ZodValidationPipe(exceptionListQuerySchema)) q: ExceptionListQuery,
    @CurrentUser() user: RequestUser,
    @Query("structureId") structureId?: string,
  ) {
    return this.exceptions.list(user.id, q, structureId);
  }

  /** Resumen para el panel de revisión de una entrada de bitácora. */
  @Get("summary")
  @RequirePermission("module:incidents:view")
  summaryForEntry(@Query("logEntryId") logEntryId: string, @CurrentUser() user: RequestUser) {
    return this.exceptions.summaryForEntry(user.id, logEntryId);
  }

  @Get(":id")
  @RequirePermission("module:incidents:view")
  getDetail(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.exceptions.getDetail(user.id, id);
  }

  @Get(":id/dedupe-suggestions")
  @RequirePermission("module:incidents:view")
  dedupeSuggestions(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.exceptions.dedupeSuggestions(user.id, id);
  }

  // --- Triage ----------------------------------------------------------------

  @Post(":id/acknowledge")
  @HttpCode(200)
  @RequirePermission("exception:triage")
  acknowledge(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(acknowledgeExceptionRequestSchema)) dto: AcknowledgeExceptionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.exceptions.acknowledge(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/dismiss")
  @HttpCode(200)
  // El endpoint admite cualquiera de los dos; el servicio exige dismiss-critical si la excepción es CRÍTICA.
  @RequireAnyPermission("exception:dismiss", "exception:dismiss-critical")
  dismiss(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(dismissExceptionRequestSchema)) dto: DismissExceptionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.exceptions.dismiss(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/correct")
  @HttpCode(200)
  @RequirePermission("exception:correct")
  correct(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(correctExceptionRequestSchema)) dto: CorrectExceptionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.exceptions.correct(user.id, id, dto, this.ctx(user, req));
  }

  @Post("convert")
  @HttpCode(200)
  // Convertir crea una incidencia: exige triage + creación de incidencias (AND).
  @RequirePermission("exception:triage", "incident:create")
  convert(
    @Body(new ZodValidationPipe(convertExceptionRequestSchema)) dto: ConvertExceptionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.exceptions.convert(user.id, dto, this.ctx(user, req));
  }

  @Post("associate")
  @HttpCode(200)
  @RequirePermission("exception:triage")
  associate(
    @Body(new ZodValidationPipe(associateExceptionRequestSchema)) dto: AssociateExceptionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.exceptions.associate(user.id, dto, this.ctx(user, req));
  }

  @Post("manual")
  // Registro manual del operador durante el llenado, o de quien tría.
  @RequireAnyPermission("exception:triage", "logentry:fill")
  createManual(
    @Body(new ZodValidationPipe(createManualExceptionRequestSchema)) dto: CreateManualExceptionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.exceptions.createManual(user.id, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
