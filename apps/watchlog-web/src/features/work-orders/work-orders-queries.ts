import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AddWorkOrderChecklistRequest,
  AddWorkOrderWorkerRequest,
  ConfirmRosterRequest,
  RemoveWorkOrderWorkerRequest,
  UpsertContractorCompanyRequest,
  UpsertRosterRoleRequest,
  UpsertPersonRequest,
  AssignWorkOrderRequest,
  CancelWorkOrderRequest,
  CreateWorkActivitiesBatchRequest,
  CreateWorkActivityRequest,
  CreateWorkOrderRequest,
  RecordWorkActivityProgressRequest,
  ReorderWorkActivitiesRequest,
  ReviewWorkOrderChecklistRequest,
  TransitionWorkOrderRequest,
  UpdateWorkActivityRequest,
  UpdateWorkOrderRequest,
  UpsertSpecialtyRequest,
  UpsertWorkOrderChecklistRuleRequest,
  UpsertWorkOrderTypeRequest,
  UpsertCompetencyTypeRequest,
  UpsertPersonCompetencyRequest,
  UpsertPersonRestrictionRequest,
  UpsertWorkOrderCompetencyRuleRequest,
  WorkOrderDashboardQuery,
  WorkOrderListQuery,
} from "@lyra/contracts";
import {
  addWorkOrderChecklist,
  confirmWorkOrderExecutionSet,
  assignWorkOrder,
  cancelWorkOrder,
  createWorkOrder,
  createWorkOrderActivitiesBatch,
  createWorkOrderActivity,
  deleteWorkOrderChecklistRule,
  fetchWorkOrderActivities,
  fetchWorkOrderActivityUpdates,
  fetchWorkOrderAssignableUsers,
  fetchWorkOrderChecklistRules,
  fetchWorkOrderChecklists,
  fetchWorkOrderDetail,
  fetchWorkOrderEquipmentOptions,
  fetchWorkOrderSpecialties,
  fetchWorkOrderStats,
  fetchWorkOrderDashboard,
  fetchWorkOrderTypes,
  fetchWorkOrders,
  instantiateWorkOrderChecklist,
  removeWorkOrderActivity,
  removeWorkOrderChecklist,
  recordWorkOrderActivityProgress,
  reorderWorkOrderActivities,
  reviewWorkOrderChecklist,
  submitWorkOrderChecklist,
  suggestWorkOrderChecklists,
  transitionWorkOrder,
  updateWorkOrder,
  updateWorkOrderActivity,
  upsertWorkOrderChecklistRule,
  upsertWorkOrderSpecialty,
  upsertWorkOrderType,
  fetchWorkOrderRoster,
  addWorkOrderWorker,
  removeWorkOrderWorker,
  confirmWorkOrderRoster,
  fetchPersons,
  upsertPerson,
  deletePerson,
  fetchContractorCompanies,
  upsertContractorCompany,
  deleteContractorCompany,
  fetchRosterRoles,
  upsertRosterRole,
  deleteRosterRole,
  fetchCompetencyTypes,
  upsertCompetencyType,
  deleteCompetencyType,
  fetchCompetencyRules,
  upsertCompetencyRule,
  deleteCompetencyRule,
  fetchPersonCompetencies,
  upsertPersonCompetency,
  deletePersonCompetency,
  fetchPersonRestrictions,
  upsertPersonRestriction,
  deletePersonRestriction,
} from "./work-orders-api.js";
import { fetchTemplates } from "../templates/templates-api.js";
import { useActiveStructureId } from "../structure/structure-queries.js";

export const WORK_ORDER_KEYS = {
  all: ["work-orders"] as const,
  list: (q: WorkOrderListQuery, structureId: string | null) => ["work-orders", "list", q, structureId] as const,
  detail: (id: string) => ["work-orders", "detail", id] as const,
  stats: (structureId: string | null) => ["work-orders", "stats", structureId] as const,
  dashboard: (q: WorkOrderDashboardQuery, structureId: string | null) => ["work-orders", "dashboard", q, structureId] as const,
  types: () => ["work-orders", "types"] as const,
  specialties: () => ["work-orders", "specialties"] as const,
};

