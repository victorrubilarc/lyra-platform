import { z } from "zod";

/**
 * Checklists / Permisos de Trabajo (PTW) de una OT (Sesión 3 — Puerta 2) — contratos
 * compartidos back↔front.
 *
 * NO se reinventa un motor de checklists: cada checklist ES una plantilla del
 * Form Builder (`Template`) instanciada como `LogEntry` vivo (fork W5 aprobado). El
 * módulo aporta 2 capas sobre esa maquinaria:
 *
 *  - Capa A · diseño (admin): `WorkOrderChecklistRule` = plantilla + reglas de
 *    APLICABILIDAD (patrón `appliesToTypeIds`/`minSeverity` de `ReportingObligation`).
 *    Gobernada por `workordercatalog:manage` (es otro catálogo, como Tipos/Especialidades).
 *  - Capa B · operación (en la OT): `WorkOrderChecklist` = enlace (OT, plantilla) con
 *    su estado y su `LogEntry`. Al ENTRAR al estado de preparación el backend
 *    SUGIERE los aplicables (mandatory no removibles) + el usuario agrega manuales.
 *    Gobernada por `workorder:checklist:manage`.
 *
 * Guard de Puerta 2 (`blockingChecklistsForClose`, PURO, espejo de
 * `blockingActionsForClose`): no se puede ENTRAR al estado-puerta si existe algún
 * checklist `mandatory` que no esté `APPROVED`. Segregación de funciones: el revisor
 * (Puerta 2) debe ser distinto del responsable que lo completó.
 */

// === Vocabularios =============================================================

/**
 * Estado de un checklist operativo en la OT (Capa B). "IN_PROGRESS" = ya se
 * instanció el LogEntry y se está llenando; "SUBMITTED" = LogEntry sellado, en
 * espera de revisión; "APPROVED"/"REJECTED" = veredicto del revisor.
 */
export const WORK_ORDER_CHECKLIST_STATUSES = ["PENDING", "IN_PROGRESS", "SUBMITTED", "APPROVED", "REJECTED"] as const;
export const workOrderChecklistStatusSchema = z.enum(WORK_ORDER_CHECKLIST_STATUSES);
export type WorkOrderChecklistStatus = (typeof WORK_ORDER_CHECKLIST_STATUSES)[number];

/**
 * MOMENTO del ciclo de la OT en que vive un checklist (S5b, §11.2). Cada checklist se
 * exige en un momento distinto, llenado por roles distintos: la solicitud (triage), la
 * planificación (evaluación de riesgo del plan), la AUTORIZACIÓN del permiso (Puerta 2),
 * la EJECUCIÓN en terreno (LOTO físico/toma-5, por actividad) y el CIERRE del permiso
 * (retiro de controles, reenergizar). El TIPO/flujo declara qué estado corresponde a cada
 * momento como DATO. Hoy se cablean AUTHORIZATION (S3) y CLOSURE (S5b Slice A); EXECUTION
 * por actividad + Gobierno 2 = Slice B; REQUEST/PLANNING existen sin guard propio aún.
 */
export const WORK_ORDER_CHECKLIST_MOMENTS = ["REQUEST", "PLANNING", "AUTHORIZATION", "EXECUTION", "CLOSURE"] as const;
export const workOrderChecklistMomentSchema = z.enum(WORK_ORDER_CHECKLIST_MOMENTS);
export type WorkOrderChecklistMoment = (typeof WORK_ORDER_CHECKLIST_MOMENTS)[number];

/** Metadatos de presentación de cada momento (etiqueta legible + orden cronológico). */
export const WORK_ORDER_CHECKLIST_MOMENT_META: Record<WorkOrderChecklistMoment, { label: string; hint: string; order: number }> = {
  REQUEST: { label: "Solicitud", hint: "Al solicitar la OT (triage, categorización de riesgo)", order: 1 },
  PLANNING: { label: "Planificación", hint: "Al planificar (evaluación de riesgo del plan, ITP)", order: 2 },
  AUTHORIZATION: { label: "Autorización", hint: "Al autorizar el permiso, antes de ejecutar (documental)", order: 3 },
  EXECUTION: { label: "Ejecución", hint: "En terreno al ejecutar cada actividad (LOTO físico, toma-5)", order: 4 },
  CLOSURE: { label: "Cierre", hint: "Al cerrar el permiso (retiro de controles, reenergizar, sitio seguro)", order: 5 },
};

