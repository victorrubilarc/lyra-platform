import { z } from "zod";

/**
 * DOTACIÓN del permiso de trabajo (S1) — contratos compartidos back↔front.
 *
 * Gestiona el LISTADO DE PERSONAS (propias y contratistas) que ingresan a ejecutar
 * labores bajo un permiso, su ROL en la dotación, y la CONFIRMACIÓN FIRMADA de esa
 * dotación por quien autoriza el permiso (Gobierno 2, espejo de `confirmExecutionSet`).
 *
 * Trazabilidad a estándar (ver docs/design/DOTACION_DESIGN_ARCHITECTURE.md):
 *  - Roster con roles nombrados = requisito del permiso — OSHA 29 CFR 1910.146(f)(4)-(6)
 *    (authorized entrant / attendant-vigía / entry supervisor).
 *  - Persona SEPARADA de usuario — IBM Maximo (Person ≠ User; contratistas sin login).
 *  - Confirmación FIRMADA = firma del supervisor de entrada que autoriza la entrada —
 *    OSHA 1910.146(e)(2) + e-firma segura HSG250.
 *
 * En S1 el semáforo por persona solo evalúa PRESENCIA/rol; las causas rojas
 * (competencia vencida/faltante, veto, empresa no acreditada) llegan en S2/S3, pero la
 * función pura `evaluateWorkerStatus` ya tiene su forma final (estable desde S1).
 */

// === Vocabularios =============================================================

/** Clase de persona: propia (empleado) o de empresa contratista (sin login). */
export const PERSON_KINDS = ["INTERNAL", "CONTRACTOR"] as const;
export const personKindSchema = z.enum(PERSON_KINDS);
export type PersonKind = (typeof PERSON_KINDS)[number];

export const PERSON_KIND_META: Record<PersonKind, { label: string }> = {
  INTERNAL: { label: "Propio" },
  CONTRACTOR: { label: "Contratista" },
};

/** Estado de acreditación de una empresa contratista (nivel EMPRESA; gate en S3). */
export const ACCREDITATION_STATUSES = ["ACCREDITED", "CONDITIONAL", "SUSPENDED", "EXPIRED", "NONE"] as const;
export const accreditationStatusSchema = z.enum(ACCREDITATION_STATUSES);
export type AccreditationStatus = (typeof ACCREDITATION_STATUSES)[number];

export const ACCREDITATION_STATUS_META: Record<AccreditationStatus, { label: string }> = {
  ACCREDITED: { label: "Acreditada" },
  CONDITIONAL: { label: "Condicional" },
  SUSPENDED: { label: "Suspendida" },
  EXPIRED: { label: "Vencida" },
  NONE: { label: "Sin acreditación" },
};

// === DTO: Persona (catálogo) ==================================================

export const personSchema = z.object({
  id: z.string(),
  kind: personKindSchema,
  firstName: z.string(),
  lastName: z.string(),
  fullName: z.string(),
  nationalId: z.string().nullable(),
  personnelCode: z.string().nullable(),
  badgeId: z.string().nullable(),
  jobTitle: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  contractorCompanyId: z.string().nullable(),
  contractorCompanyName: z.string().nullable(),
  userId: z.string().nullable(),
  active: z.boolean(),
});
export type PersonDto = z.infer<typeof personSchema>;

export const upsertPersonRequestSchema = z
  .object({
    id: z.string().min(1).optional(), // presente = actualizar; ausente = crear
    kind: personKindSchema,
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    nationalId: z.string().trim().max(40).nullable().optional(),
    personnelCode: z.string().trim().max(60).nullable().optional(),
    badgeId: z.string().trim().max(60).nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    email: z.string().trim().email().max(160).nullable().optional().or(z.literal("")),
    phone: z.string().trim().max(40).nullable().optional(),
    contractorCompanyId: z.string().min(1).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => d.kind !== "CONTRACTOR" || !!d.contractorCompanyId, {
    message: "Una persona contratista debe pertenecer a una empresa contratista",
    path: ["contractorCompanyId"],
  });
export type UpsertPersonRequest = z.infer<typeof upsertPersonRequestSchema>;

/** Nombre completo canónico (denormalizado): "Apellido, Nombre" para orden alfabético. */
export function personFullName(firstName: string, lastName: string): string {
  return `${lastName.trim()}, ${firstName.trim()}`.trim();
}

// === DTO: Empresa contratista (catálogo) ======================================

export const contractorCompanySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  taxId: z.string().nullable(),
  accreditationStatus: accreditationStatusSchema,
  accreditationGrade: z.string().nullable(),
  accreditedUntil: z.string().nullable(),
  externalProvider: z.string().nullable(),
  accreditationNote: z.string().nullable(),
  active: z.boolean(),
  personCount: z.number().int(),
});
export type ContractorCompanyDto = z.infer<typeof contractorCompanySchema>;