export function useWorkOrderDashboard(q: WorkOrderDashboardQuery) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: WORK_ORDER_KEYS.dashboard(q, structureId), queryFn: () => fetchWorkOrderDashboard(q, structureId) });
}

export function useWorkOrders(q: WorkOrderListQuery) {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: WORK_ORDER_KEYS.list(q, structureId), queryFn: () => fetchWorkOrders(q, structureId) });
}

export function useWorkOrderDetail(id: string | null) {
  return useQuery({ queryKey: WORK_ORDER_KEYS.detail(id ?? ""), queryFn: () => fetchWorkOrderDetail(id!), enabled: !!id });
}

export function useWorkOrderStats() {
  const structureId = useActiveStructureId();
  return useQuery({ queryKey: WORK_ORDER_KEYS.stats(structureId), queryFn: () => fetchWorkOrderStats(structureId) });
}

export function useWorkOrderTypes() {
  return useQuery({ queryKey: WORK_ORDER_KEYS.types(), queryFn: () => fetchWorkOrderTypes() });
}

export function useWorkOrderSpecialties() {
  return useQuery({ queryKey: WORK_ORDER_KEYS.specialties(), queryFn: () => fetchWorkOrderSpecialties() });
}

/** Variantes para el MANTENEDOR: incluyen inactivos (key distinto, no contamina los desplegables del alta). */
export function useWorkOrderTypesAdmin() {
  return useQuery({ queryKey: [...WORK_ORDER_KEYS.types(), "admin"], queryFn: () => fetchWorkOrderTypes(true) });
}

export function useWorkOrderSpecialtiesAdmin() {
  return useQuery({ queryKey: [...WORK_ORDER_KEYS.specialties(), "admin"], queryFn: () => fetchWorkOrderSpecialties(true) });
}

export function useUpsertWorkOrderType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, create }: { dto: UpsertWorkOrderTypeRequest; create?: boolean }) => upsertWorkOrderType(dto, create),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.types() }),
  });
}

export function useUpsertWorkOrderSpecialty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, create }: { dto: UpsertSpecialtyRequest; create?: boolean }) => upsertWorkOrderSpecialty(dto, create),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.specialties() }),
  });
}

export function useWorkOrderAssignableUsers() {
  return useQuery({ queryKey: ["work-orders", "users"], queryFn: fetchWorkOrderAssignableUsers });
}

export function useWorkOrderEquipmentOptions(nodeId: string | undefined) {
  return useQuery({
    queryKey: ["work-orders", "equipment-options", nodeId],
    queryFn: () => fetchWorkOrderEquipmentOptions(nodeId!),
    enabled: !!nodeId,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.all });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: CreateWorkOrderRequest) => createWorkOrder(dto), onSuccess: () => invalidate(qc) });
}

export function useUpdateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: UpdateWorkOrderRequest }) => updateWorkOrder(id, dto), onSuccess: () => invalidate(qc) });
}

export function useAssignWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: AssignWorkOrderRequest }) => assignWorkOrder(id, dto), onSuccess: () => invalidate(qc) });
}

export function useCancelWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: CancelWorkOrderRequest }) => cancelWorkOrder(id, dto), onSuccess: () => invalidate(qc) });
}

export function useTransitionWorkOrder() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, dto }: { id: string; dto: TransitionWorkOrderRequest }) => transitionWorkOrder(id, dto), onSuccess: () => invalidate(qc) });
}

// === Checklists / Puerta 2 (S3) ==============================================

export const WORK_ORDER_CHECKLIST_KEYS = {
  rules: () => ["work-orders", "checklist-rules"] as const,
  forWorkOrder: (id: string) => ["work-orders", "checklists", id] as const,
};

export function useWorkOrderChecklistRules() {
  return useQuery({ queryKey: WORK_ORDER_CHECKLIST_KEYS.rules(), queryFn: () => fetchWorkOrderChecklistRules(true) });
}

