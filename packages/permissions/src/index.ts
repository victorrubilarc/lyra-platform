/**
 * @lyra/permissions — cliente de permisos del ecosistema Lyra.
 *
 * Helpers framework-agnósticos (TS puro, sin React) para evaluar en la UI los
 * permisos efectivos que el backend entrega en `SessionInfo.permissions`.
 *
 * REGLA DE ORO (ver docs/SECURITY.md): la autorización SIEMPRE la decide el
 * backend. Estos helpers solo sirven para OCULTAR o DESHABILITAR controles en
 * la interfaz; nunca son la fuente de verdad. Aunque alguien fuerce un `true`
 * aquí, el guard del servidor sigue rechazando la operación.
 */

import type { PermissionKey } from "@lyra/contracts";

/** Una clave del catálogo, o cualquier string (el backend manda strings). */
export type Permission = PermissionKey | (string & {});

/** Conjunto de permisos concedidos (lo que llega en `SessionInfo.permissions`). */
export type GrantedPermissions = Iterable<string>;

/**
 * Evaluador de permisos con búsquedas O(1). Constrúyelo una vez por sesión
 * (la capa de React lo memoiza) y reúsalo en toda la UI.
 */
export interface PermissionChecker {
  /** ¿Tiene el permiso exacto? */
  can(permission: Permission): boolean;
  /** ¿Tiene TODOS los permisos dados? (lista vacía ⇒ `true`). */
  canAll(permissions: readonly Permission[]): boolean;
  /** ¿Tiene AL MENOS UNO? (lista vacía ⇒ `false`). */
  canAny(permissions: readonly Permission[]): boolean;
  /** Copia inmutable de las claves concedidas (para depurar/inspeccionar). */
  readonly granted: ReadonlySet<string>;
}

/** Normaliza la entrada a un `Set` para chequeos O(1). */
function toSet(granted: GrantedPermissions): ReadonlySet<string> {
  return granted instanceof Set ? granted : new Set(granted);
}

/** ¿El conjunto concede el permiso? Función pura, sin estado. */
export function can(granted: GrantedPermissions, permission: Permission): boolean {
  return toSet(granted).has(permission);
}

/** ¿Concede TODOS? Lista vacía ⇒ `true` (no exige nada). */
export function canAll(granted: GrantedPermissions, permissions: readonly Permission[]): boolean {
  const set = toSet(granted);
  return permissions.every((p) => set.has(p));
}

/** ¿Concede ALGUNO? Lista vacía ⇒ `false` (no hay forma de satisfacerlo). */
export function canAny(granted: GrantedPermissions, permissions: readonly Permission[]): boolean {
  const set = toSet(granted);
  return permissions.some((p) => set.has(p));
}

/**
 * Crea un `PermissionChecker` a partir de los permisos concedidos.
 * La normalización a `Set` ocurre una sola vez.
 */
export function createPermissionChecker(granted: GrantedPermissions): PermissionChecker {
  const set = toSet(granted);
  return {
    can: (permission) => set.has(permission),
    canAll: (permissions) => permissions.every((p) => set.has(p)),
    canAny: (permissions) => permissions.some((p) => set.has(p)),
    granted: set,
  };
}
