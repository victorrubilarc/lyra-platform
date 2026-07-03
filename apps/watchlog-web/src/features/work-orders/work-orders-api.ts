import {
  workActivitySchema,
  workActivityUpdateSchema,
  workOrderChecklistRuleSchema,
  workOrderChecklistSchema,
  workOrderDetailSchema,
  workOrderListResponseSchema,
  workOrderStatsSchema,
  workOrderTypeSchema,
  workOrderTagSchema,
  workOrderRosterSchema,
  personSchema,
  contractorCompanySchema,
  rosterRoleSchema,
  competencyTypeSchema,
  personCompetencySchema,
  personRestrictionSchema,
  workOrderCompetencyRuleSchema,
  type CompetencyTypeDto,
  type PersonCompetencyDto,
  type PersonRestrictionDto,
  type UpsertCompetencyTypeRequest,
  type UpsertPersonCompetencyRequest,
  type UpsertPersonRestrictionRequest,
  type UpsertWorkOrderCompetencyRuleRequest,
  type WorkOrderCompetencyRuleDto,
  type AddWorkOrderChecklistRequest,
  type AddWorkOrderWorkerRequest,
  type ConfirmRosterRequest,
  type ContractorCompanyDto,
  type PersonDto,
  type RemoveWorkOrderWorkerRequest,
  type RosterRoleDto,
  type UpsertRosterRoleRequest,
  type UpsertContractorCompanyRequest,
  type UpsertPersonRequest,
  type WorkOrderRosterDto,
  type AssignWorkOrderRequest,
  type CancelWorkOrderRequest,
  type CreateWorkActivitiesBatchRequest,
  type CreateWorkActivityRequest,
  type CreateWorkOrderRequest,
  type RecordWorkActivityProgressRequest,
  type ReorderWorkActivitiesRequest,
  type ReviewWorkOrderChecklistRequest,
  type SpecialtyDto,
  type TransitionWorkOrderRequest,
  type UpdateWorkActivityRequest,
  type UpdateWorkOrderRequest,
  type UpsertSpecialtyRequest,
  type UpsertWorkOrderChecklistRuleRequest,
  type UpsertWorkOrderTypeRequest,
  type WorkActivityDto,
  type WorkActivityUpdateDto,
  type WorkOrderChecklistDto,
  type WorkOrderChecklistRuleDto,
  type WorkOrderDetail,
  type WorkOrderListQuery,
  type WorkOrderListResponse,
  type WorkOrderStats,
  type WorkOrderTypeDto,
} from "@lyra/contracts";
import { z } from "zod";
import { apiJson } from "../../lib/api-client.js";

function queryString(q: WorkOrderListQuery): string {
  const p = new URLSearchParams();
  if (q.search) p.set("search", q.search);
  if (q.lifecycle) p.set("lifecycle", q.lifecycle);
  if (q.typeId) p.set("typeId", q.typeId);
  if (q.criticality) p.set("criticality", String(q.criticality));
  if (q.priority) p.set("priority", q.priority);
  if (q.originType) p.set("originType", q.originType);
  if (q.orgNodeIds && q.orgNodeIds.length) p.set("orgNodeIds", q.orgNodeIds.join(","));
  if (q.equipmentId) p.set("equipmentId", q.equipmentId);
  if (q.ownerId) p.set("ownerId", q.ownerId);
  if (q.specialtyId) p.set("specialtyId", q.specialtyId);
  if (q.requiresPtw) p.set("requiresPtw", "true");
  if (q.mine) p.set("mine", "true");
  if (q.unassignedOnly) p.set("unassignedOnly", "true");
  if (q.sort) p.set("sort", q.sort);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Anexa `&structureId=` (aislamiento L1b) a un querystring ya armado. */
function withStructure(qs: string, structureId?: string | null): string {
  if (!structureId) return qs;
  return qs ? `${qs}&structureId=${encodeURIComponent(structureId)}` : `?structureId=${encodeURIComponent(structureId)}`;
}

export function fetchWorkOrders(q: WorkOrderListQuery, structureId?: string | null): Promise<WorkOrderListResponse> {
  return apiJson(`/work-orders${withStructure(queryString(q), structureId)}`, workOrderListResponseSchema);
}

export function fetchWorkOrderDetail(id: string): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}`, workOrderDetailSchema);
}

export function fetchWorkOrderStats(structureId?: string | null): Promise<WorkOrderStats> {
  return apiJson(`/work-orders/stats${withStructure("", structureId)}`, workOrderStatsSchema);
}

export function fetchWorkOrderTypes(includeInactive = false): Promise<WorkOrderTypeDto[]> {
  return apiJson(`/work-orders/types${includeInactive ? "?includeInactive=true" : ""}`, z.array(workOrderTypeSchema));
}

export function fetchWorkOrderSpecialties(includeInactive = false): Promise<SpecialtyDto[]> {
  return apiJson(`/work-orders/specialties${includeInactive ? "?includeInactive=true" : ""}`, z.array(workOrderTagSchema));
}

export function upsertWorkOrderType(dto: UpsertWorkOrderTypeRequest, create = false): Promise<WorkOrderTypeDto> {
  return apiJson(`/work-orders/types${create ? "?create=true" : ""}`, workOrderTypeSchema, { method: "POST", body: dto });
}

export function upsertWorkOrderSpecialty(dto: UpsertSpecialtyRequest, create = false): Promise<SpecialtyDto> {
  return apiJson(`/work-orders/specialties${create ? "?create=true" : ""}`, workOrderTagSchema, { method: "POST", body: dto });
}

const userOptionSchema = z.object({ id: z.string(), name: z.string() });
export type WorkOrderUserOption = z.infer<typeof userOptionSchema>;

export function fetchWorkOrderAssignableUsers(): Promise<WorkOrderUserOption[]> {
  return apiJson("/work-orders/users", z.array(userOptionSchema));
}

const equipmentOptionSchema = z.object({ id: z.string(), name: z.string(), tag: z.string().nullable() });
export type WorkOrderEquipmentOption = z.infer<typeof equipmentOptionSchema>;

export function fetchWorkOrderEquipmentOptions(nodeId: string): Promise<WorkOrderEquipmentOption[]> {
  return apiJson(`/work-orders/equipment-options?nodeId=${encodeURIComponent(nodeId)}`, z.array(equipmentOptionSchema));
}

export function createWorkOrder(dto: CreateWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson("/work-orders", workOrderDetailSchema, { method: "POST", body: dto });
}

export function updateWorkOrder(id: string, dto: UpdateWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}`, workOrderDetailSchema, { method: "PATCH", body: dto });
}