/** Plantillas PUBLICADAS (id+nombre+propósito) para el picker del editor de reglas de checklist. */
export function usePublishedTemplateOptions() {
  return useQuery({
    queryKey: ["work-orders", "published-templates"],
    queryFn: () => fetchTemplates(),
    select: (rows) => rows.filter((t) => t.status === "PUBLISHED").map((t) => ({ id: t.id, name: t.name, purpose: t.purpose })),
  });
}

export function useUpsertWorkOrderChecklistRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpsertWorkOrderChecklistRuleRequest) => upsertWorkOrderChecklistRule(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORK_ORDER_CHECKLIST_KEYS.rules() }),
  });
}

export function useDeleteWorkOrderChecklistRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => deleteWorkOrderChecklistRule(ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: WORK_ORDER_CHECKLIST_KEYS.rules() }),
  });
}

export function useWorkOrderChecklists(id: string | null) {
  return useQuery({ queryKey: WORK_ORDER_CHECKLIST_KEYS.forWorkOrder(id ?? ""), queryFn: () => fetchWorkOrderChecklists(id!), enabled: !!id });
}

/** Invalida la lista de checklists de la OT + el detalle (eventos del timeline). */
function invalidateChecklists(qc: ReturnType<typeof useQueryClient>, id: string): void {
  qc.invalidateQueries({ queryKey: WORK_ORDER_CHECKLIST_KEYS.forWorkOrder(id) });
  qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.detail(id) });
}

export function useSuggestWorkOrderChecklists(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => suggestWorkOrderChecklists(id), onSuccess: () => invalidateChecklists(qc, id) });
}

export function useConfirmWorkOrderExecutionSet(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: () => confirmWorkOrderExecutionSet(id), onSuccess: () => invalidateChecklists(qc, id) });
}

export function useAddWorkOrderChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: AddWorkOrderChecklistRequest) => addWorkOrderChecklist(id, dto), onSuccess: () => invalidateChecklists(qc, id) });
}

export function useRemoveWorkOrderChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (cid: string) => removeWorkOrderChecklist(id, cid), onSuccess: () => invalidateChecklists(qc, id) });
}

export function useInstantiateWorkOrderChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (cid: string) => instantiateWorkOrderChecklist(id, cid), onSuccess: () => invalidateChecklists(qc, id) });
}

export function useSubmitWorkOrderChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (cid: string) => submitWorkOrderChecklist(id, cid), onSuccess: () => invalidateChecklists(qc, id) });
}

export function useReviewWorkOrderChecklist(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ cid, dto }: { cid: string; dto: ReviewWorkOrderChecklistRequest }) => reviewWorkOrderChecklist(id, cid, dto),
    onSuccess: () => invalidateChecklists(qc, id),
  });
}

// === Plan de actividades / Puerta 3 (S4) =====================================

export const WORK_ORDER_ACTIVITY_KEYS = {
  forWorkOrder: (id: string) => ["work-orders", "activities", id] as const,
};

/** Invalida el plan de la OT + su detalle (eventos del timeline + estado del plan). */
function invalidateActivities(qc: ReturnType<typeof useQueryClient>, id: string): void {
  qc.invalidateQueries({ queryKey: WORK_ORDER_ACTIVITY_KEYS.forWorkOrder(id) });
  qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.detail(id) });
}

export function useWorkOrderActivities(id: string | null) {
  return useQuery({ queryKey: WORK_ORDER_ACTIVITY_KEYS.forWorkOrder(id ?? ""), queryFn: () => fetchWorkOrderActivities(id!), enabled: !!id });
}

export function useCreateWorkOrderActivity(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: CreateWorkActivityRequest) => createWorkOrderActivity(id, dto), onSuccess: () => invalidateActivities(qc, id) });
}

export function useCreateWorkOrderActivitiesBatch(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: CreateWorkActivitiesBatchRequest) => createWorkOrderActivitiesBatch(id, dto), onSuccess: () => invalidateActivities(qc, id) });
}

export function useUpdateWorkOrderActivity(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ aid, dto }: { aid: string; dto: UpdateWorkActivityRequest }) => updateWorkOrderActivity(id, aid, dto), onSuccess: () => invalidateActivities(qc, id) });
}

