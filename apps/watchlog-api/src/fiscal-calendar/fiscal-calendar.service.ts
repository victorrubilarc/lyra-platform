import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  validateFiscalCalendar,
  type AssignFiscalNodesRequest,
  type CreateFiscalCalendarRequest,
  type UpdateFiscalCalendarRequest,
} from "@lyra/contracts";
import { Prisma, type FiscalCalendar } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

type FiscalDetail = FiscalCalendar & { assignedNodeIds: string[] };

/**
 * Calendario FISCAL (FiscalCalendar) — Fase 2.7.1.1. Catálogo GOBERNADO (molde
 * OperationalCalendar): editable en vivo + auditado, default único, asignación por nodo.
 * Entidad TRANSVERSAL desacoplada de los turnos; define el período contable (MONTH/WEEK/
 * CUSTOM + ancla) que el `FiscalResolver` aplica para estampar `LogEntry.periodKey`.
 */
@Injectable()
export class FiscalCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<FiscalCalendar[]> {
    return this.prisma.fiscalCalendar.findMany({
      where: { deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    });
  }

  async getDetail(id: string): Promise<FiscalDetail> {
    const cal = await this.prisma.fiscalCalendar.findFirst({ where: { id, deletedAt: null } });
    if (!cal) throw new NotFoundException("Calendario fiscal no encontrado");
    const nodes = await this.prisma.orgNode.findMany({
      where: { fiscalCalendarId: id, deletedAt: null },
      select: { id: true },
    });
    return { ...cal, assignedNodeIds: nodes.map((n) => n.id) };
  }

  async create(dto: CreateFiscalCalendarRequest, ctx: AuditContext): Promise<FiscalDetail> {
    this.assertValid(dto);
    const created = await this.prisma
      .$transaction(async (tx) => {
        if (dto.isDefault) await tx.fiscalCalendar.updateMany({ data: { isDefault: false }, where: { isDefault: true } });
        return tx.fiscalCalendar.create({
          data: {
            key: dto.key,
            name: dto.name,
            description: dto.description ?? null,
            timezone: dto.timezone,
            isDefault: dto.isDefault ?? false,
            active: dto.active ?? true,
            periodKind: dto.periodKind,
            periodAnchorDay: dto.periodAnchorDay ?? null,
            periodStartWeekday: dto.periodStartWeekday ?? null,
            periodLengthDays: dto.periodLengthDays ?? null,
            periodAnchorDate: dto.periodAnchorDate ?? null,
            requirePeriod: dto.requirePeriod ?? false,
          },
        });
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateKey(err, dto.key);
      });
    await this.audit.record({
      ...ctx,
      action: "fiscalcalendar.created",
      entityType: "FiscalCalendar",
      entityId: created.id,
      after: { ...created },
    });
    return this.getDetail(created.id);
  }

