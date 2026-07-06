import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  AssignAdminStructuresRequest,
  AssignRolesRequest,
  AssignScopeRequest,
  AssignTemplateScopeRequest,
  AuditFilters,
  CreateRoleRequest,
  CreateUserRequest,
  UpdatePasswordPolicyRequest,
  UpdateRoleRequest,
  UpdateUserRequest,
} from "@lyra/contracts";
import {
  assignRoleAdminStructures,
  assignRoleScope,
  assignRoleTemplateScope,
  assignUserAdminStructures,
  assignUserRoles,
  assignUserScope,
  assignUserTemplateScope,
  createRole,
  createUser,
  deleteRole,
  fetchAudit,
  fetchPasswordPolicy,
  fetchPermissionCatalog,
  fetchRole,
  fetchRoles,
  fetchTemplateScopeOptions,
  fetchUser,
  fetchUsers,
  resetUserMfa,
  resetUserPassword,
  updatePasswordPolicy,
  updateRole,
  updateUser,
} from "./security-api.js";
import { LICENSE_KEYS } from "../../auth/use-license.js";

export const SECURITY_KEYS = {
  users: ["security", "users"] as const,
  user: (id: string) => ["security", "users", id] as const,
  roles: ["security", "roles"] as const,
  role: (id: string) => ["security", "roles", id] as const,
  permissions: ["security", "permissions"] as const,
  policy: ["security", "policy"] as const,
  audit: ["security", "audit"] as const,
  templateScopeOptions: ["security", "template-scope-options"] as const,
};

const AUDIT_PAGE_SIZE = 50;

// ─── Usuarios ────────────────────────────────────────────────────────────────

export function useUsers() {
  return useQuery({ queryKey: SECURITY_KEYS.users, queryFn: fetchUsers });
}

export function useUser(id: string | null) {
  return useQuery({
    queryKey: SECURITY_KEYS.user(id ?? ""),
    queryFn: () => fetchUser(id as string),
    enabled: id != null,
  });
}

/** Invalida tanto el detalle del usuario como el listado (roles/MFA cambian el resumen). */
function invalidateUser(qc: ReturnType<typeof useQueryClient>, id: string) {
  void qc.invalidateQueries({ queryKey: SECURITY_KEYS.user(id) });
  void qc.invalidateQueries({ queryKey: SECURITY_KEYS.users });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUserRequest) => createUser(dto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.users });
      // El usuario nuevo consume cupo de la licencia (L2b) ⇒ refresca el hint.
      void qc.invalidateQueries({ queryKey: LICENSE_KEYS.status });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateUserRequest }) => updateUser(id, dto),
    onSuccess: (u) => {
      invalidateUser(qc, u.id);
      // Habilitar/deshabilitar mueve el conteo de usuarios ACTIVOS (cupo L2b).
      void qc.invalidateQueries({ queryKey: LICENSE_KEYS.status });
    },
  });
}

export function useAssignUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignRolesRequest }) => assignUserRoles(id, dto),
    onSuccess: (u) => {
      invalidateUser(qc, u.id);
      // El conteo de usuarios por rol cambia.
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.roles });
    },
  });
}

export function useAssignUserScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignScopeRequest }) => assignUserScope(id, dto),
    onSuccess: (u) => invalidateUser(qc, u.id),
  });
}

export function useAssignUserTemplateScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignTemplateScopeRequest }) =>
      assignUserTemplateScope(id, dto),
    onSuccess: (u) => invalidateUser(qc, u.id),
  });
}

export function useAssignUserAdminStructures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignAdminStructuresRequest }) =>
      assignUserAdminStructures(id, dto),
    onSuccess: (u) => {
      invalidateUser(qc, u.id);
      // La delegación cambia qué estructuras VE/administra el usuario en el selector.
      void qc.invalidateQueries({ queryKey: ["structure"] });
    },
  });
}

export function useResetUserMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resetUserMfa(id),
    onSuccess: (u) => invalidateUser(qc, u.id),
  });
}

export function useResetUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetUserPassword(id, password),
    onSuccess: (u) => invalidateUser(qc, u.id),
  });
}

// ─── Roles ───────────────────────────────────────────────────────────────────

export function useRoles() {
  return useQuery({ queryKey: SECURITY_KEYS.roles, queryFn: fetchRoles });
}

export function useRole(id: string | null) {
  return useQuery({
    queryKey: SECURITY_KEYS.role(id ?? ""),
    queryFn: () => fetchRole(id as string),
    enabled: id != null,
  });
}

export function usePermissionCatalog() {
  return useQuery({
    queryKey: SECURITY_KEYS.permissions,
    queryFn: fetchPermissionCatalog,
    staleTime: Infinity, // El catálogo es estable durante la sesión.
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateRoleRequest) => createRole(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: SECURITY_KEYS.roles }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateRoleRequest }) => updateRole(id, dto),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.role(r.id) });
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.roles });
    },
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRole(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SECURITY_KEYS.roles }),
  });
}

export function useAssignRoleScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignScopeRequest }) => assignRoleScope(id, dto),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.role(r.id) });
      // El alcance por rol cambia el alcance efectivo de sus usuarios.
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.users });
    },
  });
}

export function useAssignRoleTemplateScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignTemplateScopeRequest }) =>
      assignRoleTemplateScope(id, dto),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.role(r.id) });
      // El alcance por rol cambia el alcance efectivo de sus usuarios.
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.users });
    },
  });
}

export function useAssignRoleAdminStructures() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignAdminStructuresRequest }) =>
      assignRoleAdminStructures(id, dto),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.role(r.id) });
      // La delegación del rol cambia qué estructuras administran sus miembros.
      void qc.invalidateQueries({ queryKey: SECURITY_KEYS.users });
      void qc.invalidateQueries({ queryKey: ["structure"] });
    },
  });
}

// ─── Alcance por plantilla (opciones) ───────────────────────────────────────

export function useTemplateScopeOptions(enabled = true) {
  return useQuery({
    queryKey: SECURITY_KEYS.templateScopeOptions,
    queryFn: fetchTemplateScopeOptions,
    enabled,
    staleTime: 60_000,
  });
}

// ─── Política ──────────────────────────────────────────────────────────────

export function usePasswordPolicy() {
  return useQuery({ queryKey: SECURITY_KEYS.policy, queryFn: fetchPasswordPolicy });
}

export function useUpdatePasswordPolicy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdatePasswordPolicyRequest) => updatePasswordPolicy(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: SECURITY_KEYS.policy }),
  });
}

// ─── Auditoría (paginación por cursor) ───────────────────────────────────────

export function useAudit(filters: AuditFilters = {}) {
  return useInfiniteQuery({
    queryKey: [...SECURITY_KEYS.audit, filters],
    queryFn: ({ pageParam }) =>
      fetchAudit({ take: AUDIT_PAGE_SIZE, cursor: pageParam ?? undefined, ...filters }),
    initialPageParam: undefined as string | undefined,
    // Si la última página vino llena, hay más; el cursor es el id del último registro.
    getNextPageParam: (lastPage) =>
      lastPage.length === AUDIT_PAGE_SIZE ? lastPage[lastPage.length - 1]?.id : undefined,
  });
}