export function useRemoveWorkOrderActivity(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (aid: string) => removeWorkOrderActivity(id, aid), onSuccess: () => invalidateActivities(qc, id) });
}

export function useReorderWorkOrderActivities(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: ReorderWorkActivitiesRequest) => reorderWorkOrderActivities(id, dto), onSuccess: () => invalidateActivities(qc, id) });
}

// === Seguimiento del avance / Puerta 4 (S5) ==================================

/** Historial (append-only) de avance de una actividad; se carga al expandir la fila. */
export function useWorkOrderActivityUpdates(id: string, aid: string | null) {
  return useQuery({
    queryKey: ["work-orders", "activity-updates", id, aid ?? ""],
    queryFn: () => fetchWorkOrderActivityUpdates(id, aid!),
    enabled: !!aid,
  });
}

export function useRecordWorkOrderActivityProgress(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ aid, dto }: { aid: string; dto: RecordWorkActivityProgressRequest }) => recordWorkOrderActivityProgress(id, aid, dto),
    onSuccess: (_r, { aid }) => {
      invalidateActivities(qc, id);
      qc.invalidateQueries({ queryKey: ["work-orders", "activity-updates", id, aid] });
    },
  });
}

// === Dotación del permiso (S1) =============================================

export const WORK_ORDER_ROSTER_KEYS = {
  forWorkOrder: (id: string) => ["work-orders", "roster", id] as const,
};

export function useWorkOrderRoster(id: string | null) {
  return useQuery({ queryKey: WORK_ORDER_ROSTER_KEYS.forWorkOrder(id ?? ""), queryFn: () => fetchWorkOrderRoster(id!), enabled: !!id });
}

function invalidateRoster(qc: ReturnType<typeof useQueryClient>, id: string): void {
  qc.invalidateQueries({ queryKey: WORK_ORDER_ROSTER_KEYS.forWorkOrder(id) });
  qc.invalidateQueries({ queryKey: WORK_ORDER_KEYS.detail(id) });
}

export function useAddWorkOrderWorker(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: AddWorkOrderWorkerRequest) => addWorkOrderWorker(id, dto), onSuccess: () => invalidateRoster(qc, id) });
}

export function useRemoveWorkOrderWorker(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ workerId, dto }: { workerId: string; dto: RemoveWorkOrderWorkerRequest }) => removeWorkOrderWorker(id, workerId, dto), onSuccess: () => invalidateRoster(qc, id) });
}

export function useConfirmWorkOrderRoster(id: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: ConfirmRosterRequest) => confirmWorkOrderRoster(id, dto), onSuccess: () => invalidateRoster(qc, id) });
}

// === Catálogo de Personas / Empresas contratistas / Roles (S1) =============

export const PERSON_KEYS = {
  persons: (search?: string, kind?: string, includeInactive?: boolean) => ["persons", { search: search ?? "", kind: kind ?? "", includeInactive: !!includeInactive }] as const,
  companies: () => ["contractor-companies"] as const,
  rosterRoles: () => ["roster-roles"] as const,
};

export function usePersons(opts: { search?: string; kind?: string; includeInactive?: boolean } = {}) {
  return useQuery({ queryKey: PERSON_KEYS.persons(opts.search, opts.kind, opts.includeInactive), queryFn: () => fetchPersons(opts) });
}

export function useUpsertPerson() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: UpsertPersonRequest) => upsertPerson(dto), onSuccess: () => qc.invalidateQueries({ queryKey: ["persons"] }) });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deletePerson(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["persons"] }) });
}

export function useContractorCompanies(includeInactive = false) {
  return useQuery({ queryKey: [...PERSON_KEYS.companies(), includeInactive], queryFn: () => fetchContractorCompanies(includeInactive) });
}

export function useUpsertContractorCompany() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ dto, create }: { dto: UpsertContractorCompanyRequest; create: boolean }) => upsertContractorCompany(dto, create), onSuccess: () => qc.invalidateQueries({ queryKey: PERSON_KEYS.companies() }) });
}

