import { z } from "zod";

/**
 * Vistas guardadas — Fase 2.8.1b. Entidad de PLATAFORMA reusable por cualquier
 * módulo de listado (Bitácoras hoy; Incidencias en Fase 4) vía el discriminador
 * `module`. Es DATO PERSONAL del usuario: la API autoriza por OWNERSHIP, no por
 * permiso del catálogo RBAC. El `config` es un snapshot de PRESENTACIÓN
 * (filtros + búsqueda + orden + columnas + densidad) validado aquí, fuente única
 * back↔front. Las vistas de SISTEMA viven en código (abajo), no en BD.
 */

/** Módulos de listado que soportan vistas guardadas (discriminador `module`). */
export const SAVED_VIEW_MODULES = ["LOGBOOK"] as const;
export const savedViewModuleSchema = z.enum(SAVED_VIEW_MODULES);
export type SavedViewModule = z.infer<typeof savedViewModuleSchema>;

/** Densidad de la grilla (área táctil de terreno vs. más filas a la vista). */
export const SAVED_VIEW_DENSITIES = ["comfortable", "compact"] as const;
export const savedViewDensitySchema = z.enum(SAVED_VIEW_DENSITIES);
export type SavedViewDensity = z.infer<typeof savedViewDensitySchema>;

/**
 * Una clave de orden del config. `field` se valida como string libre (cada módulo
 * define su whitelist; el backend del listado re-valida contra su enum al aplicar).
 * El multi-sort efectivo se acota a columnas INDEXADAS en el servidor del módulo.
 */
export const savedViewSortKeySchema = z.object({
  field: z.string().min(1).max(64),
  dir: z.enum(["asc", "desc"]),
});
export type SavedViewSortKey = z.infer<typeof savedViewSortKeySchema>;

/**
 * Estado de columnas de la grilla (gestor de columnas). Las claves son keys de
 * columna del módulo. `order` define el orden de presentación; `hidden` las
 * ocultas; `pinnedLeft`/`pinnedRight` las ancladas; `widths` los anchos en px.
 */
export const savedViewColumnsSchema = z.object({
  order: z.array(z.string().max(64)).max(64).default([]),
  hidden: z.array(z.string().max(64)).max(64).default([]),
  pinnedLeft: z.array(z.string().max(64)).max(16).default([]),
  pinnedRight: z.array(z.string().max(64)).max(16).default([]),
  widths: z.record(z.string().max(64), z.number().int().min(40).max(1200)).default({}),
});
export type SavedViewColumns = z.infer<typeof savedViewColumnsSchema>;

/**
 * Filtros del módulo, snapshot tolerante: registro acotado de primitivos / arreglos
 * de strings. NO se tipa rígido aquí porque (a) varía por módulo y (b) al APLICAR la
 * vista, el cliente reconstruye la query del listado, que el backend SÍ valida con su
 * propio esquema. Tope de claves para evitar payloads abusivos.
 */
const filterValueSchema = z.union([
  z.string().max(200),
  z.number(),
  z.boolean(),
  z.array(z.string().max(200)).max(100),
]);
export const savedViewFiltersSchema = z.record(z.string().max(64), filterValueSchema);
export type SavedViewFilters = z.infer<typeof savedViewFiltersSchema>;

/** Snapshot de presentación completo de una vista. */
export const savedViewConfigSchema = z.object({
  filters: savedViewFiltersSchema.default({}),
  sort: z.array(savedViewSortKeySchema).max(3).default([]),
  columns: savedViewColumnsSchema.default({}),
  density: savedViewDensitySchema.default("comfortable"),
});
export type SavedViewConfig = z.infer<typeof savedViewConfigSchema>;

/** Una vista guardada tal como la devuelve la API. */
export const savedViewSchema = z.object({
  id: z.string(),
  module: savedViewModuleSchema,
  name: z.string(),
  config: savedViewConfigSchema,
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedViewDto = z.infer<typeof savedViewSchema>;

export const savedViewNameSchema = z.string().trim().min(1).max(60);

/** Crear una vista. `module` fija el ámbito; `isDefault` opcional (la vuelve la default). */
export const createSavedViewRequestSchema = z.object({
  module: savedViewModuleSchema,
  name: savedViewNameSchema,
  config: savedViewConfigSchema,
  isDefault: z.boolean().optional(),
});
export type CreateSavedViewRequest = z.infer<typeof createSavedViewRequestSchema>;

/** Actualizar una vista (nombre / config / default). Todo opcional (PATCH). */
export const updateSavedViewRequestSchema = z
  .object({
    name: savedViewNameSchema.optional(),
    config: savedViewConfigSchema.optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.config !== undefined || v.isDefault !== undefined, {
    message: "Nada que actualizar",
  });
export type UpdateSavedViewRequest = z.infer<typeof updateSavedViewRequestSchema>;

export const savedViewListResponseSchema = z.object({
  views: z.array(savedViewSchema),
});
export type SavedViewListResponse = z.infer<typeof savedViewListResponseSchema>;

// --- Vistas de SISTEMA (en CÓDIGO, no en BD) ---------------------------------
// Presets inmutables que produce un grid-state conocido. El selector las muestra
// en un grupo aparte (solo lectura); "Guardar como…" las bifurca a una personal.
// "Mi turno" se DIFIERE a 2.8.1c (requiere resolver el turno/persona actual vía
// ShiftResolver — es motor, no un filtro estático).

/** Una vista de sistema: id estable + clave i18n + filtros que aplica. */
export interface SystemView {
  /** Identificador estable (no colisiona con cuids de vistas de BD). */
  id: string;
  /** Clave i18n del nombre visible. */
  labelKey: string;
  /** Filtros que aplica (subset de los del módulo). El resto cae a default. */
  filters: SavedViewFilters;
}

/** Vistas de sistema del módulo de Bitácoras (2.8.1b). */
export const LOGBOOK_SYSTEM_VIEWS: readonly SystemView[] = [
  // Firmas pendientes: registros con ≥1 sección que exige firma y no la tiene.
  { id: "sys:pending-signatures", labelKey: "logbook.views.system.pendingSignatures", filters: { pendingSignature: true } },
  // Excepciones: cualquier banda de umbral fuera de rango (WARN/CRIT).
  { id: "sys:exceptions", labelKey: "logbook.views.system.exceptions", filters: { thresholdBand: "ANY" } },
  // Últimas 24h: el preset de fecha efectiva lo resuelve la UI al aplicar (marca dinámica).
  { id: "sys:last-24h", labelKey: "logbook.views.system.last24h", filters: { __preset: "effective24h" } },
] as const;

/** ¿El id corresponde a una vista de sistema (no de BD)? */
export function isSystemViewId(id: string): boolean {
  return id.startsWith("sys:");
}