/**
 * Claves de estado data-driven (paridad con `DEFAULT_WORK_ORDER_FOLIO_STATE_KEY`):
 * el TIPO puede declarar otras vía `checklistSuggestStateKey`/`checklistGateStateKey`;
 * estos defaults corresponden al flujo sembrado "ot-4-puertas". El momento AUTHORIZATION
 * usa suggest/gate; el momento CLOSURE usa su propio suggest + el guard de cierre
 * (`becomesFinal`); EXECUTION reusa `executeStateKey` (Slice B).
 */
export const DEFAULT_WORK_ORDER_CHECKLIST_SUGGEST_STATE_KEY = "en_preparacion";
export const DEFAULT_WORK_ORDER_CHECKLIST_GATE_STATE_KEY = "checklists_ok";
export const DEFAULT_WORK_ORDER_CLOSURE_CHECKLIST_SUGGEST_STATE_KEY = "en_revision_cierre";

// === DTO: regla de checklist (Capa A · catálogo) ==============================

export const workOrderChecklistRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Plantilla del Form Builder a instanciar como checklist. */
  templateId: z.string(),
  templateName: z.string().nullable(),
  /** Momento del ciclo en que se exige (default AUTHORIZATION). */
  moment: workOrderChecklistMomentSchema,
  /** Obligatorio ⇒ no removible de la OT y bloquea la puerta de su momento si no está aprobado. */
  mandatory: z.boolean(),
  /** Tipos de OT a los que aplica. Vacío = TODOS los tipos. */
  appliesToTypeIds: z.array(z.string()),
  appliesToTypeNames: z.array(z.string()),
  /** Criticidad mínima a la que aplica (null = cualquiera). */
  minCriticality: z.number().int().nullable(),
  /** Disciplina/especialidad a la que aplica (null = cualquiera). */
  specialtyId: z.string().nullable(),
  specialtyName: z.string().nullable(),
  /** Sólo aplica si el flag PTW de la OT coincide (null = no discrimina). */
  requiresPtw: z.boolean().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type WorkOrderChecklistRuleDto = z.infer<typeof workOrderChecklistRuleSchema>;

