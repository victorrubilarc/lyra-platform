import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  normalizeRut,
  personFullName,
  type ContractorCompanyDto,
  type PersonDto,
  type RosterRoleDto,
  type UpsertContractorCompanyRequest,
  type UpsertPersonRequest,
  type UpsertRosterRoleRequest,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";

/**
 * Catálogo de DOTACIÓN (S1): Personas (propias y de contratistas) y Empresas
 * contratistas. Una `Person` es DISTINTA de un `User` (traza IBM Maximo: Person ≠ User;
 * los contratistas no tienen login). Catálogo COMPARTIDO (como Especialidades/Tipos):
 * gobernado por `worker:manage`; el ABAC se aplica en el ROSTER de la OT, no aquí.
 * Los roles de la dotación (`RosterRole`) se listan aquí para poblar los pickers.
 */
@Injectable()
export class PersonsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // === Personas ===============================================================

  async listPersons(opts: { search?: string; kind?: string; includeInactive?: boolean } = {}): Promise<PersonDto[]> {
    const search = opts.search?.trim();
    const rows = await this.prisma.person.findMany({
      where: {
        deletedAt: null,
        ...(opts.includeInactive ? {} : { active: true }),
        ...(opts.kind === "INTERNAL" || opts.kind === "CONTRACTOR" ? { kind: opts.kind } : {}),
        ...(search
          ? {
              OR: [
                { fullName: { contains: search, mode: "insensitive" as const } },
                { nationalId: { contains: search, mode: "insensitive" as const } },
                { personnelCode: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      include: { contractorCompany: { select: { name: true } } },
      orderBy: [{ fullName: "asc" }],
      take: 500,
    });
    // Impedimentos por persona (luces de información en la grilla): restricciones activas y
    // vigentes (Eje B) + competencias ya vencidas (Eje A). Derivados EN VIVO, no almacenados.
    const ids = rows.map((r) => r.id);
    const now = new Date();
    const [restrRows, expiredRows] = ids.length
      ? await Promise.all([
          this.prisma.personRestriction.findMany({
            where: { personId: { in: ids }, deletedAt: null, active: true, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
            select: { personId: true },
          }),
          this.prisma.personCompetency.findMany({
            where: { personId: { in: ids }, deletedAt: null, expiresAt: { not: null, lte: now } },
            select: { personId: true },
          }),
        ])
      : [[], []];
    const restrBy = new Map<string, number>();
    for (const r of restrRows) restrBy.set(r.personId, (restrBy.get(r.personId) ?? 0) + 1);
    const expiredBy = new Map<string, number>();
    for (const r of expiredRows) expiredBy.set(r.personId, (expiredBy.get(r.personId) ?? 0) + 1);
    return rows.map((r) => this.toPersonDto(r, restrBy.get(r.id) ?? 0, expiredBy.get(r.id) ?? 0));
  }

  async upsertPerson(dto: UpsertPersonRequest, ctx: AuditContext, actorId: string | null): Promise<PersonDto> {
    const contractorCompanyId = dto.kind === "CONTRACTOR" ? dto.contractorCompanyId ?? null : null;
    if (contractorCompanyId) {
      const company = await this.prisma.contractorCompany.findFirst({ where: { id: contractorCompanyId, deletedAt: null }, select: { id: true } });
      if (!company) throw new BadRequestException("La empresa contratista indicada no existe");
    }
    const fullName = personFullName(dto.firstName, dto.lastName);
    const email = dto.email && dto.email.trim() !== "" ? dto.email.trim() : null;
    // El RUT se guarda NORMALIZADO (cuerpo-DV, sin puntos); la UI lo formatea al mostrar.
    // Documentos extranjeros = texto tal cual. (El schema Zod ya validó el DV del RUT.)
    const rawId = dto.nationalId?.trim() || null;
    const nationalId = rawId && dto.nationalIdType === "RUT" ? normalizeRut(rawId) ?? rawId : rawId;
    const data = {
      kind: dto.kind,
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      fullName,
      nationalIdType: dto.nationalIdType ?? (rawId ? "RUT" : null),
      nationalId,
      personnelCode: dto.personnelCode?.trim() || null,
      badgeId: dto.badgeId?.trim() || null,
      jobTitle: dto.jobTitle?.trim() || null,
      birthDate: dto.birthDate ? new Date(dto.birthDate) : null,
      gender: dto.gender ?? null,
      nationality: dto.nationality?.trim() || null,
      email,
      phone: dto.phone?.trim() || null,
      contractorCompanyId,
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };
    let id: string;
    if (dto.id) {
      const existing = await this.prisma.person.findFirst({ where: { id: dto.id, deletedAt: null }, select: { id: true } });
      if (!existing) throw new NotFoundException("Persona no encontrada");
      await this.prisma.person.update({ where: { id: dto.id }, data: { ...data, updatedById: actorId } });
      id = dto.id;
    } else {
      const created = await this.prisma.person.create({ data: { ...data, active: dto.active ?? true, createdById: actorId, updatedById: actorId } });
      id = created.id;
    }
    await this.audit.record({ ...ctx, action: dto.id ? "person.updated" : "person.created", entityType: "Person", entityId: id, after: { fullName, kind: dto.kind } });
    return (await this.listPersonById(id))!;
  }

  async deletePerson(id: string, ctx: AuditContext): Promise<void> {
    const person = await this.prisma.person.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!person) throw new NotFoundException("Persona no encontrada");
    const inUse = await this.prisma.workOrderWorker.count({ where: { personId: id, removedAt: null } });
    if (inUse > 0) throw new BadRequestException("La persona está en la dotación de una o más OT activas: quítela primero o desactívela");
    await this.prisma.person.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await this.audit.record({ ...ctx, action: "person.deleted", entityType: "Person", entityId: id });
  }

  private async listPersonById(id: string): Promise<PersonDto | null> {
    const row = await this.prisma.person.findUnique({ where: { id }, include: { contractorCompany: { select: { name: true } } } });
    return row ? this.toPersonDto(row) : null;
  }

  private toPersonDto(r: { id: string; kind: string; firstName: string; lastName: string; fullName: string; nationalIdType: string | null; nationalId: string | null; personnelCode: string | null; badgeId: string | null; jobTitle: string | null; birthDate: Date | null; gender: string | null; nationality: string | null; email: string | null; phone: string | null; contractorCompanyId: string | null; userId: string | null; active: boolean; contractorCompany: { name: string } | null }, activeRestrictions = 0, expiredCompetencies = 0): PersonDto {
    return {
      id: r.id,
      kind: r.kind as PersonDto["kind"],
      firstName: r.firstName,
      lastName: r.lastName,
      fullName: r.fullName,
      nationalIdType: (r.nationalIdType as PersonDto["nationalIdType"]) ?? null,
      nationalId: r.nationalId,
      personnelCode: r.personnelCode,
      badgeId: r.badgeId,
      jobTitle: r.jobTitle,
      birthDate: r.birthDate?.toISOString() ?? null,
      gender: (r.gender as PersonDto["gender"]) ?? null,
      nationality: r.nationality,
      email: r.email,
      phone: r.phone,
      contractorCompanyId: r.contractorCompanyId,
      contractorCompanyName: r.contractorCompany?.name ?? null,
      userId: r.userId,
      active: r.active,
      activeRestrictions,
      expiredCompetencies,
    };
  }

  // === Empresas contratistas ==================================================

  async listContractorCompanies(includeInactive = false): Promise<ContractorCompanyDto[]> {
    const rows = await this.prisma.contractorCompany.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      include: { _count: { select: { persons: { where: { deletedAt: null } } } } },
      orderBy: [{ name: "asc" }],
    });
    return rows.map((r) => this.toCompanyDto(r));
  }

  async upsertContractorCompany(dto: UpsertContractorCompanyRequest, ctx: AuditContext, actorId: string | null, create: boolean): Promise<ContractorCompanyDto> {
    const rawTax = dto.taxId?.trim() || null;
    const data = {
      name: dto.name.trim(),
      taxId: rawTax ? normalizeRut(rawTax) ?? rawTax : null, // RUT normalizado (la UI lo formatea)
      ...(dto.accreditationStatus ? { accreditationStatus: dto.accreditationStatus } : {}),
      accreditationGrade: dto.accreditationGrade?.trim() || null,
      accreditedUntil: dto.accreditedUntil ? new Date(dto.accreditedUntil) : null,
      externalProvider: dto.externalProvider?.trim() || null,
      accreditationNote: dto.accreditationNote?.trim() || null,
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    };
    let id: string;
    if (dto.id && !create) {
      const existing = await this.prisma.contractorCompany.findFirst({ where: { id: dto.id, deletedAt: null }, select: { id: true } });
      if (!existing) throw new NotFoundException("Empresa contratista no encontrada");
      await this.prisma.contractorCompany.update({ where: { id: dto.id }, data: { ...data, updatedById: actorId } });
      id = dto.id;
    } else {
      const key = (dto.key?.trim() || this.slugify(dto.name)).slice(0, 60);
      const dup = await this.prisma.contractorCompany.findFirst({ where: { key, deletedAt: null }, select: { id: true } });
      if (dup) throw new BadRequestException("Ya existe una empresa contratista con esa clave/nombre");
      const created = await this.prisma.contractorCompany.create({ data: { ...data, key, active: dto.active ?? true, createdById: actorId, updatedById: actorId } });
      id = created.id;
    }
    await this.audit.record({ ...ctx, action: dto.id && !create ? "contractorcompany.updated" : "contractorcompany.created", entityType: "ContractorCompany", entityId: id, after: { name: dto.name } });
    return (await this.companyById(id))!;
  }

  async deleteContractorCompany(id: string, ctx: AuditContext): Promise<void> {
    const company = await this.prisma.contractorCompany.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!company) throw new NotFoundException("Empresa contratista no encontrada");
    const persons = await this.prisma.person.count({ where: { contractorCompanyId: id, deletedAt: null } });
    if (persons > 0) throw new BadRequestException("La empresa tiene personas asociadas: reasígnelas o desactive la empresa");
    await this.prisma.contractorCompany.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await this.audit.record({ ...ctx, action: "contractorcompany.deleted", entityType: "ContractorCompany", entityId: id });
  }

  private async companyById(id: string): Promise<ContractorCompanyDto | null> {
    const row = await this.prisma.contractorCompany.findUnique({ where: { id }, include: { _count: { select: { persons: { where: { deletedAt: null } } } } } });
    return row ? this.toCompanyDto(row) : null;
  }

  private toCompanyDto(r: { id: string; key: string; name: string; taxId: string | null; accreditationStatus: string; accreditationGrade: string | null; accreditedUntil: Date | null; externalProvider: string | null; accreditationNote: string | null; active: boolean; _count: { persons: number } }): ContractorCompanyDto {
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      taxId: r.taxId,
      accreditationStatus: r.accreditationStatus as ContractorCompanyDto["accreditationStatus"],
      accreditationGrade: r.accreditationGrade,
      accreditedUntil: r.accreditedUntil?.toISOString() ?? null,
      externalProvider: r.externalProvider,
      accreditationNote: r.accreditationNote,
      active: r.active,
      personCount: r._count.persons,
    };
  }

  private slugify(s: string): string {
    return s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // === Roles de la dotación (catálogo configurable) ===========================

  async listRosterRoles(includeInactive = false): Promise<RosterRoleDto[]> {
    const rows = await this.prisma.rosterRole.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => this.toRosterRoleDto(r));
  }

  async upsertRosterRole(dto: UpsertRosterRoleRequest, ctx: AuditContext, actorId: string | null, create: boolean): Promise<RosterRoleDto> {
    const data = {
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      ...(dto.isSupervisorRole !== undefined ? { isSupervisorRole: dto.isSupervisorRole } : {}),
      ...(dto.mustRemainOutside !== undefined ? { mustRemainOutside: dto.mustRemainOutside } : {}),
      color: dto.color?.trim() || null,
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    };
    let id: string;
    if (dto.id && !create) {
      const existing = await this.prisma.rosterRole.findFirst({ where: { id: dto.id, deletedAt: null }, select: { id: true } });
      if (!existing) throw new NotFoundException("Rol de dotación no encontrado");
      await this.prisma.rosterRole.update({ where: { id: dto.id }, data });
      id = dto.id;
    } else {
      const key = (dto.key?.trim() || this.slugify(dto.name)).slice(0, 60);
      const dup = await this.prisma.rosterRole.findFirst({ where: { key, deletedAt: null }, select: { id: true } });
      if (dup) throw new BadRequestException("Ya existe un rol de dotación con esa clave/nombre");
      const created = await this.prisma.rosterRole.create({ data: { ...data, key, active: dto.active ?? true } });
      id = created.id;
    }
    await this.audit.record({ ...ctx, action: dto.id && !create ? "rosterrole.updated" : "rosterrole.created", entityType: "RosterRole", entityId: id, after: { name: dto.name } });
    const row = await this.prisma.rosterRole.findUnique({ where: { id } });
    return this.toRosterRoleDto(row!);
  }

  async deleteRosterRole(id: string, ctx: AuditContext): Promise<void> {
    const role = await this.prisma.rosterRole.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
    if (!role) throw new NotFoundException("Rol de dotación no encontrado");
    const inUse = await this.prisma.workOrderWorker.count({ where: { rosterRoleId: id, removedAt: null } });
    if (inUse > 0) throw new BadRequestException("El rol está en uso en la dotación de una o más OT activas: reasígnalo o desactívalo en vez de eliminarlo");
    await this.prisma.rosterRole.update({ where: { id }, data: { deletedAt: new Date(), active: false } });
    await this.audit.record({ ...ctx, action: "rosterrole.deleted", entityType: "RosterRole", entityId: id });
  }

  private toRosterRoleDto(r: { id: string; key: string; name: string; description: string | null; isSupervisorRole: boolean; mustRemainOutside: boolean; color: string | null; active: boolean; sortOrder: number }): RosterRoleDto {
    return {
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSupervisorRole: r.isSupervisorRole,
      mustRemainOutside: r.mustRemainOutside,
      color: r.color,
      active: r.active,
      sortOrder: r.sortOrder,
    };
  }
}
