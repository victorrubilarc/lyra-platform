import { z } from "zod";

/**
 * Estructura organizacional: niveles configurables (OrgLevel) y nodos
 * jerárquicos auto-referenciales (OrgNode). La jerarquía es opcional y la
 * nombran los propios clientes (Área / Proceso / Equipo, o lo que apliquen).
 */

// --- Niveles ---

export const orgLevelSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Profundidad en la jerarquía (0 = nivel raíz). */
  order: z.number().int().nonnegative(),
});
export type OrgLevel = z.infer<typeof orgLevelSchema>;

export const createOrgLevelRequestSchema = z.object({
  name: z.string().trim().min(1).max(60),
  order: z.number().int().nonnegative(),
});
export type CreateOrgLevelRequest = z.infer<typeof createOrgLevelRequestSchema>;

export const updateOrgLevelRequestSchema = createOrgLevelRequestSchema.partial();
export type UpdateOrgLevelRequest = z.infer<typeof updateOrgLevelRequestSchema>;

// --- Nodos ---

export const orgNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Código interno corto, p. ej. "REMA", "AIR1". */
  code: z.string().nullable(),
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
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).optional(),
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
  externalCode: z.string().trim().max(80).nullable().optional(),
  /** Reparentar el nodo; `null` lo convierte en raíz. */
  parentId: z.string().nullable().optional(),
  levelId: z.string().min(1).optional(),
});
export type UpdateOrgNodeRequest = z.infer<typeof updateOrgNodeRequestSchema>;
