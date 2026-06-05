/**
 * Catálogo de permisos atómicos — fuente de verdad compartida (UI + backend).
 *
 * IMPORTANTE: las CLAVES de permiso viven aquí en código porque los guards las
 * referencian y el seed las inserta en la BD. Lo que NUNCA se hardcodea es la
 * asignación rol→permiso y rol→usuario: eso es 100% dato en la base, editable
 * desde la UI. Este archivo solo declara qué permisos EXISTEN, no quién los tiene.
 *
 * Dimensiones de autorización (ver docs/SECURITY.md):
 *  1. MODULE   — acceso a pantallas/módulos.
 *  2. ACTION   — acciones/funcionalidades concretas.
 *  3. WORKFLOW — transiciones de flujo (incidencias, turnos).
 *  4. (datos)  — NO es un permiso: se modela con `Scope` (ABAC) y lo resuelve
 *               el ScopeService en el backend. No aparece en este catálogo.
 */

/** Dimensiones de permiso cubiertas por el catálogo (1–3). */
export const PERMISSION_DIMENSIONS = ["MODULE", "ACTION", "WORKFLOW"] as const;
export type PermissionDimension = (typeof PERMISSION_DIMENSIONS)[number];

/** Definición de un permiso atómico del catálogo. */
export interface PermissionDef {
  /** Clave única y estable (ej. `entry:create`). Convención `recurso:accion`. */
  readonly key: string;
  /** Dimensión a la que pertenece. */
  readonly dimension: PermissionDimension;
  /** Grupo para agrupar en la UI de administración (ej. `security`). */
  readonly group: string;
  /** Descripción legible para la pantalla de roles. */
  readonly description: string;
}

/**
 * Catálogo inicial (Fase 1). Crece por fase: las plantillas/bitácoras (Fase 2),
 * orígenes (Fase 3), incidencias y turnos (Fase 4–5) añaden sus claves aquí.
 */
export const PERMISSION_CATALOG = [
  // --- Dimensión 1: módulos / pantallas ---
  {
    key: "module:security:view",
    dimension: "MODULE",
    group: "security",
    description: "Ver el módulo de seguridad (usuarios, roles, permisos).",
  },
  {
    key: "module:security:manage",
    dimension: "MODULE",
    group: "security",
    description: "Administrar el módulo de seguridad.",
  },
  {
    key: "module:structure:view",
    dimension: "MODULE",
    group: "structure",
    description: "Ver la estructura organizacional.",
  },
  {
    key: "module:structure:manage",
    dimension: "MODULE",
    group: "structure",
    description: "Administrar la estructura organizacional.",
  },

  // --- Dimensión 2: acciones — usuarios ---
  {
    key: "user:read",
    dimension: "ACTION",
    group: "users",
    description: "Listar y ver usuarios.",
  },
  {
    key: "user:create",
    dimension: "ACTION",
    group: "users",
    description: "Crear usuarios.",
  },
  {
    key: "user:edit",
    dimension: "ACTION",
    group: "users",
    description: "Editar datos de usuarios.",
  },
  {
    key: "user:disable",
    dimension: "ACTION",
    group: "users",
    description: "Habilitar o deshabilitar usuarios.",
  },
  {
    key: "user:assign-roles",
    dimension: "ACTION",
    group: "users",
    description: "Asignar o quitar roles a un usuario.",
  },
  {
    key: "user:assign-scope",
    dimension: "ACTION",
    group: "users",
    description: "Definir el alcance de datos (nodos) de un usuario.",
  },

  // --- Dimensión 2: acciones — roles y permisos ---
  {
    key: "role:read",
    dimension: "ACTION",
    group: "roles",
    description: "Listar y ver roles.",
  },
  {
    key: "role:manage",
    dimension: "ACTION",
    group: "roles",
    description: "Crear, editar y eliminar roles y sus permisos.",
  },

  // --- Dimensión 2: acciones — política de seguridad ---
  {
    key: "security:policy:manage",
    dimension: "ACTION",
    group: "security",
    description: "Editar la política de contraseñas y parámetros de seguridad.",
  },
  {
    key: "audit:read",
    dimension: "ACTION",
    group: "security",
    description: "Consultar la bitácora de auditoría.",
  },

  // --- Dimensión 2: acciones — estructura organizacional ---
  {
    key: "orglevel:manage",
    dimension: "ACTION",
    group: "structure",
    description: "Configurar los niveles de la estructura (Área, Proceso, Equipo…).",
  },
  {
    key: "orgnode:read",
    dimension: "ACTION",
    group: "structure",
    description: "Listar y ver nodos de la estructura.",
  },
  {
    key: "orgnode:create",
    dimension: "ACTION",
    group: "structure",
    description: "Crear nodos de la estructura.",
  },
  {
    key: "orgnode:edit",
    dimension: "ACTION",
    group: "structure",
    description: "Editar nodos de la estructura.",
  },
  {
    key: "orgnode:delete",
    dimension: "ACTION",
    group: "structure",
    description: "Eliminar (borrado lógico) nodos de la estructura.",
  },
] as const satisfies readonly PermissionDef[];

/** Unión literal de todas las claves de permiso conocidas. */
export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

/** Todas las claves del catálogo, como arreglo plano. */
export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map(
  (p) => p.key as PermissionKey,
);

/** Conjunto para chequeos O(1) de existencia de una clave. */
const PERMISSION_KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);

/** ¿La cadena dada es una clave de permiso válida del catálogo? */
export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}
