import { z } from "zod";

/**
 * Estructura organizacional: niveles configurables (OrgLevel) y nodos
 * jerárquicos auto-referenciales (OrgNode). La jerarquía es opcional y la
 * nombran los propios clientes (Área / Proceso / Equipo, o lo que apliquen).
 *
 * Multi-estructura (2026-06-23): una instalación puede definir VARIAS estructuras
 * (OrgStructure) en paralelo, cada una con su propio set de niveles y su propio
 * árbol. Niveles, nodos y calendarios son por-estructura; los CATÁLOGOS (plantillas,
 * flujos, tipos de incidencia, listas de referencia) siguen siendo COMPARTIDOS.
 */

// --- Estructuras ---

export const orgStructureSchema = z.object({
  id: z.string(),
  /** Clave estable (slug) para seed/referencias. */
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** La estructura por defecto absorbe lo legado y no se puede borrar. */
  isDefault: z.boolean(),
  active: z.boolean(),
  /** Orden de presentación en selectores (asc). */
  reportOrder: z.number().int(),
  createdAt: z.string(),
  /** Nº de nodos vivos (para distinguir estructuras CONFIGURADAS de vacías). */
  nodeCount: z.number().int().optional(),
});
export type OrgStructure = z.infer<typeof orgStructureSchema>;

export const createOrgStructureRequestSchema = z.object({
  /** Slug minúsculas/números/guiones; único. */
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Solo minúsculas, números y guiones"),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  reportOrder: z.number().int().min(0).max(100000).optional(),
});
export type CreateOrgStructureRequest = z.infer<typeof createOrgStructureRequestSchema>;

export const updateOrgStructureRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
  reportOrder: z.number().int().min(0).max(100000).optional(),
});
export type UpdateOrgStructureRequest = z.infer<typeof updateOrgStructureRequestSchema>;

// --- Niveles ---

export const orgLevelSchema = z.object({
  id: z.string(),
  /** Estructura dueña del nivel. */
  structureId: z.string(),
  name: z.string(),
  /** Profundidad en la jerarquía (0 = nivel raíz). Único POR ESTRUCTURA. */
  order: z.number().int().nonnegative(),
});
export type OrgLevel = z.infer<typeof orgLevelSchema>;

export const createOrgLevelRequestSchema = z.object({
  /** Estructura dueña; si se omite, la estructura por defecto. */
  structureId: z.string().optional(),
  name: z.string().trim().min(1).max(60),
  order: z.number().int().nonnegative(),
});
export type CreateOrgLevelRequest = z.infer<typeof createOrgLevelRequestSchema>;

// El nivel no se puede mover de estructura: update no toca structureId.
export const updateOrgLevelRequestSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  order: z.number().int().nonnegative().optional(),
});
export type UpdateOrgLevelRequest = z.infer<typeof updateOrgLevelRequestSchema>;

// --- Nodos ---

export const orgNodeSchema = z.object({
  id: z.string(),
  /** Estructura dueña del nodo (denormalizada; == la del padre). */
  structureId: z.string(),
  name: z.string(),
  /** Código interno corto, p. ej. "REMA", "AIR1". */
  code: z.string().nullable(),
  /** Descripción de uso o propósito del nodo. */
  description: z.string().nullable(),
  /** Orden del nodo en informes, relativo a sus hermanos (asc). */
  reportOrder: z.number().int(),
  /** Código en sistemas externos (ERP, CMMS, SCADA). Clave de integración. */
  externalCode: z.string().nullable(),
  parentId: z.string().nullable(),
  levelId: z.string(),
  /** Ruta materializada de ancestros (`/<id>/<id>/`) para consultar descendientes. */
  path: z.string(),
  createdAt: z.string(),
});
export type OrgNode = z.infer<typeof orgNodeSchema>;

/** Nodo con sus hijos anidados (para pintar el árbol completo). */
export type OrgNodeTree = OrgNode & { children: OrgNodeTree[] };
export const orgNodeTreeSchema: z.ZodType<OrgNodeTree> = orgNodeSchema.extend({
  children: z.lazy(() => z.array(orgNodeTreeSchema)),
});

export const createOrgNodeRequestSchema = z.object({
  /**
   * Estructura dueña. Solo se usa para nodos RAÍZ (sin parentId); los nodos con
   * padre HEREDAN la estructura del padre (el servidor ignora este campo). Si se
   * omite en una raíz, cae a la estructura por defecto.
   */
  structureId: z.string().optional(),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).optional(),
  /** Descripción de uso o propósito del nodo. */
  description: z.string().trim().max(500).optional(),
  /** Orden del nodo en informes, relativo a sus hermanos (asc). */
  reportOrder: z.number().int().min(0).max(100000).optional(),
  /** Código de identificación en sistemas externos (ERP, CMMS, SCADA). */
  externalCode: z.string().trim().max(80).optional(),
  /** Padre en la jerarquía; `null`/ausente = nodo raíz. */
  parentId: z.string().nullable().optional(),
  levelId: z.string().min(1),
});
export type CreateOrgNodeRequest = z.infer<typeof createOrgNodeRequestSchema>;

export const updateOrgNodeRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().max(40).nullable().optional(),
  /** Descripción de uso o propósito del nodo; `null` la borra. */
  description: z.string().trim().max(500).nullable().optional(),
  /** Orden del nodo en informes, relativo a sus hermanos (asc). */
  reportOrder: z.number().int().min(0).max(100000).optional(),
  externalCode: z.string().trim().max(80).nullable().optional(),
  /** Reparentar el nodo; `null` lo convierte en raíz. */
  parentId: z.string().nullable().optional(),
  levelId: z.string().min(1).optional(),
});
export type UpdateOrgNodeRequest = z.infer<typeof updateOrgNodeRequestSchema>;
