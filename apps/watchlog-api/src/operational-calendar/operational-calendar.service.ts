import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  resolveShift,
  validateOperationalCalendar,
  type AssignCalendarNodesRequest,
  type CreateOperationalCalendarRequest,
  type ShiftResolution,
  type ShiftResolverCalendar,
  type UpdateOperationalCalendarRequest,
} from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import type { OperationalCalendar, OperationalShift } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

type CalendarWithShifts = OperationalCalendar & { shifts: OperationalShift[] };

/** Mapea una fila de BD (con turnos) a la config que consume `resolveShift`. */
export function toResolverCalendar(cal: CalendarWithShifts): ShiftResolverCalendar {
  return {
    timezone: cal.timezone,
    shifts: cal.shifts.map((s) => ({
      code: s.code,
      label: s.label,
      startTime: s.startTime,
      durationMinutes: s.durationMinutes,
    })),
    dayStartShiftCode: cal.dayStartShiftCode,
    periodKind: cal.periodKind,
    periodAnchorDay: cal.periodAnchorDay,
    periodStartWeekday: cal.periodStartWeekday,
    periodLengthDays: cal.periodLengthDays,
    periodAnchorDate: cal.periodAnchorDate,
  };
}

/**
 * Calendario operacional (OperationalCalendar + OperationalShift) — Fase 2.3.0.
 *
 * Catálogo GOBERNADO (molde ReferenceList/Equipment, no Template/Workflow): editable
 * en vivo + auditado. La inmutabilidad histórica la da el estampado de las dimensiones
 * en LogEntry (2.4). El guardado reemplaza los turnos EN BLOQUE (set pequeño y cohesivo).
 * Exactamente un calendario es el por defecto. Ver docs/DECISIONS.md (2026-06-09).
 */