  async update(id: string, dto: UpdateFiscalCalendarRequest, ctx: AuditContext): Promise<FiscalDetail> {
    const before = await this.prisma.fiscalCalendar.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException("Calendario fiscal no encontrado");
    this.assertValid({
      timezone: dto.timezone,
      periodKind: dto.periodKind,
      periodAnchorDay: dto.periodAnchorDay ?? null,
      periodStartWeekday: dto.periodStartWeekday ?? null,
      periodLengthDays: dto.periodLengthDays ?? null,
      periodAnchorDate: dto.periodAnchorDate ?? null,
    });

    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.fiscalCalendar.updateMany({ data: { isDefault: false }, where: { isDefault: true, id: { not: id } } });
      }
      await tx.fiscalCalendar.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description === undefined ? undefined : dto.description,
          timezone: dto.timezone ?? undefined,
          isDefault: dto.isDefault === undefined ? undefined : dto.isDefault,
          active: dto.active === undefined ? undefined : dto.active,
          periodKind: dto.periodKind ?? undefined,
          periodAnchorDay: dto.periodAnchorDay === undefined ? undefined : dto.periodAnchorDay,
          periodStartWeekday: dto.periodStartWeekday === undefined ? undefined : dto.periodStartWeekday,
          periodLengthDays: dto.periodLengthDays === undefined ? undefined : dto.periodLengthDays,
          periodAnchorDate: dto.periodAnchorDate === undefined ? undefined : dto.periodAnchorDate,
          requirePeriod: dto.requirePeriod === undefined ? undefined : dto.requirePeriod,
        },
      });
    });
    const after = await this.getDetail(id);
    await this.audit.record({
      ...ctx,
      action: "fiscalcalendar.updated",
      entityType: "FiscalCalendar",
      entityId: id,
      before: { ...before },
      after: { ...after },
    });
    return after;
  }

  async setDefault(id: string, ctx: AuditContext): Promise<FiscalDetail> {
    const cal = await this.prisma.fiscalCalendar.findFirst({ where: { id, deletedAt: null } });
    if (!cal) throw new NotFoundException("Calendario fiscal no encontrado");
    await this.prisma.$transaction([
      this.prisma.fiscalCalendar.updateMany({ data: { isDefault: false }, where: { isDefault: true, id: { not: id } } }),
      this.prisma.fiscalCalendar.update({ where: { id }, data: { isDefault: true } }),
    ]);
    await this.audit.record({ ...ctx, action: "fiscalcalendar.set_default", entityType: "FiscalCalendar", entityId: id });
    return this.getDetail(id);
  }

  async assignNodes(id: string, dto: AssignFiscalNodesRequest, ctx: AuditContext): Promise<{ assignedNodeIds: string[] }> {
    const cal = await this.prisma.fiscalCalendar.findFirst({ where: { id, deletedAt: null } });
    if (!cal) throw new NotFoundException("Calendario fiscal no encontrado");
    const ids = [...new Set(dto.orgNodeIds)];
    if (ids.length > 0) {
      const found = await this.prisma.orgNode.count({ where: { id: { in: ids }, deletedAt: null } });
      if (found !== ids.length) throw new BadRequestException("Uno o más nodos no existen.");
    }
    await this.prisma.$transaction([
      this.prisma.orgNode.updateMany({
        where: { fiscalCalendarId: id, id: { notIn: ids.length ? ids : ["__none__"] } },
        data: { fiscalCalendarId: null },
      }),
      this.prisma.orgNode.updateMany({ where: { id: { in: ids } }, data: { fiscalCalendarId: id } }),
    ]);
    await this.audit.record({
      ...ctx,
      action: "fiscalcalendar.nodes_assigned",
      entityType: "FiscalCalendar",
      entityId: id,
      metadata: { count: ids.length },
    });
    return { assignedNodeIds: ids };
  }

  async remove(id: string, ctx: AuditContext): Promise<void> {
    const cal = await this.prisma.fiscalCalendar.findFirst({ where: { id, deletedAt: null } });
    if (!cal) throw new NotFoundException("Calendario fiscal no encontrado");
    if (cal.isDefault) {
      throw new BadRequestException("No se puede eliminar el calendario fiscal por defecto. Marque otro como predeterminado primero.");
    }
    await this.prisma.$transaction([
      this.prisma.orgNode.updateMany({ where: { fiscalCalendarId: id }, data: { fiscalCalendarId: null } }),
      this.prisma.fiscalCalendar.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } }),
    ]);
    await this.audit.record({
      ...ctx,
      action: "fiscalcalendar.deleted",
      entityType: "FiscalCalendar",
      entityId: id,
      before: { key: cal.key, name: cal.name },
    });
  }

  // --- Helpers ---------------------------------------------------------------

  private assertValid(input: Parameters<typeof validateFiscalCalendar>[0] & { timezone: string }): void {
    const errors: string[] = [];
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: input.timezone });
    } catch {
      errors.push(`Zona horaria inválida: "${input.timezone}".`);
    }
    errors.push(...validateFiscalCalendar(input));
    if (errors.length > 0) throw new BadRequestException(errors.join(" "));
  }

  private mapDuplicateKey(err: unknown, key: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new BadRequestException(`Ya existe un calendario fiscal con la clave "${key}".`);
    }
    return err;
  }
}