export function assignWorkOrder(id: string, dto: AssignWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}/assign`, workOrderDetailSchema, { method: "POST", body: dto });
}

export function cancelWorkOrder(id: string, dto: CancelWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}/cancel`, workOrderDetailSchema, { method: "POST", body: dto });
}

/** Ejecuta una transición del flujo (Puerta 1: enviar / aprobar [firma] / rechazar). */
export function transitionWorkOrder(id: string, dto: TransitionWorkOrderRequest): Promise<WorkOrderDetail> {
  return apiJson(`/work-orders/${id}/transitions`, workOrderDetailSchema, { method: "POST", body: dto });
}

// === Checklists / Puerta 2 (S3) ==============================================

/** Reglas de checklist (Capa A · catálogo). */
export function fetchWorkOrderChecklistRules(includeInactive = false): Promise<WorkOrderChecklistRuleDto[]> {
  return apiJson(`/work-orders/checklist-rules${includeInactive ? "?includeInactive=true" : ""}`, z.array(workOrderChecklistRuleSchema));
}

export function upsertWorkOrderChecklistRule(dto: UpsertWorkOrderChecklistRuleRequest): Promise<WorkOrderChecklistRuleDto> {
  return apiJson("/work-orders/checklist-rules", workOrderChecklistRuleSchema, { method: "POST", body: dto });
}

export function deleteWorkOrderChecklistRule(ruleId: string): Promise<void> {
  return apiJson(`/work-orders/checklist-rules/${ruleId}`, z.unknown(), { method: "DELETE" }).then(() => undefined);
}

/** Checklists de una OT (Capa B · operación). */
export function fetchWorkOrderChecklists(id: string): Promise<WorkOrderChecklistDto[]> {
  return apiJson(`/work-orders/${id}/checklists`, z.array(workOrderChecklistSchema));
}

export function suggestWorkOrderChecklists(id: string): Promise<WorkOrderChecklistDto[]> {
  return apiJson(`/work-orders/${id}/checklists/suggest`, z.array(workOrderChecklistSchema), { method: "POST" });
}

/** Gobierno 2 (S5b): confirma el set de verificaciones de EJECUCIÓN antes de autorizar el permiso. */
export function confirmWorkOrderExecutionSet(id: string): Promise<WorkOrderChecklistDto[]> {
  return apiJson(`/work-orders/${id}/checklists/execution-set/confirm`, z.array(workOrderChecklistSchema), { method: "POST" });
}

export function addWorkOrderChecklist(id: string, dto: AddWorkOrderChecklistRequest): Promise<WorkOrderChecklistDto> {
  return apiJson(`/work-orders/${id}/checklists`, workOrderChecklistSchema, { method: "POST", body: dto });
}

export function removeWorkOrderChecklist(id: string, cid: string): Promise<void> {
  return apiJson(`/work-orders/${id}/checklists/${cid}`, z.unknown(), { method: "DELETE" }).then(() => undefined);
}

