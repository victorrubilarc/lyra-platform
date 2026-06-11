import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  enumeratePeriodKeys,
  type ClosePeriodRequest,
  type ListOperationalPeriodsResponse,
  type OperationalPeriodDto,
  type PeriodStatus,
  type ReopenPeriodRequest,
} from "@lyra/contracts";
import type { OperationalPeriod } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { toResolverCalendar } from "../operational-calendar/operational-calendar.service";
import { ShiftResolver } from "../operational-calendar/shift-resolver";

/** Permiso de excepción que permite escribir en períodos en cierre / cerrados. */
export const PERIOD_WRITE_CLOSED_PERMISSION = "opsperiod:write-closed";

/** Días hacia atrás/adelante que enumera el listado (cubre ~13 meses / semanas / ciclos). */
const LIST_WINDOW_BACK_DAYS = 400;
const LIST_WINDOW_FORWARD_DAYS = 45;

/**
 * Período contable gobernado (Fase 2.7.1).
 *
 * Modelo LAZY: la ausencia de fila = OPEN. Cerrar/poner en cierre crea o actualiza una
 * fila `OperationalPeriod`; reabrir la vuelve a OPEN conservando el rastro de reapertura.
 *
 * Es la FUENTE ÚNICA de la guarda de escritura por período: `assertWritable` se invoca en
 * cada mutación de `LogEntriesService` (create / saveSection / setDeferral / submit /
 * executeTransition) sobre la `effectiveAt` que el write persistiría. Las lecturas y la
 * verificación de firma nunca la invocan.
 */
