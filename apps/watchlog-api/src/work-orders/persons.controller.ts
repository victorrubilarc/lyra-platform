import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  upsertContractorCompanyRequestSchema,
  upsertPersonRequestSchema,
  upsertRosterRoleRequestSchema,
  type UpsertContractorCompanyRequest,
  type UpsertPersonRequest,
  type UpsertRosterRoleRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PersonsService } from "./persons.service";
import { RequireModule } from "../licensing/module-entitlement.guard";

/**
 * Catálogo de DOTACIÓN: Personas, Empresas contratistas y Roles de dotación (S1).
 * Gobernado por `worker:manage` (mutaciones); las lecturas también, salvo la de roles
 * que la usan los pickers de la OT (gate `workorder:view`). Una Persona ≠ User.
 */
@RequireModule("work-orders")
@Controller()
export class PersonsController {
  constructor(private readonly persons: PersonsService) {}

  // --- Personas --------------------------------------------------------------

  @Get("persons")
  @RequirePermission("worker:manage")
  listPersons(@Query("search") search?: string, @Query("kind") kind?: string, @Query("includeInactive") includeInactive?: string) {
    return this.persons.listPersons({ search, kind, includeInactive: includeInactive === "true" });
  }

  @Post("persons")
  @RequirePermission("worker:manage")
  upsertPerson(
    @Body(new ZodValidationPipe(upsertPersonRequestSchema)) dto: UpsertPersonRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.persons.upsertPerson(dto, this.ctx(user, req), user.id);
  }

  @Delete("persons/:id")
  @RequirePermission("worker:manage")
  deletePerson(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.persons.deletePerson(id, this.ctx(user, req));
  }

  // --- Empresas contratistas -------------------------------------------------

  @Get("contractor-companies")
  @RequirePermission("worker:manage")
  listCompanies(@Query("includeInactive") includeInactive?: string) {
    return this.persons.listContractorCompanies(includeInactive === "true");
  }

  @Post("contractor-companies")
  @RequirePermission("worker:manage")
  upsertCompany(
    @Body(new ZodValidationPipe(upsertContractorCompanyRequestSchema)) dto: UpsertContractorCompanyRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Query("create") create?: string,
  ) {
    return this.persons.upsertContractorCompany(dto, this.ctx(user, req), user.id, create === "true");
  }

  @Delete("contractor-companies/:id")
  @RequirePermission("worker:manage")
  deleteCompany(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.persons.deleteContractorCompany(id, this.ctx(user, req));
  }

  // --- Roles de dotación (los usan los pickers de la OT) ---------------------

  @Get("roster-roles")
  @RequirePermission("workorder:view")
  listRosterRoles(@Query("includeInactive") includeInactive?: string) {
    return this.persons.listRosterRoles(includeInactive === "true");
  }

  // Administración de roles (catálogo configurable) — gate `workordercatalog:manage`
  // (como Tipos/Especialidades/Competencias). Traza OSHA: los 3 roles son editables.
  @Post("roster-roles")
  @RequirePermission("workordercatalog:manage")
  upsertRosterRole(
    @Body(new ZodValidationPipe(upsertRosterRoleRequestSchema)) dto: UpsertRosterRoleRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Query("create") create?: string,
  ) {
    return this.persons.upsertRosterRole(dto, this.ctx(user, req), user.id, create === "true");
  }

  @Delete("roster-roles/:id")
  @RequirePermission("workordercatalog:manage")
  deleteRosterRole(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.persons.deleteRosterRole(id, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
