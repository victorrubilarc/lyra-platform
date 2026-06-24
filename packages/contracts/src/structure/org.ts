import { z } from "zod";
import { structureAccentSchema, structureIconSchema } from "./identity.js";

export * from "./identity.js";

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
  /**
   * Identidad visual (L3): acento de color y nombre de ícono Lucide propios. `null`
   * = sin configurar ⇒ el front los DERIVA determinísticamente de la `key` (ver
   * `resolveStructureAccent`/`resolveStructureIcon`). Se guardan como texto y se
   * validan contra la paleta/lista-blanca al escribir.
   */
  color: z.string().nullable(),
  icon: z.string().nullable(),
  createdAt: z.string(),
  /** Nº de nodos vivos (para distinguir estructuras CONFIGURADAS de vacías). */
  nodeCount: z.number().int().optional(),
  /**
   * Administración delegada (L2b): ¿el usuario que pide la lista puede ADMINISTRAR
   * esta estructura (super-admin, o delegado de ella)? Lo decide el backend; la UI lo
   * usa para habilitar/ocultar los botones de gestión por fila. `undefined` cuando la
   * lista no se pidió en contexto de un usuario (la verdad de permisos es del backend).
   */
  canAdminister: z.boolean().optional(),
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
  /** Acento de la paleta curada; si se omite, se deriva de la `key`. */
  color: structureAccentSchema.nullable().optional(),
  /** Ícono de la lista blanca Lucide; si se omite, se usa el por defecto. */
  icon: structureIconSchema.nullable().optional(),
});
export type CreateOrgStructureRequest = z.infer<typeof createOrgStructureRequestSchema>;

export const updateOrgStructureRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
  reportOrder: z.number().int().min(0).max(100000).optional(),
  /** Acento de la paleta curada; `null` vuelve a derivarlo de la `key`. */
  color: structureAccentSchema.nullable().optional(),
  /** Ícono de la lista blanca Lucide; `null` vuelve al por defecto. */
  icon: structureIconSchema.nullable().optional(),
});
export type UpdateOrgStructureRequest = z.infer<typeof updateOrgStructureRequestSchema>;

/**
 * Reordena las estructuras en bloque: lista ORDENADA de ids → `reportOrder` 0..n-1.
 * Atómico (una sola transacción) para que el orden del selector quede consistente sin
 * editar cada estructura una por una. Solo se tocan las estructuras presentes en la lista.
 */
export const reorderOrgStructuresRequestSchema = z.object({
  /** Ids de estructura en el orden deseado (asc). El índice fija el `reportOrder`. */
  ids: z.array(z.string().min(1)).min(1).max(500),
});
export type ReorderOrgStructuresRequest = z.infer<typeof reorderOrgStructuresRequestSchema>;

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

// --- Aprovisionar un "área" completa (L3b · asistente) ---

/**
 * Aprovisiona una estructura organizacional COMPLETA y operativa en UNA sola
 * operación atómica (transacción): identidad + niveles base + primer nodo raíz.
 * Es lo que orquesta el asistente "crear área": evita estructuras huérfanas sin
 * nodos (no operables, ocultas del selector). El backend re-autoriza como
 * super-admin de estructura (igual que `createStructure`) y ejecuta las tres
 * inserciones en una sola transacción: o el área entera queda operable (≥1 nodo),
 * o no se crea nada.
 */
export const provisionOrgStructureRequestSchema = z.object({
  /** Identidad de la estructura (mismos campos que `createOrgStructureRequestSchema`). */
  key: z
    .string()
    .trim()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9][a-z0-9-]*$/, "Solo minúsculas, números y guiones"),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  color: structureAccentSchema.nullable().optional(),
  icon: structureIconSchema.nullable().optional(),
  /**
   * Niveles base, en orden de profundidad. El índice del arreglo fija el `order`
   * (0 = nivel raíz). Mínimo 1: la estructura necesita al menos un nivel para que
   * el nodo raíz cuelgue de él.
   */
  levels: z.array(z.string().trim().min(1).max(60)).min(1).max(12),
  /** Primer nodo raíz, creado en el nivel 0, para dejar la estructura operativa. */
  rootNode: z.object({
    name: z.string().trim().min(1).max(120),
    code: z.string().trim().max(40).optional(),
  }),
});
export type ProvisionOrgStructureRequest = z.infer<typeof provisionOrgStructureRequestSchema>;