@Injectable()
export class OperationalPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolver,
    private readonly audit: AuditService,
  ) {}

  // --- Guarda de escritura ---------------------------------------------------

  /**
   * Estado de gobernanza del período en que cae `at` para el nodo dado. null = sin
   * calendario o sin llave de período derivable (ungobernado: nunca bloquea).
   */
  async statusFor(
    at: Date,
    orgNodeId?: string | null,
  ): Promise<{ calendarId: string; periodKey: string; status: PeriodStatus } | null> {
    const resolved = await this.shiftResolver.resolveWithCalendar(at, orgNodeId);
    if (!resolved || resolved.resolution.periodKey === null) return null;
    const row = await this.prisma.operationalPeriod.findUnique({
      where: { calendarId_periodKey: { calendarId: resolved.calendarId, periodKey: resolved.resolution.periodKey } },
    });
    return {
      calendarId: resolved.calendarId,
      periodKey: resolved.resolution.periodKey,
      status: row?.status ?? "OPEN",
    };
  }

  /** ¿La escritura en `at` está bloqueada para un actor SIN el permiso de excepción? */
  async isWriteBlocked(at: Date, orgNodeId?: string | null): Promise<boolean> {
    const s = await this.statusFor(at, orgNodeId);
    return s !== null && s.status !== "OPEN";
  }

  /**
   * Lanza 403 (`PERIOD_CLOSED`) si la fecha cae en un período en cierre/cerrado y el
   * actor no tiene `opsperiod:write-closed`. `perms` = permisos efectivos del actor.
   */
  async assertWritable(at: Date, orgNodeId: string | null | undefined, perms: ReadonlySet<string>): Promise<void> {
    if (perms.has(PERIOD_WRITE_CLOSED_PERMISSION)) return;
    if (await this.isWriteBlocked(at, orgNodeId)) {
      throw new ForbiddenException(
        "El período contable de esta fecha está cerrado: no puede registrar ni modificar (se requiere permiso de excepción).",
      );
    }
  }

  // --- Mantenedor ------------------------------------------------------------

  /**
   * Períodos de un calendario: los recientes DERIVADOS de su configuración (sin
   * pre-generar filas) unidos con las filas explícitas (cerrados/en cierre, incluso
   * fuera de la ventana). OPEN para los que no tienen fila. Orden: más reciente primero.
   */
  async list(calendarId: string): Promise<ListOperationalPeriodsResponse> {
    const cal = await this.prisma.operationalCalendar.findFirst({
      where: { id: calendarId, deletedAt: null },
      include: { shifts: true },
    });
    if (!cal) throw new NotFoundException("Calendario no encontrado");

    const today = new Date();
    const from = isoDateOffset(today, -LIST_WINDOW_BACK_DAYS);
    const to = isoDateOffset(today, LIST_WINDOW_FORWARD_DAYS);
    const derived = enumeratePeriodKeys(toResolverCalendar(cal), from, to);

    const rows = await this.prisma.operationalPeriod.findMany({ where: { calendarId } });
    const rowByKey = new Map(rows.map((r) => [r.periodKey, r]));

    const allKeys = new Set<string>([...derived, ...rows.map((r) => r.periodKey)]);
    const names = await this.namesByUserId(rows.flatMap((r) => [r.closedById, r.reopenedById]));

    const periods: OperationalPeriodDto[] = [...allKeys]
      .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)) // descendente (más reciente primero)
      .map((periodKey) => this.toDto(calendarId, periodKey, rowByKey.get(periodKey) ?? null, names));

    return { calendarId, periods };
  }

  /** Cierra o pone en cierre un período (upsert de la fila). Auditado. */
  async close(
    calendarId: string,
    periodKey: string,
    dto: ClosePeriodRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<OperationalPeriodDto> {
    await this.assertCalendarExists(calendarId);
    const now = new Date();
    const before = await this.prisma.operationalPeriod.findUnique({
      where: { calendarId_periodKey: { calendarId, periodKey } },
    });
    const row = await this.prisma.operationalPeriod.upsert({
      where: { calendarId_periodKey: { calendarId, periodKey } },
      create: { calendarId, periodKey, status: dto.status, closedById: actorId, closedAt: now, closeReason: dto.reason },
      update: {
        status: dto.status,
        closedById: actorId,
        closedAt: now,
        closeReason: dto.reason,
        // Un cierre nuevo limpia el rastro de la reapertura previa.
        reopenedById: null,
        reopenedAt: null,
        reopenReason: null,
      },
    });
    await this.audit.record({
      ...ctx,
      action: "opsperiod.closed",
      entityType: "OperationalPeriod",
      entityId: row.id,
      before: before ? { status: before.status } : { status: "OPEN" },
      after: { calendarId, periodKey, status: dto.status, reason: dto.reason },
    });
    const names = await this.namesByUserId([row.closedById, row.reopenedById]);
    return this.toDto(calendarId, periodKey, row, names);
  }

  /** Reabre un período en cierre/cerrado (vuelve a OPEN). Auditado. */
  async reopen(
    calendarId: string,
    periodKey: string,
    dto: ReopenPeriodRequest,
    actorId: string,
    ctx: AuditContext,
  ): Promise<OperationalPeriodDto> {
    await this.assertCalendarExists(calendarId);
    const existing = await this.prisma.operationalPeriod.findUnique({
      where: { calendarId_periodKey: { calendarId, periodKey } },
    });
    if (!existing || existing.status === "OPEN") {
      throw new BadRequestException("El período ya está abierto");
    }
    const now = new Date();
    const row = await this.prisma.operationalPeriod.update({
      where: { calendarId_periodKey: { calendarId, periodKey } },
      data: { status: "OPEN", reopenedById: actorId, reopenedAt: now, reopenReason: dto.reason },
    });
    await this.audit.record({
      ...ctx,
      action: "opsperiod.reopened",
      entityType: "OperationalPeriod",
      entityId: row.id,
      before: { status: existing.status },
      after: { calendarId, periodKey, status: "OPEN", reason: dto.reason },
    });
    const names = await this.namesByUserId([row.closedById, row.reopenedById]);
    return this.toDto(calendarId, periodKey, row, names);
  }

  // --- Helpers ---------------------------------------------------------------

  private async assertCalendarExists(calendarId: string): Promise<void> {
    const cal = await this.prisma.operationalCalendar.findFirst({
      where: { id: calendarId, deletedAt: null },
      select: { id: true },
    });
    if (!cal) throw new NotFoundException("Calendario no encontrado");
  }

  private toDto(
    calendarId: string,
    periodKey: string,
    row: OperationalPeriod | null,
    names: Map<string, string>,
  ): OperationalPeriodDto {
    return {
      calendarId,
      periodKey,
      status: row?.status ?? "OPEN",
      closedById: row?.closedById ?? null,
      closedByName: row?.closedById ? (names.get(row.closedById) ?? null) : null,
      closedAt: row?.closedAt?.toISOString() ?? null,
      closeReason: row?.closeReason ?? null,
      reopenedById: row?.reopenedById ?? null,
      reopenedByName: row?.reopenedById ? (names.get(row.reopenedById) ?? null) : null,
      reopenedAt: row?.reopenedAt?.toISOString() ?? null,
      reopenReason: row?.reopenReason ?? null,
    };
  }

  private async namesByUserId(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, displayName: true },
    });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }
}

/** Devuelve "YYYY-MM-DD" desplazada `days` días respecto a `base` (en UTC; ventana holgada). */
function isoDateOffset(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
