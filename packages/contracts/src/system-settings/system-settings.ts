import { z } from "zod";

/**
 * Configuración del sistema — Fase 2.7.1.1 (UX). Ajustes operativos globales del
 * single-tenant, persistidos en una fila singleton. Hoy alberga el control de
 * seguridad de gobernanza de períodos; extensible a futuros ajustes del sistema.
 */
export const systemSettingsSchema = z.object({
  /**
   * Si está activo, cerrar/reabrir/bloquear/desbloquear un período exige
   * re-autenticación con MFA (step-up NIST SP 800-63B), reusando `ReauthService`.
   */
  requireMfaForPeriodGovernance: z.boolean(),
  updatedAt: z.string(),
  updatedByName: z.string().nullable(),
});
export type SystemSettingsDto = z.infer<typeof systemSettingsSchema>;

/** Actualización de los ajustes del sistema (cuerpo parcial). */
export const updateSystemSettingsRequestSchema = z.object({
  requireMfaForPeriodGovernance: z.boolean().optional(),
});
export type UpdateSystemSettingsRequest = z.infer<typeof updateSystemSettingsRequestSchema>;
