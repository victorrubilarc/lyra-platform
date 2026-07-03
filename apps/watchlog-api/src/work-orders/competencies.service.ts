import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  competencyValidityState,
  DEFAULT_COMPETENCY_WARNING_LEAD_DAYS,
  type CompetencyTypeDto,
  type PersonCompetencyDto,
  type PersonRestrictionDto,
  type UpsertCompetencyTypeRequest,
  type UpsertPersonCompetencyRequest,
  type UpsertPersonRestrictionRequest,
  type UpsertWorkOrderCompetencyRuleRequest,
  type WorkOrderCompetencyRuleDto,
} from "@lyra/contracts";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";

/**
 * DOTACIÓN · Slice 2 — competencias/certificaciones con vigencia, restricciones y
 * reglas de requisito. Catálogos COMPARTIDOS (como Personas/Especialidades):
 *  - `CompetencyType` + `WorkOrderCompetencyRule` ⇒ `workordercatalog:manage` (es otro
 *    catálogo, como Tipos de OT). Traza ISO 45001 §7.2 (determinar competencia necesaria).
 *  - `PersonCompetency` + `PersonRestriction` ⇒ `worker:manage` (gestión de la persona).
 *    Renovar una competencia = REGISTRO NUEVO (no se sobreescribe): historial estilo
 *    Maximo LABORCERTHIST. El estado de vigencia (VALID/EXPIRING/EXPIRED) es DERIVADO.
 */