export function instantiateWorkOrderChecklist(id: string, cid: string): Promise<WorkOrderChecklistDto> {
  return apiJson(`/work-orders/${id}/checklists/${cid}/instantiate`, workOrderChecklistSchema, { method: "POST" });
}

export function submitWorkOrderChecklist(id: string, cid: string): Promise<WorkOrderChecklistDto> {
  return apiJson(`/work-orders/${id}/checklists/${cid}/submit`, workOrderChecklistSchema, { method: "POST" });
}

export function reviewWorkOrderChecklist(id: string, cid: string, dto: ReviewWorkOrderChecklistRequest): Promise<WorkOrderChecklistDto> {
  return apiJson(`/work-orders/${id}/checklists/${cid}/review`, workOrderChecklistSchema, { method: "POST", body: dto });
}

// === Plan de actividades / Puerta 3 (S4) =====================================

export function fetchWorkOrderActivities(id: string): Promise<WorkActivityDto[]> {
  return apiJson(`/work-orders/${id}/activities`, z.array(workActivitySchema));
}

export function createWorkOrderActivity(id: string, dto: CreateWorkActivityRequest): Promise<WorkActivityDto> {
  return apiJson(`/work-orders/${id}/activities`, workActivitySchema, { method: "POST", body: dto });
}

/** Alta en lote (lo usa el asistente guiado que genera el plan completo). */
export function createWorkOrderActivitiesBatch(id: string, dto: CreateWorkActivitiesBatchRequest): Promise<WorkActivityDto[]> {
  return apiJson(`/work-orders/${id}/activities/batch`, z.array(workActivitySchema), { method: "POST", body: dto });
}

export function updateWorkOrderActivity(id: string, aid: string, dto: UpdateWorkActivityRequest): Promise<WorkActivityDto> {
  return apiJson(`/work-orders/${id}/activities/${aid}`, workActivitySchema, { method: "PATCH", body: dto });
}

export function removeWorkOrderActivity(id: string, aid: string): Promise<void> {
  return apiJson(`/work-orders/${id}/activities/${aid}`, z.unknown(), { method: "DELETE" }).then(() => undefined);
}

export function reorderWorkOrderActivities(id: string, dto: ReorderWorkActivitiesRequest): Promise<WorkActivityDto[]> {
  return apiJson(`/work-orders/${id}/activities/reorder`, z.array(workActivitySchema), { method: "POST", body: dto });
}

// === Seguimiento del avance / Puerta 4 (S5) ==================================

/** Registra un avance de la actividad (append-only) y devuelve su foto vigente. */
export function recordWorkOrderActivityProgress(id: string, aid: string, dto: RecordWorkActivityProgressRequest): Promise<WorkActivityDto> {
  return apiJson(`/work-orders/${id}/activities/${aid}/progress`, workActivitySchema, { method: "POST", body: dto });
}

/** Historial (append-only) de avance de una actividad. */
export function fetchWorkOrderActivityUpdates(id: string, aid: string): Promise<WorkActivityUpdateDto[]> {
  return apiJson(`/work-orders/${id}/activities/${aid}/updates`, z.array(workActivityUpdateSchema));
}

// --- Dotación del permiso (S1) ---------------------------------------------

export function fetchWorkOrderRoster(id: string): Promise<WorkOrderRosterDto> {
  return apiJson(`/work-orders/${id}/roster`, workOrderRosterSchema);
}

export function addWorkOrderWorker(id: string, dto: AddWorkOrderWorkerRequest): Promise<WorkOrderRosterDto> {
  return apiJson(`/work-orders/${id}/roster`, workOrderRosterSchema, { method: "POST", body: dto });
}

export function removeWorkOrderWorker(id: string, workerId: string, dto: RemoveWorkOrderWorkerRequest): Promise<WorkOrderRosterDto> {
  return apiJson(`/work-orders/${id}/roster/${workerId}/remove`, workOrderRosterSchema, { method: "POST", body: dto });
}

/** Confirma (sella) la dotación con firma Part 11 = gate para autorizar el permiso. */
export function confirmWorkOrderRoster(id: string, dto: ConfirmRosterRequest): Promise<WorkOrderRosterDto> {
  return apiJson(`/work-orders/${id}/roster/confirm`, workOrderRosterSchema, { method: "POST", body: dto });
}

// --- Catálogo de Personas / Empresas contratistas / Roles (S1) -------------

export function fetchPersons(params: { search?: string; kind?: string; includeInactive?: boolean } = {}): Promise<PersonDto[]> {
  const p = new URLSearchParams();
  if (params.search) p.set("search", params.search);
  if (params.kind) p.set("kind", params.kind);
  if (params.includeInactive) p.set("includeInactive", "true");
  const qs = p.toString();
  return apiJson(`/persons${qs ? `?${qs}` : ""}`, z.array(personSchema));
}

