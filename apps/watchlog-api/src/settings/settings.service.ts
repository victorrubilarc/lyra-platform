import { Injectable } from "@nestjs/common";
import type { PeriodGovernanceAction, PeriodReauthMap, SystemSettingsDto, UpdateSystemSettingsRequest } from "@lyra/contracts";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

const SINGLETON_ID = "system";

type SettingsRow = {
  requireMfaPeriodClose: boolean;
  requireMfaPeriodReopen: boolean;
  requireMfaPeriodLock: boolean;
  requireMfaPeriodUnlock: boolean;
};

/**
 * Configuración del sistema (Fase 2.7.1.1 UX). Fila singleton (`id="system"`).
 * Hoy alberga la re-autenticación MFA de gobernanza de período POR ACCIÓN; exporta el
 * helper que consume `OperationalPeriodService` para el gate.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<SystemSettingsDto> {
    const row =
      (await this.prisma.systemSettings.findUnique({ where: { id: SINGLETON_ID } })) ??
      (await this.prisma.systemSettings.create({ data: { id: SINGLETON_ID } }));
    const updatedByName = row.updatedById
      ? ((await this.prisma.user.findUnique({ where: { id: row.updatedById }, select: { displayName: true } }))?.displayName ?? null)
      : null;
    return {
      requireMfaPeriodClose: row.requireMfaPeriodClose,
      requireMfaPeriodReopen: row.requireMfaPeriodReopen,
      requireMfaPeriodLock: row.requireMfaPeriodLock,
      requireMfaPeriodUnlock: row.requireMfaPeriodUnlock,
      updatedAt: row.updatedAt.toISOString(),
      updatedByName,
    };
  }

  /** Mapa acción → ¿exige MFA? (lo expone el listado de períodos). */
  async periodReauthMap(): Promise<PeriodReauthMap> {
    const row = await this.read();
    return {
      close: row.requireMfaPeriodClose,
      reopen: row.requireMfaPeriodReopen,
      lock: row.requireMfaPeriodLock,
      unlock: row.requireMfaPeriodUnlock,
    };
  }

  /** ¿La acción de gobernanza dada exige step-up MFA? */
  async requireMfaFor(action: PeriodGovernanceAction): Promise<boolean> {
    const map = await this.periodReauthMap();
    return map[action];
  }

  async update(dto: UpdateSystemSettingsRequest, actorId: string, ctx: AuditContext): Promise<SystemSettingsDto> {
    const before = await this.get();
    await this.prisma.systemSettings.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...dto, updatedById: actorId },
      update: { ...dto, updatedById: actorId },
    });
    const after = await this.get();
    await this.audit.record({
      ...ctx,
      action: "settings.updated",
      entityType: "SystemSettings",
      entityId: SINGLETON_ID,
      before: {
        requireMfaPeriodClose: before.requireMfaPeriodClose,
        requireMfaPeriodReopen: before.requireMfaPeriodReopen,
        requireMfaPeriodLock: before.requireMfaPeriodLock,
        requireMfaPeriodUnlock: before.requireMfaPeriodUnlock,
      },
      after: {
        requireMfaPeriodClose: after.requireMfaPeriodClose,
        requireMfaPeriodReopen: after.requireMfaPeriodReopen,
        requireMfaPeriodLock: after.requireMfaPeriodLock,
        requireMfaPeriodUnlock: after.requireMfaPeriodUnlock,
      },
    });
    return after;
  }

  private async read(): Promise<SettingsRow> {
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: {
        requireMfaPeriodClose: true,
        requireMfaPeriodReopen: true,
        requireMfaPeriodLock: true,
        requireMfaPeriodUnlock: true,
      },
    });
    return (
      row ?? {
        requireMfaPeriodClose: false,
        requireMfaPeriodReopen: false,
        requireMfaPeriodLock: false,
        requireMfaPeriodUnlock: false,
      }
    );
  }
}
