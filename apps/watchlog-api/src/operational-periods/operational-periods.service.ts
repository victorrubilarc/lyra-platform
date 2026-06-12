import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  enumeratePeriods,
  yearRange,
  type ListOperationalPeriodsResponse,
  type OperationalPeriodDto,
  type PeriodGovernanceAction,
  type PeriodHistoryResponse,
} from "@lyra/contracts";
import type { FiscalCalendar, OperationalPeriod } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";
import { ShiftResolver } from "../operational-calendar/shift-resolver";
import { FiscalResolver, toFiscalConfig } from "../fiscal-calendar/fiscal-resolver";
import { ReauthService, type ReauthCredentials } from "../auth/reauth.service";
import { SettingsService } from "../settings/settings.service";

/** Permiso de excepción que permite escribir en períodos CLOSED (no aplica a LOCKED). */
export const PERIOD_WRITE_CLOSED_PERMISSION = "opsperiod:write-closed";

/** Marca de secuencialidad inversa: reabrir un CLOSED con posteriores solo-CLOSED exige acuse. */
export const REOPEN_NEEDS_ACK = "REOPEN_LATER_CLOSED";

/**
 * Período contable gobernado (Fase 2.7.1 → 2.7.1.1).
 *
 * Modelo MATERIALIZADO (backbone Maximo): los períodos se GENERAN explícitamente como
 * filas contiguas con rango `[periodStart, periodEnd)`. Tri-estado OPEN→CLOSED→LOCKED
 * (NetSuite). Fuente única de la guarda de escritura: `assertWritable` sobre la
 * `effectiveAt` que el write persistiría (las lecturas/verificación de firma nunca la invocan).
 *
 * Resolución del período: el `ShiftResolver` produce el `operationalDate` y el
 * `FiscalResolver` lo mapea al `periodKey` del calendario fiscal del nodo (ejes desacoplados).
 */
