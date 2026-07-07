import { z } from "zod";
import { setupLocaleSchema, setupThemeModeSchema } from "../setup/setup.js";
import { editWindowAnchorSchema, editWindowMinutesSchema } from "../templates/templates.js";

/**
 * Configuración del sistema — Fase 2.7.1.1 (UX). Ajustes operativos globales del
 * single-tenant, persistidos en una fila singleton. Hoy alberga el control de
 * seguridad de gobernanza de períodos (re-autenticación MFA POR ACCIÓN, configurable)
 * y la VENTANA DE EDICIÓN global (Fase 2.7.2); extensible a futuros ajustes.
 */

/** Acciones de gobernanza de período que pueden exigir step-up MFA, por separado. */
export const PERIOD_GOVERNANCE_ACTIONS = ["close", "reopen", "lock", "unlock"] as const;
export const periodGovernanceActionSchema = z.enum(PERIOD_GOVERNANCE_ACTIONS);
export type PeriodGovernanceAction = z.infer<typeof periodGovernanceActionSchema>;

export const systemSettingsSchema = z.object({
  /**
   * Re-autenticación MFA (step-up NIST SP 800-63B) exigida POR ACCIÓN de gobernanza
   * de período. Reúsa `ReauthService`. Configurable por separado para más flexibilidad
   * (p. ej. exigir MFA solo al reabrir y bloquear, no al cerrar).
   */
  requireMfaPeriodClose: z.boolean(),
  requireMfaPeriodReopen: z.boolean(),
  requireMfaPeriodLock: z.boolean(),
  requireMfaPeriodUnlock: z.boolean(),
  /**
   * Ventana de edición GLOBAL (Fase 2.7.2): fallback para plantillas que no definen
   * la suya. `editWindowMinutes` null o 0 = sin ventana (las entradas se editan sin
   * límite temporal, comportamiento pre-2.7.2). El ancla global SIEMPRE tiene valor
   * (default RECORDED): es el último eslabón de la cadena de herencia.
   */
  editWindowAnchor: editWindowAnchorSchema,
  editWindowMinutes: editWindowMinutesSchema.nullable(),
  /** Exigir re-auth con MFA al editar FUERA de ventana (override privilegiado). */
  requireMfaEditWindowOverride: z.boolean(),
  /**
   * Notificaciones avanzadas (Fase A): cuando una transición de flujo NO declara su propia
   * configuración de aviso, ¿se avisa a los roles del ESTADO DESTINO (conducta clásica de
   * `entry.transition`)? `true` = compatibilidad con el comportamiento previo; `false` = una
   * transición sin config no notifica. Lo lee el `NotificationResolverService`.
   */
  notifyTransitionDefaultDestinationRoles: z.boolean(),
  /**
   * Identidad de la instalación (OOBE S3): capturada por el wizard de primer
   * arranque y editable post-setup en /configuracion ▸ Identidad. Son FALLBACK
   * de instalación: no pisan preferencias por usuario. null = sin personalizar.
   * El logo NO viaja aquí (bytes servidos por `GET /api/branding/logo`).
   */
  companyDisplayName: z.string().nullable(),
  defaultTimezone: z.string().nullable(),
  defaultLocale: setupLocaleSchema.nullable(),
  defaultThemeMode: setupThemeModeSchema.nullable(),
  updatedAt: z.string(),
  updatedByName: z.string().nullable(),
});
export type SystemSettingsDto = z.infer<typeof systemSettingsSchema>;

/** Actualización de los ajustes del sistema (cuerpo parcial). */
export const updateSystemSettingsRequestSchema = z.object({
  requireMfaPeriodClose: z.boolean().optional(),
  requireMfaPeriodReopen: z.boolean().optional(),
  requireMfaPeriodLock: z.boolean().optional(),
  requireMfaPeriodUnlock: z.boolean().optional(),
  editWindowAnchor: editWindowAnchorSchema.optional(),
  editWindowMinutes: editWindowMinutesSchema.nullable().optional(),
  requireMfaEditWindowOverride: z.boolean().optional(),
  notifyTransitionDefaultDestinationRoles: z.boolean().optional(),
  // Identidad (OOBE S3): clave omitida = sin cambio; null EXPLÍCITO = limpiar.
  // (Recordar el gotcha Zod: `.optional()` a secas RECHAZA null.)
  companyDisplayName: z.string().trim().min(1).max(120).nullable().optional(),
  defaultTimezone: z.string().trim().min(1).max(64).nullable().optional(),
  defaultLocale: setupLocaleSchema.nullable().optional(),
  defaultThemeMode: setupThemeModeSchema.nullable().optional(),
});
export type UpdateSystemSettingsRequest = z.infer<typeof updateSystemSettingsRequestSchema>;

/** Mapa acción → ¿exige MFA? (lo expone el listado de períodos para que la UI pida creds). */
export const periodReauthMapSchema = z.object({
  close: z.boolean(),
  reopen: z.boolean(),
  lock: z.boolean(),
  unlock: z.boolean(),
});
export type PeriodReauthMap = z.infer<typeof periodReauthMapSchema>;
