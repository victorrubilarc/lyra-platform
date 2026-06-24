import { z } from "zod";
import { mfaModeSchema } from "./auth.js";
import { scopeEntrySchema } from "./users.js";

/** Clave de rol: minúsculas, números y guiones (ej. `supervisor-turno`). */
export const roleKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "Usa solo minúsculas, números y guiones");

/** Resumen de rol para listados. */
export const roleSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  /** Si true, los usuarios con este rol deben tener MFA activo (cuando el modo global lo honra). */
  requireMfa: z.boolean(),
  permissionCount: z.number().int().nonnegative(),
  userCount: z.number().int().nonnegative(),
});
export type RoleSummary = z.infer<typeof roleSummarySchema>;

/** Detalle de rol con sus permisos. */
export const roleDetailSchema = roleSummarySchema.extend({
  permissionKeys: z.array(z.string()),
  /**
   * Alcance por NODO (ABAC dim. 4) del rol. Se UNE en read-time al alcance del
   * usuario (unión user+roles en `ScopeService`). Vacío = el rol no aporta
   * restricción de nodo. Eje ortogonal al de plantilla (combinan en AND).
   */
  scopes: z.array(scopeEntrySchema),
  /** Alcance por plantilla (ids) del rol. Vacío = sin restricción (ve todas). */
  templateScopes: z.array(z.string()),
});
export type RoleDetail = z.infer<typeof roleDetailSchema>;

/** Alta de rol. */
export const createRoleRequestSchema = z.object({
  key: roleKeySchema,
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(280).optional(),
  permissionKeys: z.array(z.string()).default([]),
  /** Exigir MFA a los usuarios con este rol (cuando el modo global lo honra). */
  requireMfa: z.boolean().default(false),
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

/** Edición de rol. La `key` y `isSystem` no se modifican tras el alta. */
export const updateRoleRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(280).nullable().optional(),
  permissionKeys: z.array(z.string()).optional(),
  requireMfa: z.boolean().optional(),
});
export type UpdateRoleRequest = z.infer<typeof updateRoleRequestSchema>;

/** Política de contraseñas configurable (fila singleton). */
export const passwordPolicySchema = z.object({
  minLength: z.number().int().min(8).max(128),
  requireUppercase: z.boolean(),
  requireNumber: z.boolean(),
  requireSymbol: z.boolean(),
  /** Días hasta forzar cambio; `null` = sin expiración. */
  expiryDays: z.number().int().positive().nullable(),
  /** Cuántas contraseñas anteriores no se pueden reutilizar. */
  historyCount: z.number().int().min(0).max(24),
  /** Intentos fallidos antes de bloquear la cuenta. */
  maxFailedAttempts: z.number().int().min(1).max(20),
  /** Minutos de bloqueo tras superar los intentos. */
  lockoutMinutes: z.number().int().min(1).max(1440),
  /** Modo global de requerimiento de MFA (ver `mfaModeSchema`). */
  mfaMode: mfaModeSchema,
});
export type PasswordPolicy = z.infer<typeof passwordPolicySchema>;

/** Edición parcial de la política de contraseñas. */
export const updatePasswordPolicyRequestSchema = passwordPolicySchema.partial();
export type UpdatePasswordPolicyRequest = z.infer<typeof updatePasswordPolicyRequestSchema>;