export function useDeleteContractorCompany() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteContractorCompany(id), onSuccess: () => qc.invalidateQueries({ queryKey: PERSON_KEYS.companies() }) });
}

export function useRosterRoles(includeInactive = false) {
  return useQuery({ queryKey: [...PERSON_KEYS.rosterRoles(), includeInactive], queryFn: () => fetchRosterRoles(includeInactive) });
}

export function useUpsertRosterRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dto, create }: { dto: UpsertRosterRoleRequest; create: boolean }) => upsertRosterRole(dto, create),
    onSuccess: () => qc.invalidateQueries({ queryKey: PERSON_KEYS.rosterRoles() }),
  });
}

export function useDeleteRosterRole() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteRosterRole(id), onSuccess: () => qc.invalidateQueries({ queryKey: PERSON_KEYS.rosterRoles() }) });
}

// === Competencias / restricciones / reglas (S2) ============================

export const COMPETENCY_KEYS = {
  types: () => ["competency-types"] as const,
  rules: () => ["work-order-competency-rules"] as const,
  personCompetencies: (personId: string) => ["persons", personId, "competencies"] as const,
  personRestrictions: (personId: string) => ["persons", personId, "restrictions"] as const,
};

export function useCompetencyTypes(includeInactive = false) {
  return useQuery({ queryKey: [...COMPETENCY_KEYS.types(), includeInactive], queryFn: () => fetchCompetencyTypes(includeInactive) });
}

export function useUpsertCompetencyType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: UpsertCompetencyTypeRequest) => upsertCompetencyType(dto), onSuccess: () => qc.invalidateQueries({ queryKey: COMPETENCY_KEYS.types() }) });
}

export function useDeleteCompetencyType() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deleteCompetencyType(id), onSuccess: () => qc.invalidateQueries({ queryKey: COMPETENCY_KEYS.types() }) });
}

export function useCompetencyRules() {
  return useQuery({ queryKey: COMPETENCY_KEYS.rules(), queryFn: () => fetchCompetencyRules(true) });
}

export function useUpsertCompetencyRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: UpsertWorkOrderCompetencyRuleRequest) => upsertCompetencyRule(dto), onSuccess: () => qc.invalidateQueries({ queryKey: COMPETENCY_KEYS.rules() }) });
}

export function useDeleteCompetencyRule() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (ruleId: string) => deleteCompetencyRule(ruleId), onSuccess: () => qc.invalidateQueries({ queryKey: COMPETENCY_KEYS.rules() }) });
}

export function usePersonCompetencies(personId: string | null, includeArchived = false) {
  return useQuery({ queryKey: [...COMPETENCY_KEYS.personCompetencies(personId ?? ""), includeArchived], queryFn: () => fetchPersonCompetencies(personId!, includeArchived), enabled: !!personId });
}

export function useUpsertPersonCompetency(personId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: UpsertPersonCompetencyRequest) => upsertPersonCompetency(personId, dto), onSuccess: () => qc.invalidateQueries({ queryKey: COMPETENCY_KEYS.personCompetencies(personId) }) });
}

export function useDeletePersonCompetency(personId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deletePersonCompetency(personId, id), onSuccess: () => qc.invalidateQueries({ queryKey: COMPETENCY_KEYS.personCompetencies(personId) }) });
}

export function usePersonRestrictions(personId: string | null, includeArchived = false) {
  return useQuery({ queryKey: [...COMPETENCY_KEYS.personRestrictions(personId ?? ""), includeArchived], queryFn: () => fetchPersonRestrictions(personId!, includeArchived), enabled: !!personId });
}

export function useUpsertPersonRestriction(personId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (dto: UpsertPersonRestrictionRequest) => upsertPersonRestriction(personId, dto), onSuccess: () => qc.invalidateQueries({ queryKey: COMPETENCY_KEYS.personRestrictions(personId) }) });
}

export function useDeletePersonRestriction(personId: string) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => deletePersonRestriction(personId, id), onSuccess: () => qc.invalidateQueries({ queryKey: COMPETENCY_KEYS.personRestrictions(personId) }) });
}