@Injectable()
export class CompetenciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // === CompetencyType (catálogo) =============================================

  async listCompetencyTypes(includeInactive = false): Promise<CompetencyTypeDto[]> {
    const rows = await this.prisma.competencyType.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => this.toTypeDto(r));
  }

  async upsertCompetencyType(dto: UpsertCompetencyTypeRequest, ctx: AuditContext, actorId: string | null): Promise<CompetencyTypeDto> {
    const data = {
      name: dto.name,
      description: dto.description?.trim() || null,
      category: dto.category,
      defaultValidityDays: dto.defaultValidityDays ?? null,
      requiresExpiry: dto.requiresExpiry ?? true,
      warningLeadDays: dto.warningLeadDays ?? null,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    let row;
    if (dto.id) {
      const existing = await this.prisma.competencyType.findFirst({ where: { id: dto.id, deletedAt: null }, select: { id: true } });
      if (!existing) throw new NotFoundException("Tipo de competencia no encontrado");
      row = await this.prisma.competencyType.update({ where: { id: dto.id }, data: { ...data, updatedById: actorId } });
    } else {
      const key = (dto.key?.trim() || this.slug(dto.name)) || "competencia";
      const dup = await this.prisma.competencyType.findFirst({ where: { key, deletedAt: null }, select: { id: true } });
      if (dup) throw new BadRequestException(`Ya existe un tipo de competencia con la clave «${key}»`);
      row = await this.prisma.competencyType.create({ data: { ...data, key, createdById: actorId, updatedById: actorId } });
    }
    await this.audit.record({ ...ctx, action: "competencytype.upserted", entityType: "CompetencyType", entityId: row.id, after: { name: row.name, category: row.category } });
    return this.toTypeDto(row);
  }

  async deleteCompetencyType(id: string, ctx: AuditContext): Promise<void> {
    const row = await this.prisma.competencyType.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!row) throw new NotFoundException("Tipo de competencia no encontrado");
    await this.prisma.competencyType.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await this.audit.record({ ...ctx, action: "competencytype.deleted", entityType: "CompetencyType", entityId: id });
  }

  // === PersonCompetency (la persona posee la competencia) ====================

  async listPersonCompetencies(personId: string, includeArchived = false): Promise<PersonCompetencyDto[]> {
    await this.assertPerson(personId);
    const rows = await this.prisma.personCompetency.findMany({
      where: { personId, ...(includeArchived ? {} : { deletedAt: null }) },
      include: { competencyType: { select: { name: true, category: true, warningLeadDays: true } } },
      orderBy: [{ deletedAt: "asc" }, { issuedAt: "desc" }],
    });
    const verifierIds = [...new Set(rows.map((r) => r.verifiedById).filter((x): x is string => !!x))];
    const verifiers = verifierIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: verifierIds } }, select: { id: true, displayName: true, email: true } })
      : [];
    const vName = new Map(verifiers.map((u) => [u.id, u.displayName ?? u.email]));
    const now = Date.now();
    return rows.map((r) => {
      const warn = r.competencyType.warningLeadDays ?? DEFAULT_COMPETENCY_WARNING_LEAD_DAYS;
      // Estado derivado: sin expiresAt ⇒ "no_expiry" (lo resuelve competencyValidityState).
      const validity = competencyValidityState(r.expiresAt ? r.expiresAt.getTime() : null, now, warn);
      return {
        id: r.id,
        personId: r.personId,
        competencyTypeId: r.competencyTypeId,
        competencyTypeName: r.competencyType.name,
        category: r.competencyType.category,
        issuedAt: r.issuedAt.toISOString(),
        expiresAt: r.expiresAt?.toISOString() ?? null,
        certificateNumber: r.certificateNumber,
        issuedBy: r.issuedBy,
        verifiedById: r.verifiedById,
        verifiedByName: r.verifiedById ? vName.get(r.verifiedById) ?? null : null,
        verifiedAt: r.verifiedAt?.toISOString() ?? null,
        note: r.note,
        validity,
        archivedAt: r.deletedAt?.toISOString() ?? null,
      };
    });
  }

  async upsertPersonCompetency(personId: string, dto: UpsertPersonCompetencyRequest, ctx: AuditContext, actorId: string | null): Promise<PersonCompetencyDto[]> {
    await this.assertPerson(personId);
    const type = await this.prisma.competencyType.findFirst({ where: { id: dto.competencyTypeId, deletedAt: null }, select: { id: true, requiresExpiry: true } });
    if (!type) throw new BadRequestException("El tipo de competencia indicado no existe");
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (type.requiresExpiry && !expiresAt) throw new BadRequestException("Este tipo de competencia exige fecha de vencimiento");
    const verified = dto.markVerified ? { verifiedById: actorId, verifiedAt: new Date() } : {};
    const data = {
      competencyTypeId: dto.competencyTypeId,
      issuedAt: new Date(dto.issuedAt),
      expiresAt,
      certificateNumber: dto.certificateNumber?.trim() || null,
      issuedBy: dto.issuedBy?.trim() || null,
      note: dto.note?.trim() || null,
      ...verified,
    };
    let row;
    let before: Prisma.InputJsonValue | null = null;
    if (dto.id) {
      const existing = await this.prisma.personCompetency.findFirst({ where: { id: dto.id, personId, deletedAt: null }, include: { competencyType: { select: { name: true } } } });
      if (!existing) throw new NotFoundException("Competencia no encontrada");
      before = this.snapshotCompetency(existing);
      row = await this.prisma.personCompetency.update({ where: { id: dto.id }, data });
    } else {
      // Renovar = registro NUEVO (historial LABORCERTHIST); no se sobreescribe el anterior.
      row = await this.prisma.personCompetency.create({ data: { ...data, personId, createdById: actorId } });
    }
    const rowFull = await this.prisma.personCompetency.findUnique({ where: { id: row.id }, include: { competencyType: { select: { name: true } } } });
    await this.audit.record({ ...ctx, action: dto.id ? "personcompetency.updated" : "personcompetency.added", entityType: "PersonCompetency", entityId: row.id, before, after: this.snapshotCompetency(rowFull!) });
    return this.listPersonCompetencies(personId);
  }

  async deletePersonCompetency(personId: string, id: string, ctx: AuditContext): Promise<PersonCompetencyDto[]> {
    const row = await this.prisma.personCompetency.findFirst({ where: { id, personId, deletedAt: null }, include: { competencyType: { select: { name: true } } } });
    if (!row) throw new NotFoundException("Competencia no encontrada");
    await this.prisma.personCompetency.update({ where: { id }, data: { deletedAt: new Date() } });
    // Auditoría inmutable con el ANTES (qué se archivó): el auditor ve exactamente qué se quitó.
    await this.audit.record({ ...ctx, action: "personcompetency.deleted", entityType: "PersonCompetency", entityId: id, before: this.snapshotCompetency(row), after: null });
    return this.listPersonCompetencies(personId);
  }

  /** Foto de una competencia para la auditoría (antes/después) — legible por el auditor. */
  private snapshotCompetency(r: { personId: string; competencyTypeId: string; competencyType: { name: string }; issuedAt: Date; expiresAt: Date | null; certificateNumber: string | null; issuedBy: string | null; verifiedById: string | null; verifiedAt: Date | null; note: string | null }): Prisma.InputJsonValue {
    return {
      personId: r.personId,
      competencyType: r.competencyType.name,
      competencyTypeId: r.competencyTypeId,
      issuedAt: r.issuedAt.toISOString(),
      expiresAt: r.expiresAt?.toISOString() ?? null,
      certificateNumber: r.certificateNumber,
      issuedBy: r.issuedBy,
      verifiedById: r.verifiedById,
      verifiedAt: r.verifiedAt?.toISOString() ?? null,
      note: r.note,
    };
  }

  // === PersonRestriction (veto — Eje B) ======================================

  async listPersonRestrictions(personId: string, includeArchived = false): Promise<PersonRestrictionDto[]> {
    await this.assertPerson(personId);
    const rows = await this.prisma.personRestriction.findMany({ where: { personId, ...(includeArchived ? {} : { deletedAt: null }) }, orderBy: [{ deletedAt: "asc" }, { startsAt: "desc" }] });
    const now = Date.now();
    return rows.map((r) => this.toRestrictionDto(r, now));
  }

  async upsertPersonRestriction(personId: string, dto: UpsertPersonRestrictionRequest, ctx: AuditContext, actorId: string | null): Promise<PersonRestrictionDto[]> {
    await this.assertPerson(personId);
    const data = {
      type: dto.type,
      reason: dto.reason.trim(),
      startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      active: dto.active ?? true,
    };
    let row;
    let before: Prisma.InputJsonValue | null = null;
    if (dto.id) {
      const existing = await this.prisma.personRestriction.findFirst({ where: { id: dto.id, personId, deletedAt: null } });
      if (!existing) throw new NotFoundException("Restricción no encontrada");
      before = this.snapshotRestriction(existing);
      row = await this.prisma.personRestriction.update({ where: { id: dto.id }, data });
    } else {
      row = await this.prisma.personRestriction.create({ data: { ...data, personId, createdById: actorId } });
    }
    await this.audit.record({ ...ctx, action: dto.id ? "personrestriction.updated" : "personrestriction.added", entityType: "PersonRestriction", entityId: row.id, before, after: this.snapshotRestriction(row) });
    return this.listPersonRestrictions(personId);
  }

  async deletePersonRestriction(personId: string, id: string, ctx: AuditContext): Promise<PersonRestrictionDto[]> {
    const row = await this.prisma.personRestriction.findFirst({ where: { id, personId, deletedAt: null } });
    if (!row) throw new NotFoundException("Restricción no encontrada");
    await this.prisma.personRestriction.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    // Auditoría inmutable con el ANTES: levantar un veto (no apto → apto) queda trazado con
    // el motivo y la vigencia que tenía la restricción. Traza CLAUDE.md (antes/después).
    await this.audit.record({ ...ctx, action: "personrestriction.deleted", entityType: "PersonRestriction", entityId: id, before: this.snapshotRestriction(row), after: null });
    return this.listPersonRestrictions(personId);
  }

  /** Foto de una restricción para la auditoría (antes/después). */
  private snapshotRestriction(r: { personId: string; type: string; reason: string; startsAt: Date; endsAt: Date | null; active: boolean }): Prisma.InputJsonValue {
    return {
      personId: r.personId,
      type: r.type,
      reason: r.reason,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt?.toISOString() ?? null,
      active: r.active,
    };
  }

  // === WorkOrderCompetencyRule (regla de requisito · catálogo) ===============

  async listCompetencyRules(includeInactive = false): Promise<WorkOrderCompetencyRuleDto[]> {
    const rows = await this.prisma.workOrderCompetencyRule.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return this.toRuleDtos(rows);
  }

  async upsertCompetencyRule(dto: UpsertWorkOrderCompetencyRuleRequest, ctx: AuditContext, actorId: string | null): Promise<WorkOrderCompetencyRuleDto> {
    const type = await this.prisma.competencyType.findFirst({ where: { id: dto.competencyTypeId, deletedAt: null }, select: { id: true } });
    if (!type) throw new BadRequestException("El tipo de competencia indicado no existe");
    if (dto.appliesToTypeIds && dto.appliesToTypeIds.length > 0) {
      const found = await this.prisma.workOrderType.count({ where: { id: { in: dto.appliesToTypeIds }, deletedAt: null } });
      if (found !== new Set(dto.appliesToTypeIds).size) throw new BadRequestException("Uno o más tipos de OT indicados no existen");
    }
    if (dto.specialtyId) {
      const spec = await this.prisma.specialty.findFirst({ where: { id: dto.specialtyId, deletedAt: null }, select: { id: true } });
      if (!spec) throw new BadRequestException("La especialidad indicada no existe");
    }
    if (dto.appliesToRosterRoleId) {
      const role = await this.prisma.rosterRole.findFirst({ where: { id: dto.appliesToRosterRoleId, deletedAt: null }, select: { id: true } });
      if (!role) throw new BadRequestException("El rol de dotación indicado no existe");
    }
    const data = {
      name: dto.name,
      competencyTypeId: dto.competencyTypeId,
      mandatory: dto.mandatory ?? true,
      appliesToTypeIds: dto.appliesToTypeIds ?? [],
      minCriticality: dto.minCriticality ?? null,
      specialtyId: dto.specialtyId ?? null,
      requiresPtw: dto.requiresPtw ?? null,
      appliesToRosterRoleId: dto.appliesToRosterRoleId ?? null,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const row = dto.id
      ? await this.prisma.workOrderCompetencyRule.update({ where: { id: dto.id }, data: { ...data, updatedById: actorId } })
      : await this.prisma.workOrderCompetencyRule.create({ data: { ...data, createdById: actorId, updatedById: actorId } });
    await this.audit.record({ ...ctx, action: "workordercompetencyrule.upserted", entityType: "WorkOrderCompetencyRule", entityId: row.id, after: { name: row.name, competencyTypeId: row.competencyTypeId, mandatory: row.mandatory } });
    return (await this.toRuleDtos([row]))[0]!;
  }

  async deleteCompetencyRule(id: string, ctx: AuditContext): Promise<void> {
    const row = await this.prisma.workOrderCompetencyRule.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!row) throw new NotFoundException("Regla de competencia no encontrada");
    await this.prisma.workOrderCompetencyRule.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await this.audit.record({ ...ctx, action: "workordercompetencyrule.deleted", entityType: "WorkOrderCompetencyRule", entityId: id });
  }

  // === Helpers ===============================================================

  private toTypeDto(r: {
    id: string; key: string; name: string; description: string | null; category: string;
    defaultValidityDays: number | null; requiresExpiry: boolean; warningLeadDays: number | null; active: boolean; sortOrder: number;
  }): CompetencyTypeDto {
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      category: r.category as CompetencyTypeDto["category"],
      defaultValidityDays: r.defaultValidityDays,
      requiresExpiry: r.requiresExpiry,
      warningLeadDays: r.warningLeadDays,
      active: r.active,
      sortOrder: r.sortOrder,
    };
  }

  private toRestrictionDto(r: { id: string; personId: string; type: string; reason: string; startsAt: Date; endsAt: Date | null; active: boolean; deletedAt?: Date | null }, nowMs: number): PersonRestrictionDto {
    const started = r.startsAt.getTime() <= nowMs;
    const notEnded = !r.endsAt || r.endsAt.getTime() > nowMs;
    const archived = r.deletedAt != null;
    return {
      id: r.id,
      personId: r.personId,
      type: r.type as PersonRestrictionDto["type"],
      reason: r.reason,
      startsAt: r.startsAt.toISOString(),
      endsAt: r.endsAt?.toISOString() ?? null,
      active: r.active,
      effective: !archived && r.active && started && notEnded,
      archivedAt: r.deletedAt?.toISOString() ?? null,
    };
  }

  private async toRuleDtos(rows: Prisma.WorkOrderCompetencyRuleGetPayload<object>[]): Promise<WorkOrderCompetencyRuleDto[]> {
    const typeIds = [...new Set(rows.map((r) => r.competencyTypeId))];
    const specialtyIds = [...new Set(rows.map((r) => r.specialtyId).filter((x): x is string => !!x))];
    const woTypeIds = [...new Set(rows.flatMap((r) => r.appliesToTypeIds))];
    const roleIds = [...new Set(rows.map((r) => r.appliesToRosterRoleId).filter((x): x is string => !!x))];
    const [types, specialties, woTypes, roles] = await Promise.all([
      typeIds.length ? this.prisma.competencyType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      specialtyIds.length ? this.prisma.specialty.findMany({ where: { id: { in: specialtyIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      woTypeIds.length ? this.prisma.workOrderType.findMany({ where: { id: { in: woTypeIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      roleIds.length ? this.prisma.rosterRole.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
    ]);
    const cName = new Map(types.map((t) => [t.id, t.name]));
    const sName = new Map(specialties.map((s) => [s.id, s.name]));
    const tyName = new Map(woTypes.map((t) => [t.id, t.name]));
    const rName = new Map(roles.map((r) => [r.id, r.name]));
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      competencyTypeId: r.competencyTypeId,
      competencyTypeName: cName.get(r.competencyTypeId) ?? null,
      mandatory: r.mandatory,
      appliesToTypeIds: r.appliesToTypeIds,
      appliesToTypeNames: r.appliesToTypeIds.map((id) => tyName.get(id)).filter((n): n is string => !!n),
      minCriticality: r.minCriticality,
      specialtyId: r.specialtyId,
      specialtyName: r.specialtyId ? sName.get(r.specialtyId) ?? null : null,
      requiresPtw: r.requiresPtw,
      appliesToRosterRoleId: r.appliesToRosterRoleId,
      appliesToRosterRoleName: r.appliesToRosterRoleId ? rName.get(r.appliesToRosterRoleId) ?? null : null,
      active: r.active,
      sortOrder: r.sortOrder,
    }));
  }

  private async assertPerson(personId: string): Promise<void> {
    const p = await this.prisma.person.findFirst({ where: { id: personId, deletedAt: null }, select: { id: true } });
    if (!p) throw new NotFoundException("Persona no encontrada");
  }

  private slug(name: string): string {
    return name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
}
