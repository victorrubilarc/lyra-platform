import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, LogSchedule, RoundOccurrence } from "@prisma/client";
import {
  enumerateOccurrences,
  type CreateLogScheduleRequest,
  type UpdateLogScheduleRequest,
  type LogScheduleDto,
  type RoundOccurrenceDto,
  type OccurrenceQuery,
  type MyRoundsQuery,
  type SkipOccurrenceRequest,
  type RecurrenceKind,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { ShiftResolver } from "../operational-calendar/shift-resolver";
import { FiscalResolver } from "../fiscal-calendar/fiscal-resolver";
import { LogEntriesService } from "../log-entries/log-entries.service";

const scheduleInclude = {
  template: { select: { name: true } },
  orgNode: { select: { name: true } },
  equipment: { select: { tag: true } },
  responsibleRole: { select: { name: true } },
} satisfies Prisma.LogScheduleInclude;

type ScheduleRow = LogSchedule & {
  template: { name: string } | null;
  orgNode: { name: string } | null;
  equipment: { tag: string | null } | null;
  responsibleRole: { name: string } | null;
};

// RoundOccurrence denormaliza templateId/orgNodeId/equipmentId (sin relación propia):
// los nombres para mostrar se resuelven vía la relación `schedule` (el nodo/plantilla
// de una ocurrencia no cambian tras generarse).
const occurrenceInclude = {
  schedule: {
    select: {
      name: true,
      template: { select: { name: true } },
      orgNode: { select: { name: true } },
      equipment: { select: { tag: true } },
    },
  },
  logEntry: { select: { entryNumber: true } },
} satisfies Prisma.RoundOccurrenceInclude;

type OccurrenceRow = RoundOccurrence & {
  schedule: {
    name: string | null;
    template: { name: string } | null;
    orgNode: { name: string } | null;
    equipment: { tag: string | null } | null;
  } | null;
  logEntry: { entryNumber: number } | null;
};

/**
 * Programación de rondas (Fase 2.3). El HORARIO (`LogSchedule`) es gobernanza
 * operacional VIVA; el generador materializa OCURRENCIAS (`RoundOccurrence`)
 * idempotentes hacia un horizonte; la ENTRADA real se crea al INICIAR la ronda
 * (reusa `LogEntriesService.create`, que aplica todas las guardas ABAC/EAM). La
 * lógica pura de enumeración vive en `@lyra/contracts` (`enumerateOccurrences`).
 */
@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly shiftResolver: ShiftResolver,
    private readonly fiscalResolver: FiscalResolver,
    private readonly logEntries: LogEntriesService,
  ) {}

  // --- Horarios (LogSchedule) ------------------------------------------------

  async list(userId: string): Promise<LogScheduleDto[]> {
    const scope = await this.scopeFilters(userId);
    const rows = await this.prisma.logSchedule.findMany({
      where: { deletedAt: null, ...scope },
      include: scheduleInclude,
      orderBy: { createdAt: "desc" },
    });
    if (rows.length === 0) return [];
    // Conteos de pendientes/vencidas por horario (una query agregada, sin N+1).
    const now = new Date();
    const grouped = await this.prisma.roundOccurrence.groupBy({
      by: ["scheduleId"],
      where: { scheduleId: { in: rows.map((r) => r.id) }, status: "PENDING" },
      _count: { _all: true },
    });
    const overdue = await this.prisma.roundOccurrence.groupBy({
      by: ["scheduleId"],
      where: { scheduleId: { in: rows.map((r) => r.id) }, status: "PENDING", dueAt: { lt: now } },
      _count: { _all: true },
    });
    // "Próxima ronda" (next call date, patrón SAP PM): la ocurrencia PENDING más temprana.
    const nextAt = await this.prisma.roundOccurrence.groupBy({
      by: ["scheduleId"],
      where: { scheduleId: { in: rows.map((r) => r.id) }, status: "PENDING" },
      _min: { scheduledFor: true },
    });
    const pendMap = new Map(grouped.map((g) => [g.scheduleId, g._count._all]));
    const overMap = new Map(overdue.map((g) => [g.scheduleId, g._count._all]));
    const nextMap = new Map(nextAt.map((g) => [g.scheduleId, g._min.scheduledFor]));
    return rows.map((r) => this.toScheduleDto(r, pendMap.get(r.id) ?? 0, overMap.get(r.id) ?? 0, nextMap.get(r.id) ?? null));
  }

  async getDetail(userId: string, id: string): Promise<LogScheduleDto> {
    const row = await this.loadSchedule(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    return this.toScheduleDto(row);
  }

  async create(userId: string, dto: CreateLogScheduleRequest, ctx: AuditContext): Promise<LogScheduleDto> {
    await this.validateScheduleTarget(userId, dto.templateId, dto.orgNodeId, dto.equipmentId ?? null, dto.recurrenceKind, dto.recurrenceConfig);
    await this.assertResponsibleRoleExists(dto.responsibleRoleId ?? null);
    const row = await this.prisma.logSchedule.create({
      data: {
        name: dto.name ?? null,
        templateId: dto.templateId,
        orgNodeId: dto.orgNodeId,
        equipmentId: dto.equipmentId ?? null,
        responsibleRoleId: dto.responsibleRoleId ?? null,
        recurrenceKind: dto.recurrenceKind,
        recurrenceConfig: dto.recurrenceConfig as Prisma.InputJsonValue,
        dueWindowMinutes: dto.dueWindowMinutes,
        horizonDays: dto.horizonDays ?? 2,
        active: dto.active ?? true,
        createdById: userId,
        updatedById: userId,
      },
      include: scheduleInclude,
    });
    await this.audit.record({ ...ctx, action: "schedule.created", entityType: "LogSchedule", entityId: row.id, after: this.auditSnapshot(row) });
    // Materializa de inmediato para que el planificador vea las próximas rondas.
    await this.generateForSchedule(row);
    return this.toScheduleDto(await this.loadSchedule(row.id));
  }

  async update(userId: string, id: string, dto: UpdateLogScheduleRequest, ctx: AuditContext): Promise<LogScheduleDto> {
    const before = await this.loadSchedule(id);
    await this.assertNodeAccess(userId, before.orgNodeId);
    await this.validateRecurrence(before.orgNodeId, dto.recurrenceKind, dto.recurrenceConfig);
    if (dto.equipmentId) await this.logEntriesEquipmentCheck(dto.equipmentId, before.orgNodeId);
    if (dto.responsibleRoleId) await this.assertResponsibleRoleExists(dto.responsibleRoleId);

    // Si cambia la definición de recurrencia o se reactiva/cambia ventana/horizonte,
    // se regeneran las ocurrencias FUTURAS: se borran las PENDIENTES aún no iniciadas
    // (sin entrada ligada) cuyo scheduledFor > now y se reinicia la marca de agua.
    const recurrenceChanged =
      dto.recurrenceKind !== before.recurrenceKind ||
      JSON.stringify(dto.recurrenceConfig) !== JSON.stringify(before.recurrenceConfig) ||
      dto.dueWindowMinutes !== before.dueWindowMinutes ||
      (dto.horizonDays ?? before.horizonDays) !== before.horizonDays;

    const row = await this.prisma.logSchedule.update({
      where: { id },
      data: {
        name: dto.name === undefined ? undefined : dto.name,
        equipmentId: dto.equipmentId === undefined ? undefined : dto.equipmentId,
        responsibleRoleId: dto.responsibleRoleId === undefined ? undefined : dto.responsibleRoleId,
        recurrenceKind: dto.recurrenceKind,
        recurrenceConfig: dto.recurrenceConfig as Prisma.InputJsonValue,
        dueWindowMinutes: dto.dueWindowMinutes,
        horizonDays: dto.horizonDays ?? undefined,
        active: dto.active ?? undefined,
        lastGeneratedThrough: recurrenceChanged ? null : undefined,
        updatedById: userId,
      },
      include: scheduleInclude,
    });
    if (recurrenceChanged) {
      await this.prisma.roundOccurrence.deleteMany({
        where: { scheduleId: id, status: "PENDING", logEntryId: null, scheduledFor: { gt: new Date() } },
      });
    }
    await this.audit.record({ ...ctx, action: "schedule.updated", entityType: "LogSchedule", entityId: id, before: this.auditSnapshot(before), after: this.auditSnapshot(row) });
    if (row.active) await this.generateForSchedule(row);
    return this.toScheduleDto(await this.loadSchedule(id));
  }

  async remove(userId: string, id: string, ctx: AuditContext): Promise<void> {
    const row = await this.loadSchedule(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    await this.prisma.$transaction(async (tx) => {
      await tx.logSchedule.update({ where: { id }, data: { deletedAt: new Date(), active: false, updatedById: userId } });
      // Cancela las ocurrencias pendientes no iniciadas (no se pierden las cumplidas).
      await tx.roundOccurrence.updateMany({
        where: { scheduleId: id, status: "PENDING", logEntryId: null },
        data: { status: "CANCELED" },
      });
    });
    await this.audit.record({ ...ctx, action: "schedule.deleted", entityType: "LogSchedule", entityId: id, before: this.auditSnapshot(row) });
  }

  /** Roles (id+nombre) para el selector de rol responsable del planificador. */
  async roleOptions(): Promise<Array<{ id: string; name: string }>> {
    return this.prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  }

  // --- Generación idempotente -------------------------------------------------

  /** Genera ocurrencias de TODOS los horarios activos accesibles (uso lazy/manual). */
  async generateAll(userId: string, scheduleId?: string): Promise<{ generated: number }> {
    const scope = await this.scopeFilters(userId);
    const schedules = await this.prisma.logSchedule.findMany({
      where: {
        deletedAt: null,
        active: true,
        ...(scheduleId ? { id: scheduleId } : {}),
        ...scope,
      },
    });
    let generated = 0;
    for (const s of schedules) generated += await this.generateForSchedule(s);
    return { generated };
  }

  /**
   * Materializa las ocurrencias de UN horario en [lastGeneratedThrough || now,
   * now + horizonDays). Idempotente (upsert por la única `(scheduleId, scheduledFor)`;
   * lo existente NO se toca) y barato (avanza la marca de agua). Sin backfill del
   * pasado: un horario recién creado solo genera futuro.
   */
  private async generateForSchedule(schedule: LogSchedule): Promise<number> {
    if (!schedule.active || schedule.deletedAt || schedule.recurrenceKind === "NONE") return 0;
    const cal = await this.shiftResolver.calendarForNode(schedule.orgNodeId);
    if (!cal?.timezone) return 0; // sin calendario que ubique la hora local: no se genera
    const now = new Date();
    const from = schedule.lastGeneratedThrough && schedule.lastGeneratedThrough > now ? now : schedule.lastGeneratedThrough ?? now;
    const to = new Date(now.getTime() + schedule.horizonDays * 86_400_000);
    if (from >= to) return 0;

    const slots = enumerateOccurrences(
      {
        kind: schedule.recurrenceKind,
        config: (schedule.recurrenceConfig as Record<string, unknown>) ?? {},
        dueWindowMinutes: schedule.dueWindowMinutes,
        timezone: cal.timezone,
        shifts: cal.shifts.map((s) => ({ code: s.code, startTime: s.startTime, durationMinutes: s.durationMinutes })),
      },
      from,
      to,
    );

    const data: Prisma.RoundOccurrenceCreateManyInput[] = [];
    for (const slot of slots) {
      const res = await this.shiftResolver.resolve(slot.scheduledFor, schedule.orgNodeId);
      const periodKey = (await this.fiscalResolver.resolvePeriodKey(res?.operationalDate ?? null, schedule.orgNodeId))?.periodKey ?? null;
      data.push({
        scheduleId: schedule.id,
        templateId: schedule.templateId,
        orgNodeId: schedule.orgNodeId,
        equipmentId: schedule.equipmentId,
        scheduledFor: slot.scheduledFor,
        dueAt: slot.dueAt,
        shiftCode: slot.shiftCode ?? res?.shiftCode ?? null,
        operationalDate: res?.operationalDate ?? null,
        periodKey,
      });
    }
    // Idempotente: `skipDuplicates` ignora las que ya existen por (scheduleId, scheduledFor).
    const result = data.length > 0 ? await this.prisma.roundOccurrence.createMany({ data, skipDuplicates: true }) : { count: 0 };
    await this.prisma.logSchedule.update({ where: { id: schedule.id }, data: { lastGeneratedThrough: to } });
    return result.count;
  }

  // --- Ocurrencias (RoundOccurrence) -----------------------------------------

  /** Lista ocurrencias (genera lazy primero). "Vencida" se DERIVA (PENDING && dueAt<now). */
  async listOccurrences(userId: string, q: OccurrenceQuery): Promise<RoundOccurrenceDto[]> {
    await this.generateAll(userId, q.scheduleId);
    const scope = await this.scopeFilters(userId);
    const now = new Date();
    const where: Prisma.RoundOccurrenceWhereInput = {
      ...scope,
      ...(q.scheduleId ? { scheduleId: q.scheduleId } : {}),
      ...(q.templateId ? { templateId: q.templateId } : {}),
      ...(q.orgNodeId ? { orgNodeId: q.orgNodeId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.overdueOnly ? { status: "PENDING", dueAt: { lt: now } } : {}),
      ...(q.todayOnly ? { scheduledFor: { gte: startOfUtcDay(now), lt: endOfUtcDay(now) } } : {}),
    };
    const rows = await this.prisma.roundOccurrence.findMany({
      where,
      include: occurrenceInclude,
      orderBy: [{ status: "asc" }, { scheduledFor: "asc" }],
      take: 500,
    });
    return rows.map((r) => this.toOccurrenceDto(r, now));
  }

  /** Conteos para el KPI de /bitacoras y /rondas. */
  async occurrenceStats(userId: string): Promise<{ pending: number; overdue: number; today: number }> {
    await this.generateAll(userId);
    const now = new Date();
    const base: Prisma.RoundOccurrenceWhereInput = await this.scopeFilters(userId);
    const [pending, overdue, today] = await Promise.all([
      this.prisma.roundOccurrence.count({ where: { ...base, status: "PENDING" } }),
      this.prisma.roundOccurrence.count({ where: { ...base, status: "PENDING", dueAt: { lt: now } } }),
      this.prisma.roundOccurrence.count({
        where: { ...base, status: "PENDING", scheduledFor: { gte: startOfUtcDay(now), lt: endOfUtcDay(now) } },
      }),
    ]);
    return { pending, overdue, today };
  }

  /**
   * Inicia una ronda: crea (materializa) la ENTRADA real reusando
   * `LogEntriesService.create` (todas las guardas ABAC/EAM aplican) y la liga a la
   * ocurrencia. Idempotente: si ya tiene entrada, devuelve esa. Devuelve el id de la
   * entrada para que el front navegue al llenado.
   */
  async startOccurrence(userId: string, id: string, ctx: AuditContext, equipmentId?: string | null): Promise<{ logEntryId: string }> {
    const occ = await this.prisma.roundOccurrence.findUnique({ where: { id } });
    if (!occ) throw new NotFoundException("Ocurrencia no encontrada");
    await this.assertNodeAccess(userId, occ.orgNodeId);
    if (occ.logEntryId) return { logEntryId: occ.logEntryId };
    if (occ.status !== "PENDING") throw new BadRequestException("La ronda no está pendiente");

    const detail = await this.logEntries.create(
      userId,
      { templateId: occ.templateId, orgNodeId: occ.orgNodeId, equipmentId: occ.equipmentId ?? equipmentId ?? undefined },
      ctx,
    );
    await this.prisma.roundOccurrence.update({ where: { id }, data: { logEntryId: detail.id } });
    await this.audit.record({ ...ctx, action: "schedule.occurrence.started", entityType: "RoundOccurrence", entityId: id, after: { logEntryId: detail.id } });
    return { logEntryId: detail.id };
  }

  /** Omite una ocurrencia con motivo obligatorio auditado (GxP). */
  async skipOccurrence(userId: string, id: string, dto: SkipOccurrenceRequest, ctx: AuditContext): Promise<RoundOccurrenceDto> {
    const occ = await this.prisma.roundOccurrence.findUnique({ where: { id } });
    if (!occ) throw new NotFoundException("Ocurrencia no encontrada");
    await this.assertNodeAccess(userId, occ.orgNodeId);
    if (occ.status !== "PENDING") throw new BadRequestException("Solo se puede omitir una ronda pendiente");
    if (occ.logEntryId) throw new BadRequestException("La ronda ya tiene una entrada en curso; anúlela en su lugar");
    await this.prisma.roundOccurrence.update({
      where: { id },
      data: { status: "SKIPPED", skippedById: userId, skippedAt: new Date(), skipReason: dto.reason },
    });
    await this.audit.record({ ...ctx, action: "schedule.occurrence.skipped", entityType: "RoundOccurrence", entityId: id, after: { reason: dto.reason } });
    const row = await this.prisma.roundOccurrence.findUniqueOrThrow({ where: { id }, include: occurrenceInclude });
    return this.toOccurrenceDto(row, new Date());
  }

  // --- Worklist del operador ("Mis rondas", 2.3.1) ---------------------------

  /**
   * Worklist del OPERADOR: ocurrencias PENDING que son SUYAS. "Suyas" =
   * (nodos accesibles, ABAC) ∩ (rol responsable del horario ∈ sus roles, o el
   * horario no declara responsable ⇒ fallback nodo+turno). La responsabilidad se
   * lee EN VIVO del horario (no se denormaliza), así reasignar el rol re-enruta las
   * pendientes. Default = HOY + arrastre vencido (no oculta lo heredado del turno
   * anterior); toggles refinan a vencidas / mi turno / incluir futuras. Genera lazy.
   */
  async listMyRounds(userId: string, q: MyRoundsQuery): Promise<RoundOccurrenceDto[]> {
    await this.generateAll(userId);
    const where = await this.myRoundsWhere(userId, q);
    if (where === null) return []; // sin roles ni acceso ⇒ nada que ejecutar
    const rows = await this.prisma.roundOccurrence.findMany({
      where,
      include: occurrenceInclude,
      orderBy: [{ dueAt: "asc" }, { scheduledFor: "asc" }],
      take: 500,
    });
    return rows.map((r) => this.toOccurrenceDto(r, new Date()));
  }

  /** Conteos del worklist propio (badge de /bitacoras + widget de Inicio). */
  async myRoundsStats(userId: string): Promise<{ pending: number; overdue: number; today: number }> {
    await this.generateAll(userId);
    const base = await this.myRoundsWhere(userId, {});
    if (base === null) return { pending: 0, overdue: 0, today: 0 };
    const now = new Date();
    // `base` ya acota a hoy+vencidas; para "pending" total quitamos la cota temporal.
    const { scheduledFor: _omit, ...baseNoDate } = base;
    const [pending, overdue, today] = await Promise.all([
      this.prisma.roundOccurrence.count({ where: baseNoDate }),
      this.prisma.roundOccurrence.count({ where: { ...baseNoDate, dueAt: { lt: now } } }),
      this.prisma.roundOccurrence.count({
        where: { ...baseNoDate, scheduledFor: { gte: startOfUtcDay(now), lt: endOfUtcDay(now) } },
      }),
    ]);
    return { pending, overdue, today };
  }

  /**
   * Construye el `where` del worklist propio. Devuelve `null` si el usuario no puede
   * ver NINGUNA ronda (sin nodos accesibles distintos de "todos" sería null-set; aquí
   * `null` señala "lista vacía sin consultar"). El filtro de responsabilidad combina
   * el rol responsable con sus roles, dejando pasar los horarios SIN responsable.
   */
  private async myRoundsWhere(userId: string, q: MyRoundsQuery): Promise<Prisma.RoundOccurrenceWhereInput | null> {
    const nodeIds = await this.scope.getAccessibleNodeIds(userId);
    if (nodeIds && nodeIds.size === 0) return null; // no alcanza ningún nodo
    const roleIds = await this.getUserRoleIds(userId);
    const now = new Date();
    const where: Prisma.RoundOccurrenceWhereInput = {
      status: "PENDING",
      ...(nodeIds ? { orgNodeId: { in: [...nodeIds] } } : {}),
      // Responsabilidad por ROL (o fallback nodo+turno si el horario no declara rol).
      schedule: {
        deletedAt: null,
        OR: [{ responsibleRoleId: null }, ...(roleIds.length > 0 ? [{ responsibleRoleId: { in: roleIds } }] : [])],
      },
    };
    if (q.overdueOnly) where.dueAt = { lt: now };
    else if (!q.includeUpcoming) where.scheduledFor = { lt: endOfUtcDay(now) }; // hoy + arrastre vencido
    if (q.shiftOnly) {
      const res = await this.shiftResolver.resolve(now, null);
      where.shiftCode = res?.shiftCode ?? " "; // sin turno vigente ⇒ no calza ninguno
    }
    return where;
  }

  /** Ids de roles del usuario (para el filtro de responsabilidad del worklist). */
  private async getUserRoleIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return rows.map((r) => r.roleId);
  }

  // --- Notificaciones (Bloque N): rondas vencidas ----------------------------

  /**
   * Genera ocurrencias de TODOS los horarios activos (system-level, SIN scope de
   * usuario). Lo usa el SWEEPER de notificaciones ANTES de escanear vencidas: las
   * ocurrencias se materializan lazy (al listar) + marca de agua, así que sin esto
   * las rondas que NADIE abrió no existen como filas y se perderían sus avisos.
   */
  async generateAllActive(): Promise<number> {
    const schedules = await this.prisma.logSchedule.findMany({ where: { deletedAt: null, active: true } });
    let generated = 0;
    for (const s of schedules) generated += await this.generateForSchedule(s);
    return generated;
  }

  /** Ids de ocurrencias VENCIDAS (PENDING && dueAt<now), system-wide, para el sweeper. */
  async findOverdueOccurrenceIds(limit = 200): Promise<string[]> {
    const rows = await this.prisma.roundOccurrence.findMany({
      where: { status: "PENDING", dueAt: { lt: new Date() } },
      select: { id: true },
      orderBy: { dueAt: "asc" },
      take: limit,
    });
    return rows.map((r) => r.id);
  }

  /**
   * Destinatarios + datos de una ronda vencida para el dispatcher de notificaciones.
   * Reusa la responsabilidad del worklist (2.3.1): el ROL RESPONSABLE del horario
   * (∈ roles del usuario), NUNCA el equipo (un activo no expande a personas). Filtra
   * por ABAC (nodo ∩ plantilla). Sin rol responsable ⇒ sin destinatario DERIVADO (las
   * suscripciones explícitas lo cubren; el fan-out por nodo para correo = BACKLOG).
   * Devuelve `null` si la ocurrencia dejó de estar vencida-pendiente (carrera con
   * iniciar/omitir entre el barrido y el despacho).
   */
  async resolveOverdueRecipients(occurrenceId: string): Promise<{
    userIds: string[];
    orgNodeId: string;
    templateId: string;
    scheduleName: string | null;
    templateName: string | null;
    nodeName: string | null;
    equipmentTag: string | null;
    scheduledFor: Date;
    dueAt: Date;
  } | null> {
    const occ = await this.prisma.roundOccurrence.findUnique({
      where: { id: occurrenceId },
      include: {
        schedule: {
          select: {
            responsibleRoleId: true,
            name: true,
            template: { select: { name: true } },
            orgNode: { select: { name: true } },
            equipment: { select: { tag: true } },
          },
        },
      },
    });
    if (!occ || occ.status !== "PENDING" || occ.dueAt >= new Date()) return null;
    let userIds: string[] = [];
    const roleId = occ.schedule?.responsibleRoleId ?? null;
    if (roleId) {
      const rows = await this.prisma.userRole.findMany({ where: { roleId }, select: { userId: true } });
      userIds = await this.filterUsersByAccess([...new Set(rows.map((r) => r.userId))], occ.orgNodeId, occ.templateId);
    }
    return {
      userIds,
      orgNodeId: occ.orgNodeId,
      templateId: occ.templateId,
      scheduleName: occ.schedule?.name ?? null,
      templateName: occ.schedule?.template?.name ?? null,
      nodeName: occ.schedule?.orgNode?.name ?? null,
      equipmentTag: occ.schedule?.equipment?.tag ?? null,
      scheduledFor: occ.scheduledFor,
      dueAt: occ.dueAt,
    };
  }

  /** Filtra usuarios a los que alcanzan el nodo Y la plantilla (ABAC, ambos ejes). */
  private async filterUsersByAccess(userIds: string[], orgNodeId: string, templateId: string): Promise<string[]> {
    const out: string[] = [];
    for (const uid of userIds) {
      if ((await this.scope.canAccessNode(uid, orgNodeId)) && (await this.scope.canAccessTemplate(uid, templateId))) {
        out.push(uid);
      }
    }
    return out;
  }

  // --- Validación / helpers ---------------------------------------------------

  private async validateScheduleTarget(
    userId: string,
    templateId: string,
    orgNodeId: string,
    equipmentId: string | null,
    kind: RecurrenceKind,
    config: Record<string, unknown>,
  ): Promise<void> {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, deletedAt: null },
      include: { nodeAssignments: { select: { orgNodeId: true, includeDescendants: true, orgNode: { select: { path: true } } } } },
    });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    if (template.status !== "PUBLISHED" || !template.currentVersionId) {
      throw new BadRequestException("La plantilla debe estar publicada para programar rondas");
    }
    await this.assertNodeAccess(userId, orgNodeId);
    await this.scope.assertTemplateInScope(userId, template.id);
    // Multi-nodo (2.8.0): el nodo debe pertenecer al alcance de la plantilla.
    if (template.nodeAssignments.length > 0) {
      const direct = template.nodeAssignments.some((a) => !a.includeDescendants && a.orgNodeId === orgNodeId);
      const branches = template.nodeAssignments.filter((a) => a.includeDescendants);
      let ok = direct;
      if (!ok && branches.length > 0) {
        const node = await this.prisma.orgNode.findUnique({ where: { id: orgNodeId }, select: { path: true } });
        ok = !!node && branches.some((a) => node.path.startsWith(a.orgNode.path));
      }
      if (!ok) throw new BadRequestException("El nodo no pertenece al alcance de la plantilla");
    }
    if (template.equipmentMode === "NONE" && equipmentId) throw new BadRequestException("Esta plantilla no admite equipo");
    if (equipmentId) await this.logEntriesEquipmentCheck(equipmentId, orgNodeId);
    await this.validateRecurrence(orgNodeId, kind, config);
  }

  /** SHIFT exige calendario con turnos; valida que los shiftCodes filtrados existan. */
  private async validateRecurrence(orgNodeId: string, kind: RecurrenceKind, config: Record<string, unknown>): Promise<void> {
    const cal = await this.shiftResolver.calendarForNode(orgNodeId);
    if ((kind === "SHIFT" || kind === "INTERVAL" || kind === "CALENDAR") && !cal?.timezone) {
      throw new BadRequestException("El nodo no tiene un calendario operacional; asígnele uno para programar rondas");
    }
    if (kind === "SHIFT") {
      const codes = (config.shiftCodes as string[] | undefined) ?? [];
      if (cal!.shifts.length === 0) throw new BadRequestException("El calendario del nodo no tiene turnos definidos");
      const known = new Set(cal!.shifts.map((s) => s.code));
      const bad = codes.filter((c) => !known.has(c));
      if (bad.length > 0) throw new BadRequestException(`Turno(s) inexistente(s) en el calendario: ${bad.join(", ")}`);
    }
  }

  private async logEntriesEquipmentCheck(equipmentId: string, orgNodeId: string): Promise<void> {
    const eq = await this.prisma.equipment.findFirst({ where: { id: equipmentId, deletedAt: null }, select: { orgNodeId: true, active: true } });
    if (!eq || !eq.active) throw new BadRequestException("El equipo indicado no existe o está inactivo");
    if (eq.orgNodeId !== orgNodeId) throw new BadRequestException("El equipo no pertenece al nodo del horario");
  }

  /** El rol responsable, si se indica, debe existir. */
  private async assertResponsibleRoleExists(roleId: string | null): Promise<void> {
    if (!roleId) return;
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true } });
    if (!role) throw new BadRequestException("El rol responsable indicado no existe");
  }

  /**
   * Filtros ABAC del PLANIFICADOR: nodo ∩ plantilla (mismos dos ejes de 2.8, en AND;
   * "gana la más estricta"). `null` en cualquiera = sin restricción en ese eje. Tanto
   * `LogSchedule` como `RoundOccurrence` denormalizan `orgNodeId` y `templateId`, así que
   * el mismo filtro sirve para horarios y ocurrencias. Aísla por ÁREA (nodo) y por TIPO de
   * bitácora (plantilla): un planificador de un área no ve las de otra.
   */
  private async scopeFilters(userId: string): Promise<{ orgNodeId?: { in: string[] }; templateId?: { in: string[] } }> {
    const [nodeIds, tplIds] = await Promise.all([
      this.scope.getAccessibleNodeIds(userId),
      this.scope.getAccessibleTemplateIds(userId),
    ]);
    return {
      ...(nodeIds ? { orgNodeId: { in: [...nodeIds] } } : {}),
      ...(tplIds ? { templateId: { in: [...tplIds] } } : {}),
    };
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
  }

  private async loadSchedule(id: string): Promise<ScheduleRow> {
    const row = await this.prisma.logSchedule.findFirst({ where: { id, deletedAt: null }, include: scheduleInclude });
    if (!row) throw new NotFoundException("Horario no encontrado");
    return row;
  }

  private toScheduleDto(row: ScheduleRow, pendingCount?: number, overdueCount?: number, nextOccurrenceAt?: Date | null): LogScheduleDto {
    return {
      id: row.id,
      name: row.name,
      templateId: row.templateId,
      templateName: row.template?.name,
      orgNodeId: row.orgNodeId,
      orgNodeName: row.orgNode?.name,
      equipmentId: row.equipmentId,
      equipmentTag: row.equipment?.tag ?? null,
      responsibleRoleId: row.responsibleRoleId,
      responsibleRoleName: row.responsibleRole?.name ?? null,
      recurrenceKind: row.recurrenceKind,
      recurrenceConfig: (row.recurrenceConfig as Record<string, unknown>) ?? {},
      dueWindowMinutes: row.dueWindowMinutes,
      horizonDays: row.horizonDays,
      active: row.active,
      lastGeneratedThrough: row.lastGeneratedThrough?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      ...(pendingCount !== undefined ? { pendingCount } : {}),
      ...(overdueCount !== undefined ? { overdueCount } : {}),
      ...(nextOccurrenceAt !== undefined ? { nextOccurrenceAt: nextOccurrenceAt?.toISOString() ?? null } : {}),
    };
  }

  private toOccurrenceDto(row: OccurrenceRow, now: Date): RoundOccurrenceDto {
    return {
      id: row.id,
      scheduleId: row.scheduleId,
      scheduleName: row.schedule?.name ?? null,
      templateId: row.templateId,
      templateName: row.schedule?.template?.name,
      orgNodeId: row.orgNodeId,
      orgNodeName: row.schedule?.orgNode?.name,
      equipmentId: row.equipmentId,
      equipmentTag: row.schedule?.equipment?.tag ?? null,
      scheduledFor: row.scheduledFor.toISOString(),
      dueAt: row.dueAt.toISOString(),
      shiftCode: row.shiftCode,
      operationalDate: row.operationalDate,
      periodKey: row.periodKey,
      status: row.status,
      overdue: row.status === "PENDING" && row.dueAt < now,
      logEntryId: row.logEntryId,
      entryNumber: row.logEntry?.entryNumber ?? null,
      skippedById: row.skippedById,
      skippedAt: row.skippedAt?.toISOString() ?? null,
      skipReason: row.skipReason,
      generatedAt: row.generatedAt.toISOString(),
    };
  }

  private auditSnapshot(row: LogSchedule): Prisma.InputJsonValue {
    return {
      name: row.name,
      templateId: row.templateId,
      orgNodeId: row.orgNodeId,
      equipmentId: row.equipmentId,
      responsibleRoleId: row.responsibleRoleId,
      recurrenceKind: row.recurrenceKind,
      recurrenceConfig: row.recurrenceConfig as Prisma.InputJsonValue,
      dueWindowMinutes: row.dueWindowMinutes,
      horizonDays: row.horizonDays,
      active: row.active,
    };
  }
}

/** Inicio del día UTC de un instante (para el filtro "hoy"). */
function startOfUtcDay(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
}
function endOfUtcDay(at: Date): Date {
  return new Date(startOfUtcDay(at).getTime() + 86_400_000);
}