export const upsertContractorCompanyRequestSchema = z.object({
  id: z.string().min(1).optional(),
  key: z.string().trim().min(1).max(60).optional(), // se deriva del nombre si falta (solo al crear)
  name: z.string().trim().min(1).max(160),
  taxId: z.string().trim().max(40).nullable().optional(),
  // Acreditación (inerte en S1, editable; el GATE se activa en S3):
  accreditationStatus: accreditationStatusSchema.optional(),
  accreditationGrade: z.string().trim().max(20).nullable().optional(),
  accreditedUntil: z.string().datetime().nullable().optional(),
  externalProvider: z.string().trim().max(40).nullable().optional(),
  accreditationNote: z.string().trim().max(500).nullable().optional(),
  active: z.boolean().optional(),
});
export type UpsertContractorCompanyRequest = z.infer<typeof upsertContractorCompanyRequestSchema>;

// === DTO: Rol de la dotación (catálogo configurable) ==========================

export const rosterRoleSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSupervisorRole: z.boolean(),
  mustRemainOutside: z.boolean(),
  color: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type RosterRoleDto = z.infer<typeof rosterRoleSchema>;

// === Semáforo por persona (derivado en vivo; forma final desde S1) ============

/** Nivel del semáforo por persona. */
export const WORKER_STATUS_LEVELS = ["ok", "warning", "blocked"] as const;
export type WorkerStatusLevel = (typeof WORKER_STATUS_LEVELS)[number];

/**
 * Causa de bloqueo/aviso por persona. Los ejes ORTOGONALES (no colapsar):
 *  - Eje A · Competencia: COMPETENCY_MISSING / COMPETENCY_EXPIRED / COMPETENCY_EXPIRING (S2).
 *  - Eje B · Autorización: NOT_AUTHORIZED / RESTRICTION_ACTIVE (S2).
 *  - Nivel empresa: COMPANY_NOT_ACCREDITED / COMPANY_ACCREDITATION_EXPIRING (S3).
 * En S1 solo puede darse ROLE_MISSING (rol requerido ausente, si se configura).
 */
export const WORKER_BLOCK_REASONS = [
  "ROLE_MISSING",
  "COMPETENCY_MISSING",
  "COMPETENCY_EXPIRED",
  "COMPETENCY_EXPIRING",
  "NOT_AUTHORIZED",
  "RESTRICTION_ACTIVE",
  "COMPANY_NOT_ACCREDITED",
  "COMPANY_ACCREDITATION_EXPIRING",
] as const;
export type WorkerBlockReason = (typeof WORKER_BLOCK_REASONS)[number];

export const WORKER_BLOCK_REASON_META: Record<WorkerBlockReason, { level: WorkerStatusLevel; label: string }> = {
  ROLE_MISSING: { level: "blocked", label: "Falta un rol requerido en la dotación" },
  COMPETENCY_MISSING: { level: "blocked", label: "Competencia requerida ausente" },
  COMPETENCY_EXPIRED: { level: "blocked", label: "Certificación vencida" },
  COMPETENCY_EXPIRING: { level: "warning", label: "Certificación por vencer" },
  NOT_AUTHORIZED: { level: "blocked", label: "Persona no autorizada/designada" },
  RESTRICTION_ACTIVE: { level: "blocked", label: "Restricción/veto activo" },
  COMPANY_NOT_ACCREDITED: { level: "blocked", label: "Empresa contratista no acreditada" },
  COMPANY_ACCREDITATION_EXPIRING: { level: "warning", label: "Acreditación de la empresa por vencer" },
};

