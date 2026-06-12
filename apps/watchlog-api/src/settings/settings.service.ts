import { Injectable } from "@nestjs/common";
import type { SystemSettingsDto, UpdateSystemSettingsRequest } from "@lyra/contracts";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

const SINGLETON_ID = "system";

/**
 * Configuración del sistema (Fase 2.7.1.1 UX). Fila singleton (`id="system"`).
 * Hoy alberga el control de seguridad `requireMfaForPeriodGovernance`; exporta el
 * helper que consume `OperationalPeriodService` para el gate MFA.
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
      requireMfaForPeriodGovernance: row.requireMfaForPeriodGovernance,
      updatedAt: row.updatedAt.toISOString(),
      updatedByName,
    };
  }

  /** Helper para el gate: ¿la gobernanza de períodos exige MFA? */
  async requireMfaForPeriodGovernance(): Promise<boolean> {
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: { requireMfaForPeriodGovernance: true },
    });
    return row?.requireMfaForPeriodGovernance ?? false;
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
      before: { requireMfaForPeriodGovernance: before.requireMfaForPeriodGovernance },
      after: { requireMfaForPeriodGovernance: after.requireMfaForPeriodGovernance },
    });
    return after;
  }
}