export const upsertWorkOrderChecklistRuleRequestSchema = z.object({
  /** Presente = actualizar; ausente = crear (las reglas no tienen `key` estable). */
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  templateId: z.string().min(1),
  moment: workOrderChecklistMomentSchema.optional(),
  mandatory: z.boolean().optional(),
  appliesToTypeIds: z.array(z.string().min(1)).max(100).optional(),
  minCriticality: z.number().int().min(1).max(5).nullable().optional(),
  specialtyId: z.string().min(1).nullable().optional(),
  requiresPtw: z.boolean().nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertWorkOrderChecklistRuleRequest = z.infer<typeof upsertWorkOrderChecklistRuleRequestSchema>;

// === DTO: checklist materializado en la OT (Capa B) ===========================

export const workOrderChecklistSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  templateId: z.string(),
  templateName: z.string().nullable(),
  /** Momento del ciclo (congelado al materializar/agregar); agrupa la UI y decide el guard. */
  moment: workOrderChecklistMomentSchema,
  /** Instancia viva (LogEntry) — null hasta iniciarla. */
  logEntryId: z.string().nullable(),
  /** Folio humano del LogEntry (para deep-link al llenado). */
  logEntryCode: z.string().nullable(),
  /** ¿El LogEntry ya está sellado (SUBMITTED)? Habilita "enviar a revisión". */
  logEntrySealed: z.boolean(),
  /** Regla que lo sugirió (null = agregado manual). */
  sourceRuleId: z.string().nullable(),
  ruleName: z.string().nullable(),
  mandatory: z.boolean(),
  status: workOrderChecklistStatusSchema,
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  reviewerId: z.string().nullable(),
  reviewerName: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  rejectReason: z.string().nullable(),
  addedById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type WorkOrderChecklistDto = z.infer<typeof workOrderChecklistSchema>;

// === Requests: operación sobre la OT ==========================================

/** Agregar manualmente un checklist (plantilla) a la OT. */
export const addWorkOrderChecklistRequestSchema = z.object({
  templateId: z.string().min(1),
  /** Momento del ciclo; omitido = el del estado actual de la OT (backend lo deriva). */
  moment: workOrderChecklistMomentSchema.optional(),
});
export type AddWorkOrderChecklistRequest = z.infer<typeof addWorkOrderChecklistRequestSchema>;

/** Veredicto del revisor de Puerta 2 (segregación: revisor ≠ responsable). */
export const reviewWorkOrderChecklistRequestSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((v) => v.decision === "APPROVE" || !!v.reason, {
    message: "El rechazo exige un motivo",
    path: ["reason"],
  });
export type ReviewWorkOrderChecklistRequest = z.infer<typeof reviewWorkOrderChecklistRequestSchema>;

// === Helpers PUROS (autoritativos back↔front) ================================

/**
 * Reglas de checklist APLICABLES al contexto de una OT (espejo de
 * `applicableObligationsFor`). Todos los ejes en null/vacío = aplica siempre.
 */
export function applicableChecklistRules<
  T extends {
    appliesToTypeIds: ReadonlyArray<string>;
    minCriticality: number | null;
    specialtyId: string | null;
    requiresPtw: boolean | null;
    active: boolean;
  },
>(
  ctx: { typeId: string; criticality: number; requiresPtw: boolean; specialtyIds: ReadonlyArray<string> },
  rules: ReadonlyArray<T>,
): T[] {
  return rules.filter((r) => {
    if (!r.active) return false;
    if (r.appliesToTypeIds.length > 0 && !r.appliesToTypeIds.includes(ctx.typeId)) return false;
    if (r.minCriticality != null && ctx.criticality < r.minCriticality) return false;
    if (r.requiresPtw != null && r.requiresPtw !== ctx.requiresPtw) return false;
    if (r.specialtyId != null && !ctx.specialtyIds.includes(r.specialtyId)) return false;
    return true;
  });
}

/**
 * Checklists obligatorios que aún no están `APPROVED` (moment-blind): indicador general
 * de "algo pendiente" para la cabecera de la UI. Lógica autoritativa compartida (espejo
 * de `blockingActionsForClose`).
 */
export function blockingChecklistsForClose<T extends { mandatory: boolean; status: WorkOrderChecklistStatus }>(
  checklists: ReadonlyArray<T>,
): T[] {
  return checklists.filter((c) => c.mandatory && c.status !== "APPROVED");
}

/**
 * Checklists que BLOQUEAN la puerta de UN momento concreto (S5b): obligatorios de ese
 * momento que aún no están `APPROVED`. El backend lo usa como guard data-driven —
 * AUTHORIZATION al ENTRAR al estado-puerta, CLOSURE al CERRAR (`becomesFinal`).
 */
export function blockingChecklistsForMoment<T extends { moment: WorkOrderChecklistMoment; mandatory: boolean; status: WorkOrderChecklistStatus }>(
  checklists: ReadonlyArray<T>,
  moment: WorkOrderChecklistMoment,
): T[] {
  return checklists.filter((c) => c.moment === moment && c.mandatory && c.status !== "APPROVED");
}

/** Resumen de progreso de checklists para KPI/chip (total, aprobados, bloqueantes). */
export function summarizeChecklists<T extends { mandatory: boolean; status: WorkOrderChecklistStatus }>(
  checklists: ReadonlyArray<T>,
): { total: number; approved: number; mandatory: number; blocking: number } {
  return {
    total: checklists.length,
    approved: checklists.filter((c) => c.status === "APPROVED").length,
    mandatory: checklists.filter((c) => c.mandatory).length,
    blocking: blockingChecklistsForClose(checklists).length,
  };
}
