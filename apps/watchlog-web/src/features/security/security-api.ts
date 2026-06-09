import {
  adminResetPasswordRequestSchema,
  assignRolesRequestSchema,
  assignScopeRequestSchema,
  auditLogEntrySchema,
  createRoleRequestSchema,
  createUserRequestSchema,
  passwordPolicySchema,
  roleDetailSchema,
  roleSummarySchema,
  updatePasswordPolicyRequestSchema,
  updateRoleRequestSchema,
  updateUserRequestSchema,
  userDetailSchema,
  userSummarySchema,
  type AssignRolesRequest,
  type AssignScopeRequest,
  type AuditFilters,
  type AuditLogEntry,
  type CreateRoleRequest,
  type CreateUserRequest,
  type PasswordPolicy,
  type PermissionDef,
  type RoleDetail,
  type RoleSummary,
  type UpdatePasswordPolicyRequest,
  type UpdateRoleRequest,
  type UpdateUserRequest,
  type UserDetail,
  type UserSummary,
} from "@lyra/contracts";
import { z } from "zod";
import { apiBlob, apiJson, apiVoid } from "../../lib/api-client.js";

// ─── Usuarios ────────────────────────────────────────────────────────────────

export function fetchUsers(): Promise<UserSummary[]> {
  return apiJson("/security/users", z.array(userSummarySchema));
}

export function fetchUser(id: string): Promise<UserDetail> {
  return apiJson(`/security/users/${id}`, userDetailSchema);
}

export function createUser(dto: CreateUserRequest): Promise<UserDetail> {
  createUserRequestSchema.parse(dto);
  return apiJson("/security/users", userDetailSchema, { method: "POST", body: dto });
}

export function updateUser(id: string, dto: UpdateUserRequest): Promise<UserDetail> {
  updateUserRequestSchema.parse(dto);
  return apiJson(`/security/users/${id}`, userDetailSchema, { method: "PATCH", body: dto });
}

export function assignUserRoles(id: string, dto: AssignRolesRequest): Promise<UserDetail> {
  assignRolesRequestSchema.parse(dto);
  return apiJson(`/security/users/${id}/roles`, userDetailSchema, { method: "PUT", body: dto });
}

export function assignUserScope(id: string, dto: AssignScopeRequest): Promise<UserDetail> {
  assignScopeRequestSchema.parse(dto);
  return apiJson(`/security/users/${id}/scope`, userDetailSchema, { method: "PUT", body: dto });
}

export function resetUserMfa(id: string): Promise<UserDetail> {
  return apiJson(`/security/users/${id}/mfa/reset`, userDetailSchema, { method: "POST" });
}

export function resetUserPassword(id: string, password: string): Promise<UserDetail> {
  const dto = adminResetPasswordRequestSchema.parse({ password });
  return apiJson(`/security/users/${id}/reset-password`, userDetailSchema, { method: "POST", body: dto });
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export function fetchRoles(): Promise<RoleSummary[]> {
  return apiJson("/security/roles", z.array(roleSummarySchema));
}

export function fetchRole(id: string): Promise<RoleDetail> {
  return apiJson(`/security/roles/${id}`, roleDetailSchema);
}

export function createRole(dto: CreateRoleRequest): Promise<RoleDetail> {
  createRoleRequestSchema.parse(dto);
  return apiJson("/security/roles", roleDetailSchema, { method: "POST", body: dto });
}

export function updateRole(id: string, dto: UpdateRoleRequest): Promise<RoleDetail> {
  updateRoleRequestSchema.parse(dto);
  return apiJson(`/security/roles/${id}`, roleDetailSchema, { method: "PATCH", body: dto });
}

export function deleteRole(id: string): Promise<void> {
  return apiVoid(`/security/roles/${id}`, { method: "DELETE" });
}

// ─── Catálogo de permisos ──────────────────────────────────────────────────

/** Definición de permiso tal como la sirve el backend (catálogo, fuente de verdad). */
const permissionDefSchema = z.object({
  key: z.string(),
  dimension: z.enum(["MODULE", "ACTION", "WORKFLOW"]),
  group: z.string(),
  description: z.string(),
}) satisfies z.ZodType<PermissionDef>;

export function fetchPermissionCatalog(): Promise<PermissionDef[]> {
  return apiJson("/security/permissions", z.array(permissionDefSchema));
}

// ─── Política de seguridad ─────────────────────────────────────────────────

export function fetchPasswordPolicy(): Promise<PasswordPolicy> {
  return apiJson("/security/password-policy", passwordPolicySchema);
}

export function updatePasswordPolicy(dto: UpdatePasswordPolicyRequest): Promise<PasswordPolicy> {
  updatePasswordPolicyRequestSchema.parse(dto);
  return apiJson("/security/password-policy", passwordPolicySchema, { method: "PUT", body: dto });
}

// ─── Auditoría ───────────────────────────────────────────────────────────────

export function fetchAudit(
  params: { take?: number; cursor?: string } & AuditFilters = {},
): Promise<AuditLogEntry[]> {
  const q = new URLSearchParams();
  if (params.take != null) q.set("take", String(params.take));
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.action) q.set("action", params.action);
  if (params.actor) q.set("actor", params.actor);
  if (params.entityType) q.set("entityType", params.entityType);
  const qs = q.toString();
  return apiJson(`/security/audit${qs ? `?${qs}` : ""}`, z.array(auditLogEntrySchema));
}

/** Exporta la auditoría filtrada a CSV (set completo, lo arma el backend). */
export function exportAuditCsv(filters: AuditFilters = {}): Promise<Blob> {
  const q = new URLSearchParams();
  if (filters.from) q.set("from", filters.from);
  if (filters.to) q.set("to", filters.to);
  if (filters.action) q.set("action", filters.action);
  if (filters.actor) q.set("actor", filters.actor);
  if (filters.entityType) q.set("entityType", filters.entityType);
  const qs = q.toString();
  return apiBlob(`/security/audit/export${qs ? `?${qs}` : ""}`);
}
