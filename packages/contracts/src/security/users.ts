import { z } from "zod";
import { emailSchema } from "./auth.js";

/** Estados posibles de una cuenta de usuario. */
export const USER_STATUSES = ["ACTIVE", "DISABLED", "LOCKED", "INVITED"] as const;
export const userStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof userStatusSchema>;

/**
 * Una entrada de alcance de datos (nodo + si hereda a descendientes). El campo
 * `includeDescendants` es explícito (sin default) para que el tipo de entrada y
 * salida coincidan: así el cliente lo envía siempre y los consumidores tipados no
 * caen en la ambigüedad input/output de Zod.
 */
export const scopeEntrySchema = z.object({
  orgNodeId: z.string().min(1),
  includeDescendants: z.boolean(),
});
export type ScopeEntry = z.infer<typeof scopeEntrySchema>;

/**
 * Alcance por PLANTILLA (2.ª dimensión ABAC, Fase 2.8). Lista plana de ids de
 * plantilla a las que el usuario/rol tiene acceso operacional. **Semántica
 * permisiva**: ausencia total de entradas = sin restricción (ve TODAS), igual
 * que el alcance por nodo. Es un eje ortogonal al de nodo y combina en AND.
 * Sin `includeDescendants` (no hay jerarquía de plantillas).
 */
export const templateScopeEntrySchema = z.object({
  templateId: z.string().min(1),
});
export type TemplateScopeEntry = z.infer<typeof templateScopeEntrySchema>;

/** Una plantilla asignable, para poblar el selector de alcance por plantilla. */
export const templateScopeOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Nodo de la plantilla; `null` = plantilla global (sin nodo). */
  orgNodePath: z.string().nullable(),
});
export type TemplateScopeOption = z.infer<typeof templateScopeOptionSchema>;

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
  /** Alcance por plantilla (ids). Vacío = sin restricción de plantilla (ve todas). */
  templateScopes: z.array(z.string()),
  /**
   * Administración DELEGADA por estructura (L2b): ids de las estructuras que este
   * usuario puede ADMINISTRAR (árbol/niveles/ciclo de vida) sin ser super-admin. Se
   * UNE en read-time con las de sus roles. Vacío = no administra ninguna por delegación
   * (el super-admin —permiso `module:structure:manage`— administra todas igual). Es un
   * eje DISTINTO del alcance de datos (`scopes`): administrar ≠ ver datos de sus nodos.
   */
  adminStructureIds: z.array(z.string()),
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

/** Reemplaza el alcance de datos (por nodo) del usuario. */
export const assignScopeRequestSchema = z.object({
  scopes: z.array(scopeEntrySchema),
});
export type AssignScopeRequest = z.infer<typeof assignScopeRequestSchema>;

/** Reemplaza el alcance por plantilla del usuario (lista plana de ids). */
export const assignTemplateScopeRequestSchema = z.object({
  templateIds: z.array(z.string().min(1)),
});
export type AssignTemplateScopeRequest = z.infer<typeof assignTemplateScopeRequestSchema>;

/**
 * Reemplaza el conjunto de estructuras que un sujeto (usuario o rol) puede
 * ADMINISTRAR por delegación (L2b). Lista plana de ids de estructura; vacía = quitar
 * toda delegación. Compartido por los endpoints de usuario y de rol (paridad con el
 * alcance por nodo de L2a). Gateado por el permiso de super-admin
 * (`module:structure:manage`): solo quien administra todo reparte delegaciones.
 */
export const assignAdminStructuresRequestSchema = z.object({
  structureIds: z.array(z.string().min(1)),
});
export type AssignAdminStructuresRequest = z.infer<typeof assignAdminStructuresRequestSchema>;

/**
 * Reset de contraseña por un administrador: fija una contraseña temporal. El
 * backend valida la complejidad contra la política, fuerza el cambio en el
 * próximo ingreso y revoca las sesiones del usuario (no toca el MFA).
 */
export const adminResetPasswordRequestSchema = z.object({
  password: z.string().min(1),
});
export type AdminResetPasswordRequest = z.infer<typeof adminResetPasswordRequestSchema>;
