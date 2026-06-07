import {
  createOrgLevelRequestSchema,
  createOrgNodeRequestSchema,
  orgLevelSchema,
  orgNodeSchema,
  orgNodeTreeSchema,
  updateOrgLevelRequestSchema,
  updateOrgNodeRequestSchema,
  type CreateOrgLevelRequest,
  type CreateOrgNodeRequest,
  type OrgLevel,
  type OrgNode,
  type OrgNodeTree,
  type UpdateOrgLevelRequest,
  type UpdateOrgNodeRequest,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson, apiVoid } from "../../lib/api-client.js";

/** Niveles configurables de la estructura organizacional. */
export function fetchLevels(): Promise<OrgLevel[]> {
  return apiJson("/structure/levels", z.array(orgLevelSchema));
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

/** Árbol completo de nodos vivos (ya anidado por el backend). */
export function fetchTree(): Promise<OrgNodeTree[]> {
  return apiJson("/structure/nodes", z.array(orgNodeTreeSchema));
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
