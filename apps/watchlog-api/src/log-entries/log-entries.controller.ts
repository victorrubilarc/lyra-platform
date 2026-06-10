import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  createLogEntryRequestSchema,
  logEntryListQuerySchema,
  saveLogEntrySectionRequestSchema,
  submitLogEntryRequestSchema,
  type CreateLogEntryRequest,
  type LogEntryListQuery,
  type SaveLogEntrySectionRequest,
  type SubmitLogEntryRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { LogEntriesService } from "./log-entries.service";

/**
 * Llenado de bitácoras (Fase 2.4). Los guards aplican el RBAC dim. 1–2; la
 * editabilidad por SECCIÓN (rol de sección × estado × ABAC) la decide el service.
 */
@Controller("log-entries")
export class LogEntriesController {
  constructor(private readonly entries: LogEntriesService) {}

  @Get()
  @RequirePermission("logentry:view")
  list(@Query(new ZodValidationPipe(logEntryListQuerySchema)) query: LogEntryListQuery, @CurrentUser() user: RequestUser) {
    return this.entries.list(user.id, query);
  }

  @Get(":id")
  @RequirePermission("logentry:view")
  getDetail(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.entries.getDetail(user.id, id);
  }

  @Post()
  @RequirePermission("logentry:create")
  create(
    @Body(new ZodValidationPipe(createLogEntryRequestSchema)) dto: CreateLogEntryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.create(user.id, dto, this.ctx(user, req));
  }

  @Put(":id/sections/:sectionKey")
  @RequirePermission("logentry:fill")
  saveSection(
    @Param("id") id: string,
    @Param("sectionKey") sectionKey: string,
    @Body(new ZodValidationPipe(saveLogEntrySectionRequestSchema)) dto: SaveLogEntrySectionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.saveSection(user.id, id, sectionKey, dto, this.ctx(user, req));
  }

  @Post(":id/submit")
  @RequirePermission("logentry:fill")
  submit(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitLogEntryRequestSchema)) dto: SubmitLogEntryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.submit(user.id, id, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