@Injectable()
export class OperationalPeriodService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shiftResolver: ShiftResolver,
    private readonly fiscalResolver: FiscalResolver,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly reauth: ReauthService,
  ) {}

  /**
   * Re-autenticación con MFA (step-up) para gobernar un período, SI el ajuste de esa
   * ACCIÓN está activo (configurable por separado: close/reopen/lock/unlock). Reutiliza
   * `ReauthService` (mismo motor de las firmas Part 11). Devuelve si se verificó MFA, para
   * dejarlo ESTAMPADO en la auditoría (el ajuste puede cambiar después: el registro
   * histórico debe ser auto-descriptivo).
   */
  private async assertReauth(actorId: string, creds: ReauthCredentials, action: PeriodGovernanceAction): Promise<boolean> {
    if (await this.settings.requireMfaFor(action)) {
      await this.reauth.verifyForSignature(actorId, creds, { requireMfa: true });
      return true;
    }
    return false;
  }

  // --- Guarda de escritura ---------------------------------------------------

  /**
   * Estado de gobernanza del período en que cae `at` para el nodo dado. null = ungobernado
   * (sin día operacional, sin calendario fiscal o sin llave derivable): nunca bloquea.
   */
  private async statusFor(
    at: Date,
    orgNodeId?: string | null,
  ): Promise<{ fiscalCalendar: FiscalCalendar; periodKey: string; row: OperationalPeriod | null } | null> {
    const shift = await this.shiftResolver.resolve(at, orgNodeId);
    const resolved = await this.fiscalResolver.resolvePeriodKey(shift?.operationalDate ?? null, orgNodeId);
    if (!resolved) return null;
    const row = await this.prisma.operationalPeriod.findUnique({
      where: { fiscalCalendarId_periodKey: { fiscalCalendarId: resolved.fiscalCalendarId, periodKey: resolved.periodKey } },
    });
    return { fiscalCalendar: resolved.fiscalCalendar, periodKey: resolved.periodKey, row };
  }

  /**
   * Motivo por el que la escritura en `at` está bloqueada para el actor, o null si es
   * escribible. Decisión única (la usan `assertWritable` y la huella de `getDetail`):
   *  - LOCKED → bloquea a TODOS (incluido el bypass).
   *  - CLOSED → bloquea salvo `opsperiod:write-closed`.
   *  - sin fila generada + `requirePeriod` → bloquea salvo el bypass (rigor Maximo opt-in).
   */
  private async blockMessage(
    at: Date,
    orgNodeId: string | null | undefined,
    perms: ReadonlySet<string>,
  ): Promise<string | null> {
    const s = await this.statusFor(at, orgNodeId);
    if (!s) return null;
    const hasBypass = perms.has(PERIOD_WRITE_CLOSED_PERMISSION);
    if (s.row) {
      if (s.row.status === "LOCKED") {
        return "El período contable de esta fecha está BLOQUEADO (LOCKED): nadie puede registrar ni modificar. Requiere desbloqueo (opsperiod:unlock).";
      }
      if ((s.row.status === "CLOSED" || s.row.status === "CLOSING") && !hasBypass) {
        return "El período contable de esta fecha está cerrado: no puede registrar ni modificar (se requiere permiso de excepción).";
      }
    } else if (s.fiscalCalendar.requirePeriod && !hasBypass) {
      return "La fecha no cae en ningún período contable generado y el calendario fiscal exige período (se requiere permiso de excepción).";
    }
    return null;
  }

  /** Lanza 403 si la fecha cae en un período no escribible para el actor. */
  async assertWritable(at: Date, orgNodeId: string | null | undefined, perms: ReadonlySet<string>): Promise<void> {
    const msg = await this.blockMessage(at, orgNodeId, perms);
    if (msg) throw new ForbiddenException(msg);
  }

  /** ¿La escritura en `at` está bloqueada para este actor? (huella de lectura, no lanza). */
  async isWriteBlockedForActor(at: Date, orgNodeId: string | null | undefined, perms: ReadonlySet<string>): Promise<boolean> {
    return (await this.blockMessage(at, orgNodeId, perms)) !== null;
  }

  // --- Mantenedor ------------------------------------------------------------

  /** Períodos MATERIALIZADOS de un calendario fiscal, recientes primero, con marca Actual. */
  async list(fiscalCalendarId: string): Promise<ListOperationalPeriodsResponse> {
    const cal = await this.assertCalendarExists(fiscalCalendarId);
    const rows = await this.prisma.operationalPeriod.findMany({
      where: { fiscalCalendarId },
      orderBy: { periodStart: "desc" },
    });
    const today = todayInTimezone(cal.timezone);
    const names = await this.namesByUserId(rows.flatMap((r) => [r.closedById, r.lockedById, r.reopenedById]));
    const requireReauth = await this.settings.periodReauthMap();
    return { fiscalCalendarId, periods: rows.map((r) => this.toDto(r, today, names)), requireReauth };
  }

  /**
   * Historial de gobernanza de un período, derivado del AuditLog INMUTABLE (quién/cuándo
   * cerró/reabrió/bloqueó/desbloqueó, con motivo). Más reciente primero.
   */
  async history(fiscalCalendarId: string, periodKey: string): Promise<PeriodHistoryResponse> {
    await this.assertCalendarExists(fiscalCalendarId);
    const row = await this.prisma.operationalPeriod.findUnique({
      where: { fiscalCalendarId_periodKey: { fiscalCalendarId, periodKey } },
      select: { id: true },
    });
    if (!row) return { fiscalCalendarId, periodKey, entries: [] };
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType: "OperationalPeriod", entityId: row.id },
      orderBy: { occurredAt: "desc" },
      select: { action: true, actorEmail: true, occurredAt: true, before: true, after: true, metadata: true },
    });
    const actorNames = await this.namesByEmail(logs.map((l) => l.actorEmail));
    const entries = logs.map((l) => {
      const before = (l.before ?? {}) as { status?: string };
      const after = (l.after ?? {}) as { status?: string; reason?: string };
      const meta = (l.metadata ?? {}) as { mfaVerified?: boolean };
      return {
        action: l.action,
        actorName: l.actorEmail ? (actorNames.get(l.actorEmail) ?? l.actorEmail) : null,
        occurredAt: l.occurredAt.toISOString(),
        fromStatus: before.status ?? null,
        toStatus: after.status ?? null,
        reason: after.reason ?? null,
        // null para registros previos a estampar la huella (no se asume nada).
        mfaVerified: typeof meta.mfaVerified === "boolean" ? meta.mfaVerified : null,
      };
    });
    return { fiscalCalendarId, periodKey, entries };
  }

  /**
   * Genera (materializa) los períodos del año, idempotente: crea las filas faltantes
   * (OPEN) y JAMÁS degrada un CLOSED/LOCKED. Devuelve la lista resultante.
   */
  async generate(fiscalCalendarId: string, year: number, ctx: AuditContext): Promise<ListOperationalPeriodsResponse> {
    const cal = await this.assertCalendarExists(fiscalCalendarId);
    const { fromDate, toDate } = yearRange(year);
    const bounds = enumeratePeriods(toFiscalConfig(cal), fromDate, toDate);
    if (bounds.length === 0) {
      throw new BadRequestException("La configuración del calendario fiscal no permite derivar períodos.");
    }
    const existing = await this.prisma.operationalPeriod.findMany({
      where: { fiscalCalendarId, periodKey: { in: bounds.map((b) => b.periodKey) } },
      select: { periodKey: true },
    });
    const existingKeys = new Set(existing.map((e) => e.periodKey));
    const toCreate = bounds.filter((b) => !existingKeys.has(b.periodKey));
    if (toCreate.length > 0) {
      await this.prisma.operationalPeriod.createMany({
        data: toCreate.map((b) => ({
          fiscalCalendarId,
          periodKey: b.periodKey,
          periodStart: b.periodStart,
          periodEnd: b.periodEnd,
          status: "OPEN" as const,
        })),
      });
    }
    await this.audit.record({
      ...ctx,
      action: "opsperiod.generated",
      entityType: "FiscalCalendar",
      entityId: fiscalCalendarId,
      metadata: { year, created: toCreate.length, total: bounds.length },
    });
    return this.list(fiscalCalendarId);
  }

  /** Cierra un período (OPEN → CLOSED) con guarda SECUENCIAL: no hay un anterior abierto. */
  async close(fiscalCalendarId: string, periodKey: string, reason: string, creds: ReauthCredentials, actorId: string, ctx: AuditContext): Promise<OperationalPeriodDto> {
    const mfaVerified = await this.assertReauth(actorId, creds, "close");
    const cal = await this.assertCalendarExists(fiscalCalendarId);
    const row = await this.getRow(fiscalCalendarId, periodKey);
    if (row.status !== "OPEN") {
      throw new BadRequestException("Solo se puede cerrar un período abierto.");
    }
    const earlierOpen = await this.prisma.operationalPeriod.findFirst({
      where: { fiscalCalendarId, periodStart: { lt: row.periodStart }, status: "OPEN" },
      orderBy: { periodStart: "asc" },
    });
    if (earlierOpen) {
      throw new ConflictException(
        `No se puede cerrar: el período anterior (${earlierOpen.periodKey}) sigue abierto. El cierre es secuencial.`,
      );
    }
    const updated = await this.prisma.operationalPeriod.update({
      where: { id: row.id },
      data: { status: "CLOSED", closedById: actorId, closedAt: new Date(), closeReason: reason, reopenedById: null, reopenedAt: null, reopenReason: null },
    });
    await this.recordTransition("opsperiod.closed", updated, row.status, reason, ctx, mfaVerified);
    return this.dtoWithNames(cal, updated);
  }

  /** Bloquea en duro un período (CLOSED → LOCKED). */
  async lock(fiscalCalendarId: string, periodKey: string, reason: string, creds: ReauthCredentials, actorId: string, ctx: AuditContext): Promise<OperationalPeriodDto> {
    const mfaVerified = await this.assertReauth(actorId, creds, "lock");
    const cal = await this.assertCalendarExists(fiscalCalendarId);
    const row = await this.getRow(fiscalCalendarId, periodKey);
    if (row.status !== "CLOSED" && row.status !== "CLOSING") {
      throw new BadRequestException("Solo se puede bloquear (LOCKED) un período cerrado.");
    }
    const updated = await this.prisma.operationalPeriod.update({
      where: { id: row.id },
      data: { status: "LOCKED", lockedById: actorId, lockedAt: new Date(), lockReason: reason },
    });
    await this.recordTransition("opsperiod.locked", updated, row.status, reason, ctx, mfaVerified);
    return this.dtoWithNames(cal, updated);
  }

  /** Desbloquea un período (LOCKED → CLOSED, two-key). */
  async unlock(fiscalCalendarId: string, periodKey: string, reason: string, creds: ReauthCredentials, actorId: string, ctx: AuditContext): Promise<OperationalPeriodDto> {
    const mfaVerified = await this.assertReauth(actorId, creds, "unlock");
    const cal = await this.assertCalendarExists(fiscalCalendarId);
    const row = await this.getRow(fiscalCalendarId, periodKey);
    if (row.status !== "LOCKED") {
      throw new BadRequestException("Solo se puede desbloquear un período bloqueado (LOCKED).");
    }
    const updated = await this.prisma.operationalPeriod.update({
      where: { id: row.id },
      data: { status: "CLOSED", lockedById: actorId, lockedAt: new Date(), lockReason: reason },
    });
    await this.recordTransition("opsperiod.unlocked", updated, row.status, reason, ctx, mfaVerified);
    return this.dtoWithNames(cal, updated);
  }

  /**
   * Reabre un período cerrado (CLOSED → OPEN). Secuencialidad inversa: BLOQUEA si existe un
   * período posterior LOCKED; si los posteriores están solo CLOSED, exige `acknowledgeLaterClosed`.
   */
  async reopen(
    fiscalCalendarId: string,
    periodKey: string,
    reason: string,
    acknowledgeLaterClosed: boolean,
    creds: ReauthCredentials,
    actorId: string,
    ctx: AuditContext,
  ): Promise<OperationalPeriodDto> {
    const mfaVerified = await this.assertReauth(actorId, creds, "reopen");
    const cal = await this.assertCalendarExists(fiscalCalendarId);
    const row = await this.getRow(fiscalCalendarId, periodKey);
    if (row.status !== "CLOSED" && row.status !== "CLOSING") {
      throw new BadRequestException("Solo se puede reabrir un período cerrado.");
    }
    const laterLocked = await this.prisma.operationalPeriod.findFirst({
      where: { fiscalCalendarId, periodStart: { gt: row.periodStart }, status: "LOCKED" },
      orderBy: { periodStart: "asc" },
    });
    if (laterLocked) {
      throw new ConflictException(
        `No se puede reabrir: un período posterior (${laterLocked.periodKey}) está BLOQUEADO. Desbloquéelo primero.`,
      );
    }
    const laterClosed = await this.prisma.operationalPeriod.findFirst({
      where: { fiscalCalendarId, periodStart: { gt: row.periodStart }, status: { in: ["CLOSED", "CLOSING"] } },
      orderBy: { periodStart: "asc" },
    });
    if (laterClosed && !acknowledgeLaterClosed) {
      throw new ConflictException({
        reason: REOPEN_NEEDS_ACK,
        message: `Hay períodos posteriores ya cerrados (p. ej. ${laterClosed.periodKey}). Reabrir este período rompe la secuencia: confirme para continuar.`,
      });
    }
    const updated = await this.prisma.operationalPeriod.update({
      where: { id: row.id },
      data: { status: "OPEN", reopenedById: actorId, reopenedAt: new Date(), reopenReason: reason },
    });
    await this.recordTransition("opsperiod.reopened", updated, row.status, reason, ctx, mfaVerified);
    return this.dtoWithNames(cal, updated);
  }

  // --- Helpers ---------------------------------------------------------------

  private async assertCalendarExists(fiscalCalendarId: string): Promise<FiscalCalendar> {
    const cal = await this.prisma.fiscalCalendar.findFirst({ where: { id: fiscalCalendarId, deletedAt: null } });
    if (!cal) throw new NotFoundException("Calendario fiscal no encontrado");
    return cal;
  }

  private async getRow(fiscalCalendarId: string, periodKey: string): Promise<OperationalPeriod> {
    const row = await this.prisma.operationalPeriod.findUnique({
      where: { fiscalCalendarId_periodKey: { fiscalCalendarId, periodKey } },
    });
    if (!row) {
      throw new NotFoundException("Período no encontrado. Genere los períodos del año antes de gobernarlos.");
    }
    return row;
  }

  private async recordTransition(
    action: string,
    row: OperationalPeriod,
    fromStatus: string,
    reason: string,
    ctx: AuditContext,
    mfaVerified: boolean,
  ): Promise<void> {
    await this.audit.record({
      ...ctx,
      action,
      entityType: "OperationalPeriod",
      entityId: row.id,
      before: { status: fromStatus },
      after: { fiscalCalendarId: row.fiscalCalendarId, periodKey: row.periodKey, status: row.status, reason },
      // Huella ESTAMPADA: ¿la acción se re-autenticó con MFA en ESE momento? El ajuste
      // puede cambiar después; el historial debe ser auto-descriptivo.
      metadata: { mfaVerified },
    });
  }

  private async dtoWithNames(cal: FiscalCalendar, row: OperationalPeriod): Promise<OperationalPeriodDto> {
    const names = await this.namesByUserId([row.closedById, row.lockedById, row.reopenedById]);
    return this.toDto(row, todayInTimezone(cal.timezone), names);
  }

  private toDto(row: OperationalPeriod, today: string, names: Map<string, string>): OperationalPeriodDto {
    return {
      fiscalCalendarId: row.fiscalCalendarId,
      periodKey: row.periodKey,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      status: row.status,
      isCurrent: row.periodStart <= today && today < row.periodEnd,
      closedById: row.closedById,
      closedByName: row.closedById ? (names.get(row.closedById) ?? null) : null,
      closedAt: row.closedAt?.toISOString() ?? null,
      closeReason: row.closeReason,
      lockedById: row.lockedById,
      lockedByName: row.lockedById ? (names.get(row.lockedById) ?? null) : null,
      lockedAt: row.lockedAt?.toISOString() ?? null,
      lockReason: row.lockReason,
      reopenedById: row.reopenedById,
      reopenedByName: row.reopenedById ? (names.get(row.reopenedById) ?? null) : null,
      reopenedAt: row.reopenedAt?.toISOString() ?? null,
      reopenReason: row.reopenReason,
    };
  }

  private async namesByUserId(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true } });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }

  private async namesByEmail(emails: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(emails.filter((e): e is string => Boolean(e)))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { email: { in: unique } }, select: { email: true, displayName: true } });
    return new Map(users.map((u) => [u.email, u.displayName]));
  }
}

/** "YYYY-MM-DD" de hoy en la TZ dada (vía Intl; para la marca Actual). */
function todayInTimezone(timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}
