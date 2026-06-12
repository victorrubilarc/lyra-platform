import { z } from "zod";

/**
 * Configuración del sistema — Fase 2.7.1.1 (UX). Ajustes operativos globales del
 * single-tenant, persistidos en una fila singleton. Hoy alberga el control de
 * seguridad de gobernanza de períodos (re-autenticación MFA POR ACCIÓN, configurable);
 * extensible a futuros ajustes del sistema.
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