export function upsertPerson(dto: UpsertPersonRequest): Promise<PersonDto> {
  return apiJson("/persons", personSchema, { method: "POST", body: dto });
}

export function deletePerson(id: string): Promise<void> {
  return apiJson(`/persons/${id}`, z.unknown(), { method: "DELETE" }).then(() => undefined);
}

export function fetchContractorCompanies(includeInactive = false): Promise<ContractorCompanyDto[]> {
  return apiJson(`/contractor-companies${includeInactive ? "?includeInactive=true" : ""}`, z.array(contractorCompanySchema));
}

export function upsertContractorCompany(dto: UpsertContractorCompanyRequest, create = false): Promise<ContractorCompanyDto> {
  return apiJson(`/contractor-companies${create ? "?create=true" : ""}`, contractorCompanySchema, { method: "POST", body: dto });
}

export function deleteContractorCompany(id: string): Promise<void> {
  return apiJson(`/contractor-companies/${id}`, z.unknown(), { method: "DELETE" }).then(() => undefined);
}

export function fetchRosterRoles(includeInactive = false): Promise<RosterRoleDto[]> {
  return apiJson(`/roster-roles${includeInactive ? "?includeInactive=true" : ""}`, z.array(rosterRoleSchema));
}

export function upsertRosterRole(dto: UpsertRosterRoleRequest, create = false): Promise<RosterRoleDto> {
  return apiJson(`/roster-roles${create ? "?create=true" : ""}`, rosterRoleSchema, { method: "POST", body: dto });
}

export function deleteRosterRole(id: string): Promise<void> {
  return apiJson(`/roster-roles/${id}`, z.unknown(), { method: "DELETE" }).then(() => undefined);
}

// --- Competencias / restricciones / reglas (S2) ----------------------------

export function fetchCompetencyTypes(includeInactive = false): Promise<CompetencyTypeDto[]> {
  return apiJson(`/competency-types${includeInactive ? "?includeInactive=true" : ""}`, z.array(competencyTypeSchema));
}

export function upsertCompetencyType(dto: UpsertCompetencyTypeRequest): Promise<CompetencyTypeDto> {
  return apiJson("/competency-types", competencyTypeSchema, { method: "POST", body: dto });
}

export function deleteCompetencyType(id: string): Promise<void> {
  return apiJson(`/competency-types/${id}`, z.unknown(), { method: "DELETE" }).then(() => undefined);
}

export function fetchCompetencyRules(includeInactive = false): Promise<WorkOrderCompetencyRuleDto[]> {
  return apiJson(`/work-order-competency-rules${includeInactive ? "?includeInactive=true" : ""}`, z.array(workOrderCompetencyRuleSchema));
}

export function upsertCompetencyRule(dto: UpsertWorkOrderCompetencyRuleRequest): Promise<WorkOrderCompetencyRuleDto> {
  return apiJson("/work-order-competency-rules", workOrderCompetencyRuleSchema, { method: "POST", body: dto });
}

export function deleteCompetencyRule(ruleId: string): Promise<void> {
  return apiJson(`/work-order-competency-rules/${ruleId}`, z.unknown(), { method: "DELETE" }).then(() => undefined);
}

export function fetchPersonCompetencies(personId: string, includeArchived = false): Promise<PersonCompetencyDto[]> {
  return apiJson(`/persons/${personId}/competencies${includeArchived ? "?includeArchived=true" : ""}`, z.array(personCompetencySchema));
}

export function upsertPersonCompetency(personId: string, dto: UpsertPersonCompetencyRequest): Promise<PersonCompetencyDto[]> {
  return apiJson(`/persons/${personId}/competencies`, z.array(personCompetencySchema), { method: "POST", body: dto });
}

export function deletePersonCompetency(personId: string, id: string): Promise<PersonCompetencyDto[]> {
  return apiJson(`/persons/${personId}/competencies/${id}`, z.array(personCompetencySchema), { method: "DELETE" });
}

export function fetchPersonRestrictions(personId: string, includeArchived = false): Promise<PersonRestrictionDto[]> {
  return apiJson(`/persons/${personId}/restrictions${includeArchived ? "?includeArchived=true" : ""}`, z.array(personRestrictionSchema));
}

export function upsertPersonRestriction(personId: string, dto: UpsertPersonRestrictionRequest): Promise<PersonRestrictionDto[]> {
  return apiJson(`/persons/${personId}/restrictions`, z.array(personRestrictionSchema), { method: "POST", body: dto });
}

export function deletePersonRestriction(personId: string, id: string): Promise<PersonRestrictionDto[]> {
  return apiJson(`/persons/${personId}/restrictions/${id}`, z.array(personRestrictionSchema), { method: "DELETE" });
}
