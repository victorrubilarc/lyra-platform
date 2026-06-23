import {
  createOrgLevelRequestSchema,
  createOrgNodeRequestSchema,
  createOrgStructureRequestSchema,
  orgLevelSchema,
  orgNodeSchema,
  orgNodeTreeSchema,
  orgStructureSchema,
  updateOrgLevelRequestSchema,
  updateOrgNodeRequestSchema,
  updateOrgStructureRequestSchema,
  type CreateOrgLevelRequest,
  type CreateOrgNodeRequest,
  type CreateOrgStructureRequest,
  type OrgLevel,
  type OrgNode,
  type OrgNodeTree,
  type OrgStructure,
  type UpdateOrgLevelRequest,
  type UpdateOrgNodeRequest,
  type UpdateOrgStructureRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

/** Construye `?structureId=` solo cuando hay una estructura activa seleccionada. */
function structureQuery(structureId?: string | null): string {
  return structureId ? `?structureId=${encodeURIComponent(structureId)}` : "";
}

// ─── Estructuras ─────────────────────────────────────────────────────────────

/** Estructuras organizacionales que el usuario alcanza (ABAC en el backend). */
export function fetchStructures(): Promise<OrgStructure[]> {
  return apiJson("/structure/structures", z.array(orgStructureSchema));
}

export function createStructure(dto: CreateOrgStructureRequest): Promise<OrgStructure> {
  createOrgStructureRequestSchema.parse(dto);
  return apiJson("/structure/structures", orgStructureSchema, { method: "POST", body: dto });
}

export function updateStructure(id: string, dto: UpdateOrgStructureRequest): Promise<OrgStructure> {
  updateOrgStructureRequestSchema.parse(dto);
  return apiJson(`/structure/structures/${id}`, orgStructureSchema, { method: "PATCH", body: dto });
}

export function deleteStructure(id: string): Promise<void> {
  return apiVoid(`/structure/structures/${id}`, { method: "DELETE" });
}

// ─── Niveles ───────────────────────────────────────────────────────────────

/** Niveles configurables de una estructura (la activa, o la por defecto si null). */
export function fetchLevels(structureId?: string | null): Promise<OrgLevel[]> {
  return apiJson(`/structure/levels${structureQuery(structureId)}`, z.array(orgLevelSchema));
}

export function createLevel(dto: CreateOrgLevelRequest): Promise<OrgLevel> {
  createOrgLevelRequestSchema.parse(dto);
  return apiJson("/structure/levels", orgLevelSchema, { method: "POST", body: dto });
}

export function updateLevel(id: string, dto: UpdateOrgLevelRequest): Promise<OrgLevel> {
  updateOrgLevelRequestSchema.parse(dto);
  return apiJson(`/structure/levels/${id}`, orgLevelSchema, { method: "PATCH", body: dto });
}

export function deleteLevel(id: string): Promise<void> {
  return apiVoid(`/structure/levels/${id}`, { method: "DELETE" });
}

/** Árbol completo de nodos vivos de una estructura (ya anidado por el backend). */
export function fetchTree(structureId?: string | null): Promise<OrgNodeTree[]> {
  return apiJson(`/structure/nodes${structureQuery(structureId)}`, z.array(orgNodeTreeSchema));
}

/**
 * Árbol de nodos ACOTADO al alcance del usuario (ABAC en el backend). Es el que
 * deben usar los SELECTORES de flujo operacional (crear incidencia/bitácora…),
 * no el mantenedor de estructura (que usa `fetchTree`, sin acotar).
 */
export function fetchAccessibleTree(structureId?: string | null): Promise<OrgNodeTree[]> {
  return apiJson(`/structure/accessible-nodes${structureQuery(structureId)}`, z.array(orgNodeTreeSchema));
}

export function createNode(dto: CreateOrgNodeRequest): Promise<OrgNode> {
  createOrgNodeRequestSchema.parse(dto);
  return apiJson("/structure/nodes", orgNodeSchema, { method: "POST", body: dto });
}

export function updateNode(id: string, dto: UpdateOrgNodeRequest): Promise<OrgNode> {
  updateOrgNodeRequestSchema.parse(dto);
  return apiJson(`/structure/nodes/${id}`, orgNodeSchema, { method: "PATCH", body: dto });
}

export function deleteNode(id: string): Promise<void> {
  return apiVoid(`/structure/nodes/${id}`, { method: "DELETE" });
}
