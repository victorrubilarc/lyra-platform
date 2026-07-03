import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  upsertCompetencyTypeRequestSchema,
  upsertPersonCompetencyRequestSchema,
  upsertPersonRestrictionRequestSchema,
  upsertWorkOrderCompetencyRuleRequestSchema,
  type UpsertCompetencyTypeRequest,
  type UpsertPersonCompetencyRequest,
  type UpsertPersonRestrictionRequest,
  type UpsertWorkOrderCompetencyRuleRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { CompetenciesService } from "./competencies.service";

/**
 * DOTACIÓN · Slice 2 — competencias/certificaciones con vigencia, restricciones y reglas.
 * `CompetencyType` + `WorkOrderCompetencyRule` = catálogos (gate `workordercatalog:manage`
 * para mutar, `workorder:view` para leer/poblar pickers). `PersonCompetency` +
 * `PersonRestriction` = gestión de la persona (gate `worker:manage`). Sin permiso nuevo.
 */
@Controller()
export class CompetenciesController {
  constructor(private readonly competencies: CompetenciesService) {}

  // --- Catálogo de tipos de competencia --------------------------------------

  @Get("competency-types")
  @RequirePermission("workorder:view")
  listTypes(@Query("includeInactive") includeInactive?: string) {
    return this.competencies.listCompetencyTypes(includeInactive === "true");
  }

  @Post("competency-types")
  @RequirePermission("workordercatalog:manage")
  upsertType(@Body(new ZodValidationPipe(upsertCompetencyTypeRequestSchema)) dto: UpsertCompetencyTypeRequest, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.competencies.upsertCompetencyType(dto, this.ctx(user, req), user.id);
  }

  @Delete("competency-types/:id")
  @RequirePermission("workordercatalog:manage")
  deleteType(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.competencies.deleteCompetencyType(id, this.ctx(user, req));
  }

  // --- Reglas de requisito de competencia (catálogo) -------------------------

  @Get("work-order-competency-rules")
  @RequirePermission("workorder:view")
  listRules(@Query("includeInactive") includeInactive?: string) {
    return this.competencies.listCompetencyRules(includeInactive === "true");
  }

  @Post("work-order-competency-rules")
  @RequirePermission("workordercatalog:manage")
  upsertRule(@Body(new ZodValidationPipe(upsertWorkOrderCompetencyRuleRequestSchema)) dto: UpsertWorkOrderCompetencyRuleRequest, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.competencies.upsertCompetencyRule(dto, this.ctx(user, req), user.id);
  }

  @Delete("work-order-competency-rules/:ruleId")
  @RequirePermission("workordercatalog:manage")
  deleteRule(@Param("ruleId") ruleId: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.competencies.deleteCompetencyRule(ruleId, this.ctx(user, req));
  }

  // --- Competencias de una persona -------------------------------------------

  @Get("persons/:personId/competencies")
  @RequirePermission("worker:manage")
  listPersonCompetencies(@Param("personId") personId: string, @Query("includeArchived") includeArchived?: string) {
    return this.competencies.listPersonCompetencies(personId, includeArchived === "true");
  }

  @Post("persons/:personId/competencies")
  @RequirePermission("worker:manage")
  upsertPersonCompetency(@Param("personId") personId: string, @Body(new ZodValidationPipe(upsertPersonCompetencyRequestSchema)) dto: UpsertPersonCompetencyRequest, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.competencies.upsertPersonCompetency(personId, dto, this.ctx(user, req), user.id);
  }

  @Delete("persons/:personId/competencies/:id")
  @RequirePermission("worker:manage")
  deletePersonCompetency(@Param("personId") personId: string, @Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.competencies.deletePersonCompetency(personId, id, this.ctx(user, req));
  }

  // --- Restricciones de una persona (veto — Eje B) ---------------------------

  @Get("persons/:personId/restrictions")
  @RequirePermission("worker:manage")
  listPersonRestrictions(@Param("personId") personId: string, @Query("includeArchived") includeArchived?: string) {
    return this.competencies.listPersonRestrictions(personId, includeArchived === "true");
  }

  @Post("persons/:personId/restrictions")
  @RequirePermission("worker:manage")
  upsertPersonRestriction(@Param("personId") personId: string, @Body(new ZodValidationPipe(upsertPersonRestrictionRequestSchema)) dto: UpsertPersonRestrictionRequest, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.competencies.upsertPersonRestriction(personId, dto, this.ctx(user, req), user.id);
  }

  @Delete("persons/:personId/restrictions/:id")
  @RequirePermission("worker:manage")
  deletePersonRestriction(@Param("personId") personId: string, @Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.competencies.deletePersonRestriction(personId, id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
