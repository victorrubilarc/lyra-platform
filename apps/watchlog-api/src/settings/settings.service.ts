import { BadRequestException, Injectable } from "@nestjs/common";
import {
  setupLocaleSchema,
  setupThemeModeSchema,
  type EditWindowAnchor,
  type PeriodGovernanceAction,
  type PeriodReauthMap,
  type SystemSettingsDto,
  type UpdateSystemSettingsRequest,
} from "@lyra/contracts";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { isValidTimezone } from "../common/timezone";
import { PrismaService } from "../prisma/prisma.service";

const SINGLETON_ID = "system";

type SettingsRow = {
  requireMfaPeriodClose: boolean;
  requireMfaPeriodReopen: boolean;
  requireMfaPeriodLock: boolean;
  requireMfaPeriodUnlock: boolean;
  editWindowAnchor: EditWindowAnchor;
  editWindowMinutes: number | null;
  requireMfaEditWindowOverride: boolean;
  notifyTransitionDefaultDestinationRoles: boolean;
};

const SETTINGS_SELECT = {
  requireMfaPeriodClose: true,
  requireMfaPeriodReopen: true,
  requireMfaPeriodLock: true,
  requireMfaPeriodUnlock: true,
  editWindowAnchor: true,
  editWindowMinutes: true,
  requireMfaEditWindowOverride: true,
  notifyTransitionDefaultDestinationRoles: true,
} as const;

const SETTINGS_DEFAULTS: SettingsRow = {
  requireMfaPeriodClose: false,
  requireMfaPeriodReopen: false,
  requireMfaPeriodLock: false,
  requireMfaPeriodUnlock: false,
  editWindowAnchor: "RECORDED",
  editWindowMinutes: null,
  requireMfaEditWindowOverride: false,
  notifyTransitionDefaultDestinationRoles: true,
};

/**
 * Configuración del sistema (Fase 2.7.1.1 UX → 2.7.2). Fila singleton (`id="system"`).
 * Alberga la re-autenticación MFA de gobernanza de período POR ACCIÓN y la VENTANA DE
 * EDICIÓN global (fallback de las plantillas) con su propio gate de MFA para el override.
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
      editWindowAnchor: row.editWindowAnchor,
      editWindowMinutes: row.editWindowMinutes,
      requireMfaEditWindowOverride: row.requireMfaEditWindowOverride,
      notifyTransitionDefaultDestinationRoles: row.notifyTransitionDefaultDestinationRoles,
      // Identidad (OOBE S3): los valores del wizard, editables post-setup. Los
      // enums se sanean en el borde de salida (BD anómala ⇒ null, jamás revienta).
      companyDisplayName: row.companyDisplayName,
      defaultTimezone: row.defaultTimezone,
      defaultLocale: enumOrNull(setupLocaleSchema, row.defaultLocale),
      defaultThemeMode: enumOrNull(setupThemeModeSchema, row.defaultThemeMode),
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

  /**
   * Ventana de edición GLOBAL (2.7.2): fallback de las plantillas sin config propia
   * + el gate de MFA del override, en UNA lectura (la guarda y la huella de
   * `getDetail` necesitan ambos).
   */
  async editWindowSettings(): Promise<{
    editWindowAnchor: EditWindowAnchor;
    editWindowMinutes: number | null;
    requireMfaEditWindowOverride: boolean;
  }> {
    const row = await this.read();
    return {
      editWindowAnchor: row.editWindowAnchor,
      editWindowMinutes: row.editWindowMinutes,
      requireMfaEditWindowOverride: row.requireMfaEditWindowOverride,
    };
  }

  async update(dto: UpdateSystemSettingsRequest, actorId: string, ctx: AuditContext): Promise<SystemSettingsDto> {
    // La forma la valida Zod en el borde; la zona horaria IANA exige el runtime
    // (misma regla que el wizard — una sola fuente de verdad).
    if (dto.defaultTimezone != null && !isValidTimezone(dto.defaultTimezone)) {
      throw new BadRequestException(`Zona horaria desconocida: "${dto.defaultTimezone}".`);
    }
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
      before: this.auditShape(before),
      after: this.auditShape(after),
    });
    return after;
  }

  /** Foto auditable de los ajustes (sin metadatos de actualización). */
  private auditShape(dto: SystemSettingsDto) {
    return {
      requireMfaPeriodClose: dto.requireMfaPeriodClose,
      requireMfaPeriodReopen: dto.requireMfaPeriodReopen,
      requireMfaPeriodLock: dto.requireMfaPeriodLock,
      requireMfaPeriodUnlock: dto.requireMfaPeriodUnlock,
      editWindowAnchor: dto.editWindowAnchor,
      editWindowMinutes: dto.editWindowMinutes,
      requireMfaEditWindowOverride: dto.requireMfaEditWindowOverride,
      notifyTransitionDefaultDestinationRoles: dto.notifyTransitionDefaultDestinationRoles,
      companyDisplayName: dto.companyDisplayName,
      defaultTimezone: dto.defaultTimezone,
      defaultLocale: dto.defaultLocale,
      defaultThemeMode: dto.defaultThemeMode,
    };
  }

  private async read(): Promise<SettingsRow> {
    const row = await this.prisma.systemSettings.findUnique({
      where: { id: SINGLETON_ID },
      select: SETTINGS_SELECT,
    });
    return row ?? SETTINGS_DEFAULTS;
  }
}

/** Saneo de enums leídos de columnas String (BD anómala ⇒ null, jamás revienta). */
function enumOrNull<T>(schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }, value: string | null): T | null {
  if (value === null) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? (parsed.data as T) : null;
}