@Injectable()
export class OperationalCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Lista calendarios vivos con su conteo de turnos. */
  async list(): Promise<(OperationalCalendar & { shiftCount: number })[]> {
    const cals = await this.prisma.operationalCalendar.findMany({
      where: { deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      include: { _count: { select: { shifts: true } } },
    });
    return cals.map(({ _count, ...c }) => ({ ...c, shiftCount: _count.shifts }));
  }

  /** Detalle con turnos ordenados y nodos asignados. */
  async getDetail(id: string): Promise<CalendarWithShifts & { assignedNodeIds: string[] }> {
    const cal = await this.prisma.operationalCalendar.findFirst({
      where: { id, deletedAt: null },
      include: { shifts: { orderBy: [{ sortOrder: "asc" }, { startTime: "asc" }] } },
    });
    if (!cal) throw new NotFoundException("Calendario operacional no encontrado");
    const nodes = await this.prisma.orgNode.findMany({
      where: { operationalCalendarId: id, deletedAt: null },
      select: { id: true },
    });
    return { ...cal, assignedNodeIds: nodes.map((n) => n.id) };
  }

  async create(dto: CreateOperationalCalendarRequest, ctx: AuditContext): Promise<CalendarWithShifts & { assignedNodeIds: string[] }> {
    this.assertValid(dto);
    const shifts = dto.shifts ?? [];
    const created = await this.prisma
      .$transaction(async (tx) => {
        if (dto.isDefault) await tx.operationalCalendar.updateMany({ data: { isDefault: false }, where: { isDefault: true } });
        return tx.operationalCalendar.create({
          data: {
            key: dto.key,
            name: dto.name,
            description: dto.description ?? null,
            timezone: dto.timezone,
            isDefault: dto.isDefault ?? false,
            active: dto.active ?? true,
            dayStartShiftCode: dto.dayStartShiftCode ?? null,
            periodKind: dto.periodKind,
            periodAnchorDay: dto.periodAnchorDay ?? null,
            periodStartWeekday: dto.periodStartWeekday ?? null,
            periodLengthDays: dto.periodLengthDays ?? null,
            periodAnchorDate: dto.periodAnchorDate ?? null,
            shifts: { create: shifts.map((s, i) => ({ code: s.code, label: s.label, startTime: s.startTime, durationMinutes: s.durationMinutes, sortOrder: s.sortOrder ?? i })) },
          },
          include: { shifts: true },
        });
      })
      .catch((err: unknown) => {
        throw this.mapDuplicateKey(err, dto.key);
      });
    await this.audit.record({ ...ctx, action: "opscalendar.created", entityType: "OperationalCalendar", entityId: created.id, after: { ...created } });
    return this.getDetail(created.id);
  }

  async update(id: string, dto: UpdateOperationalCalendarRequest, ctx: AuditContext): Promise<CalendarWithShifts & { assignedNodeIds: string[] }> {
    const before = await this.prisma.operationalCalendar.findFirst({ where: { id, deletedAt: null }, include: { shifts: true } });
    if (!before) throw new NotFoundException("Calendario operacional no encontrado");
    this.assertValid({ ...dto, shifts: dto.shifts ?? before.shifts });

    await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) await tx.operationalCalendar.updateMany({ data: { isDefault: false }, where: { isDefault: true, id: { not: id } } });
      await tx.operationalCalendar.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description === undefined ? undefined : dto.description,
          timezone: dto.timezone ?? undefined,
          isDefault: dto.isDefault === undefined ? undefined : dto.isDefault,
          active: dto.active === undefined ? undefined : dto.active,
          dayStartShiftCode: dto.dayStartShiftCode === undefined ? undefined : dto.dayStartShiftCode,
          periodKind: dto.periodKind ?? undefined,
          periodAnchorDay: dto.periodAnchorDay === undefined ? undefined : dto.periodAnchorDay,
          periodStartWeekday: dto.periodStartWeekday === undefined ? undefined : dto.periodStartWeekday,
          periodLengthDays: dto.periodLengthDays === undefined ? undefined : dto.periodLengthDays,
          periodAnchorDate: dto.periodAnchorDate === undefined ? undefined : dto.periodAnchorDate,
        },
      });
      // Reemplazo en bloque de los turnos (el editor envía el set completo).
      if (dto.shifts !== undefined) {
        await tx.operationalShift.deleteMany({ where: { calendarId: id } });
        if (dto.shifts.length > 0) {
          await tx.operationalShift.createMany({
            data: dto.shifts.map((s, i) => ({ calendarId: id, code: s.code, label: s.label, startTime: s.startTime, durationMinutes: s.durationMinutes, sortOrder: s.sortOrder ?? i })),
          });
        }
      }
    });
    const after = await this.getDetail(id);
    await this.audit.record({ ...ctx, action: "opscalendar.updated", entityType: "OperationalCalendar", entityId: id, before: { ...before }, after: { ...after } });
    return after;
  }

  /** Marca un calendario como el por defecto (desmarca el resto), en transacción. */
  async setDefault(id: string, ctx: AuditContext): Promise<CalendarWithShifts & { assignedNodeIds: string[] }> {
    const cal = await this.prisma.operationalCalendar.findFirst({ where: { id, deletedAt: null } });
    if (!cal) throw new NotFoundException("Calendario operacional no encontrado");
    await this.prisma.$transaction([
      this.prisma.operationalCalendar.updateMany({ data: { isDefault: false }, where: { isDefault: true, id: { not: id } } }),
      this.prisma.operationalCalendar.update({ where: { id }, data: { isDefault: true } }),
    ]);
    await this.audit.record({ ...ctx, action: "opscalendar.set_default", entityType: "OperationalCalendar", entityId: id });
    return this.getDetail(id);
  }

  /** Reemplaza el conjunto de nodos asignados directamente a este calendario. */
  async assignNodes(id: string, dto: AssignCalendarNodesRequest, ctx: AuditContext): Promise<{ assignedNodeIds: string[] }> {
    const cal = await this.prisma.operationalCalendar.findFirst({ where: { id, deletedAt: null } });
    if (!cal) throw new NotFoundException("Calendario operacional no encontrado");
    const ids = [...new Set(dto.orgNodeIds)];
    if (ids.length > 0) {
      const found = await this.prisma.orgNode.count({ where: { id: { in: ids }, deletedAt: null } });
      if (found !== ids.length) throw new BadRequestException("Uno o más nodos no existen.");
    }
    await this.prisma.$transaction([
      // Quitar de los nodos que ya no están en el set.
      this.prisma.orgNode.updateMany({ where: { operationalCalendarId: id, id: { notIn: ids.length ? ids : ["__none__"] } }, data: { operationalCalendarId: null } }),
      // Asignar a los nodos del set.
      this.prisma.orgNode.updateMany({ where: { id: { in: ids } }, data: { operationalCalendarId: id } }),
    ]);
    await this.audit.record({ ...ctx, action: "opscalendar.nodes_assigned", entityType: "OperationalCalendar", entityId: id, metadata: { count: ids.length } });
    return { assignedNodeIds: ids };
  }

  /**
   * Borrado lógico. Bloquea el calendario por defecto (debe haber siempre uno).
   * Limpia las asignaciones de nodos para no dejar punteros a un calendario muerto.
   */
  async remove(id: string, ctx: AuditContext): Promise<void> {
    const cal = await this.prisma.operationalCalendar.findFirst({ where: { id, deletedAt: null } });
    if (!cal) throw new NotFoundException("Calendario operacional no encontrado");
    if (cal.isDefault) {
      throw new BadRequestException("No se puede eliminar el calendario por defecto. Marque otro como predeterminado primero.");
    }
    await this.prisma.$transaction([
      this.prisma.orgNode.updateMany({ where: { operationalCalendarId: id }, data: { operationalCalendarId: null } }),
      this.prisma.operationalCalendar.update({ where: { id }, data: { deletedAt: new Date(), isDefault: false } }),
    ]);
    await this.audit.record({ ...ctx, action: "opscalendar.deleted", entityType: "OperationalCalendar", entityId: id, before: { key: cal.key, name: cal.name } });
  }

  /** Resuelve un timestamp contra un calendario específico (probador de la UI / verificación). */
  async preview(id: string, at: Date): Promise<ShiftResolution> {
    const cal = await this.getDetail(id);
    return resolveShift(at, toResolverCalendar(cal));
  }

  // --- Helpers ---------------------------------------------------------------

  /** Re-valida en backend (defensa en profundidad sobre el contrato). */
  private assertValid(input: Parameters<typeof validateOperationalCalendar>[0]): void {
    const errors = validateOperationalCalendar(input);
    if (errors.length > 0) throw new BadRequestException(errors.join(" "));
  }

  private mapDuplicateKey(err: unknown, key: string): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return new BadRequestException(`Ya existe un calendario con la clave "${key}".`);
    }
    return err;
  }
}