/** Contexto de evaluación de una persona en la dotación (forma estable desde S1). */
export interface WorkerEvaluationContext {
  /** Causas ya detectadas por el backend (S2/S3 las llenan: competencias, veto, acreditación). */
  reasons?: WorkerBlockReason[];
}

export interface WorkerStatus {
  level: WorkerStatusLevel;
  reasons: WorkerBlockReason[];
}

/**
 * Evalúa el semáforo de una persona en la dotación. PURA (sin fecha/estado externo).
 * El nivel es el máximo de las causas: cualquier `blocked` ⇒ rojo; si no, cualquier
 * `warning` ⇒ ámbar; si no ⇒ verde. En S1 `reasons` viene vacío ⇒ verde.
 */
export function evaluateWorkerStatus(ctx: WorkerEvaluationContext): WorkerStatus {
  const reasons = ctx.reasons ?? [];
  let level: WorkerStatusLevel = "ok";
  for (const r of reasons) {
    const l = WORKER_BLOCK_REASON_META[r].level;
    if (l === "blocked") return { level: "blocked", reasons };
    if (l === "warning") level = "warning";
  }
  return { level, reasons };
}

// === DTO: persona en el roster de una OT ======================================

export const workOrderWorkerSchema = z.object({
  id: z.string(),
  workOrderId: z.string(),
  personId: z.string(),
  personName: z.string(),
  personKind: personKindSchema,
  contractorCompanyName: z.string().nullable(),
  rosterRoleId: z.string(),
  rosterRoleName: z.string(),
  isSupervisorRole: z.boolean(),
  note: z.string().nullable(),
  addedAt: z.string(),
  /** Semáforo derivado en vivo (S1: siempre "ok"; causas rojas en S2/S3). */
  status: z.object({
    level: z.enum(WORKER_STATUS_LEVELS),
    reasons: z.array(z.enum(WORKER_BLOCK_REASONS)),
  }),
});
export type WorkOrderWorkerDto = z.infer<typeof workOrderWorkerSchema>;

/** Estado de la dotación de una OT (para la pestaña y el gate). */
export const workOrderRosterSchema = z.object({
  /** ¿El tipo de la OT gestiona dotación? (WorkOrderType.rosterEnabled) */
  enabled: z.boolean(),
  workers: z.array(workOrderWorkerSchema),
  roles: z.array(rosterRoleSchema),
  confirmedAt: z.string().nullable(),
  confirmedById: z.string().nullable(),
  confirmedByName: z.string().nullable(),
  /** ¿Hay alguna persona en ROJO? (bloquea confirmar sin override — S2). */
  hasBlocked: z.boolean(),
});
export type WorkOrderRosterDto = z.infer<typeof workOrderRosterSchema>;

// === Requests de operación (Capa B, en la OT) =================================

export const addWorkOrderWorkerRequestSchema = z.object({
  personId: z.string().min(1),
  rosterRoleId: z.string().min(1),
  note: z.string().trim().max(300).nullable().optional(),
});
export type AddWorkOrderWorkerRequest = z.infer<typeof addWorkOrderWorkerRequestSchema>;

export const removeWorkOrderWorkerRequestSchema = z.object({
  reason: z.string().trim().max(300).nullable().optional(),
});
export type RemoveWorkOrderWorkerRequest = z.infer<typeof removeWorkOrderWorkerRequestSchema>;

/**
 * Confirmar (sellar) la dotación. FIRMADA (Part 11): re-autenticación del aprobador.
 * Traza OSHA 1910.146(e)(2) — la autorización de entrada del supervisor ES una firma.
 */
export const confirmRosterRequestSchema = z.object({
  password: z.string().min(1),
  mfaCode: z.string().trim().optional(),
});
export type ConfirmRosterRequest = z.infer<typeof confirmRosterRequestSchema>;

/** Significado de la firma de confirmación de dotación (Part 11). */
export const ROSTER_CONFIRM_SIGNATURE_MEANING = "Autorización de la dotación que ingresa a ejecutar el permiso";
