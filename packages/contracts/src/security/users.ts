import { z } from "zod";
import { emailSchema } from "./auth.js";

/** Estados posibles de una cuenta de usuario. */
export const USER_STATUSES = ["ACTIVE", "DISABLED", "LOCKED", "INVITED"] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

/** Una entrada de alcance de datos (nodo + si hereda a descendientes). */
export const scopeEntrySchema = z.object({
  orgNodeId: z.string().min(1),
  includeDescendants: z.boolean().default(true),
});
export type ScopeEntry = z.infer<typeof scopeEntrySchema>;

/** Resumen de usuario para listados. */
export const userSummarySchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  status: userStatusSchema,
  mfaEnabled: z.boolean(),
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/** Detalle de usuario, incluido su alcance de datos. */
export const userDetailSchema = userSummarySchema.extend({
  forcePasswordChange: z.boolean(),
  /** El rol del usuario exige MFA (según el modo global). Derivado en el backend. */
  mfaRequired: z.boolean(),
  scopes: z.array(scopeEntrySchema),
});
export type UserDetail = z.infer<typeof userDetailSchema>;

/** Alta de usuario. La contraseña inicial obliga a cambio en el primer login. */
export const createUserRequestSchema = z.object({
  email: emailSchema,
  displayName: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  /** Contraseña temporal asignada por el administrador. */
  password: z.string().min(1),
  roleIds: z.array(z.string()).default([]),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

/** Edición de datos básicos del usuario. */
export const updateUserRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120).optional(),
  status: userStatusSchema.optional(),
});
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

/** Reemplaza el conjunto de roles del usuario. */
export const assignRolesRequestSchema = z.object({
  roleIds: z.array(z.string()),
});
export type AssignRolesRequest = z.infer<typeof assignRolesRequestSchema>;

/** Reemplaza el alcance de datos del usuario. */
export const assignScopeRequestSchema = z.object({
  scopes: z.array(scopeEntrySchema),
});
export type AssignScopeRequest = z.infer<typeof assignScopeRequestSchema>;
