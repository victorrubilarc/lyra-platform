import { z } from "zod";
import { isValidRut } from "../templates/field-types.js";

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

/**
 * Tipo de documento de identidad. Contempla personas EXTRANJERAS (no sólo RUT chileno):
 * el RUT se valida (módulo 11) y se formatea; los demás son texto libre.
 */
export const ID_DOCUMENT_TYPES = ["RUT", "PASSPORT", "DNI", "OTHER"] as const;
export const idDocumentTypeSchema = z.enum(ID_DOCUMENT_TYPES);
export type IdDocumentType = (typeof ID_DOCUMENT_TYPES)[number];

export const ID_DOCUMENT_TYPE_META: Record<IdDocumentType, { label: string }> = {
  RUT: { label: "RUT (Chile)" },
  PASSPORT: { label: "Pasaporte" },
  DNI: { label: "DNI / Cédula" },
  OTHER: { label: "Otro documento" },
};

/** Sexo/género de la persona (dato personal opcional — traza SAP HR IT0002 / Maximo Person). */
export const PERSON_GENDERS = ["MALE", "FEMALE", "OTHER", "UNSPECIFIED"] as const;
export const personGenderSchema = z.enum(PERSON_GENDERS);
export type PersonGender = (typeof PERSON_GENDERS)[number];

export const PERSON_GENDER_META: Record<PersonGender, { label: string }> = {
  MALE: { label: "Masculino" },
  FEMALE: { label: "Femenino" },
  OTHER: { label: "Otro" },
  UNSPECIFIED: { label: "Prefiere no indicar" },
};

/** Edad en años a partir de la fecha de nacimiento (ISO). Pura; null si no hay fecha. */
export function personAge(birthDateIso: string | null | undefined, nowMs: number): number | null {
  if (!birthDateIso) return null;
  const b = new Date(birthDateIso);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date(nowMs);
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const m = now.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < b.getUTCDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

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
  nationalIdType: idDocumentTypeSchema.nullable(),
  nationalId: z.string().nullable(),
  personnelCode: z.string().nullable(),
  badgeId: z.string().nullable(),
  jobTitle: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  // Datos personales opcionales (traza SAP HR IT0002 / Maximo Person).
  birthDate: z.string().nullable(),
  gender: personGenderSchema.nullable(),
  nationality: z.string().nullable(),
  contractorCompanyId: z.string().nullable(),
  contractorCompanyName: z.string().nullable(),
  userId: z.string().nullable(),
  active: z.boolean(),
  /** Restricciones/vetos activos y vigentes (Eje B). >0 = impedimento (rojo en la grilla). */
  activeRestrictions: z.number().int(),
  /** Competencias/certificaciones de la persona ya VENCIDAS. >0 = impedimento (rojo). */
  expiredCompetencies: z.number().int(),
});
export type PersonDto = z.infer<typeof personSchema>;

export const upsertPersonRequestSchema = z
  .object({
    id: z.string().min(1).optional(), // presente = actualizar; ausente = crear
    kind: personKindSchema,
    firstName: z.string().trim().min(1).max(120),
    lastName: z.string().trim().min(1).max(120),
    nationalIdType: idDocumentTypeSchema.nullable().optional(),
    nationalId: z.string().trim().max(40).nullable().optional(),
    personnelCode: z.string().trim().max(60).nullable().optional(),
    badgeId: z.string().trim().max(60).nullable().optional(),
    jobTitle: z.string().trim().max(120).nullable().optional(),
    email: z.string().trim().email().max(160).nullable().optional().or(z.literal("")),
    phone: z.string().trim().max(40).nullable().optional(),
    birthDate: z.string().datetime().nullable().optional(),
    gender: personGenderSchema.nullable().optional(),
    nationality: z.string().trim().max(80).nullable().optional(),
    contractorCompanyId: z.string().min(1).nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => d.kind !== "CONTRACTOR" || !!d.contractorCompanyId, {
    message: "Una persona contratista debe pertenecer a una empresa contratista",
    path: ["contractorCompanyId"],
  })
  .refine((d) => d.nationalIdType !== "RUT" || !d.nationalId?.trim() || isValidRut(d.nationalId), {
    message: "El RUT no es válido (dígito verificador incorrecto)",
    path: ["nationalId"],
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
}).refine((d) => !d.taxId?.trim() || isValidRut(d.taxId), {
  message: "El RUT de la empresa no es válido (dígito verificador incorrecto)",
  path: ["taxId"],
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

/**
 * Alta/edición de un ROL de dotación (catálogo CONFIGURABLE — traza OSHA 1910.146: el
 * cliente puede renombrar los 3 estándar [entry supervisor/attendant-vigía/authorized
 * entrant] o agregar los suyos). `isSupervisorRole` marca a quien autoriza/firma la
 * entrada [(f)(6)/(e)(2)]; `mustRemainOutside` la semántica de vigía [(i)(4)].
 */
export const upsertRosterRoleRequestSchema = z.object({
  id: z.string().min(1).optional(), // presente = editar; ausente = crear
  key: z.string().trim().min(1).max(60).optional(), // se deriva del nombre al crear si falta
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  isSupervisorRole: z.boolean().optional(),
  mustRemainOutside: z.boolean().optional(),
  color: z.string().trim().max(32).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertRosterRoleRequest = z.infer<typeof upsertRosterRoleRequestSchema>;

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
  "COMPANY_ACCREDITATION_CONDITIONAL",
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
  // Nivel EMPRESA (S3): no acreditada / suspendida / vencida = ROJO (Avetta non-compliant
  // impide trabajar). CONDITIONAL = ÁMBAR (Avetta conditional / ISN grado B: pasa marcado,
  // "retrasa" pero no impide). Por vencer = ÁMBAR (ISN 90-day flag).
  COMPANY_NOT_ACCREDITED: { level: "blocked", label: "Empresa contratista no acreditada" },
  COMPANY_ACCREDITATION_CONDITIONAL: { level: "warning", label: "Acreditación de la empresa condicional" },
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

// === Detalle legible de una causa del semáforo (para EXPLICAR el bloqueo) ======

/**
 * Una causa concreta del semáforo con contexto para redactar el mensaje que ve el
 * aprobador (§6.2: "qué le falta a quién"). Ej.: COMPETENCY_EXPIRED + "Trabajo en altura"
 * + expiresAt ⇒ "certificación 'Trabajo en altura' vencida el 12-05-2026". La fecha viaja
 * como ISO; la UI la formatea por locale (lib/format.ts).
 */
export const workerStatusDetailSchema = z.object({
  reason: z.enum(WORKER_BLOCK_REASONS),
  competencyTypeId: z.string().nullable().optional(),
  competencyTypeName: z.string().nullable().optional(),
  /** Vencimiento relevante (ISO) para COMPETENCY_EXPIRED/EXPIRING (null si no aplica). */
  expiresAt: z.string().nullable().optional(),
  /** Contexto de la restricción (RESTRICTION_ACTIVE). */
  restrictionType: z.string().nullable().optional(),
  restrictionReason: z.string().nullable().optional(),
  /** Contexto de la EMPRESA (COMPANY_NOT_ACCREDITED/CONDITIONAL/EXPIRING) — nivel empresa, S3. */
  companyName: z.string().nullable().optional(),
  accreditationStatus: accreditationStatusSchema.nullable().optional(),
  /** Vencimiento de la acreditación de la empresa (ISO) para EXPIRED/EXPIRING (null si no aplica). */
  accreditedUntil: z.string().nullable().optional(),
});
export type WorkerStatusDetail = z.infer<typeof workerStatusDetailSchema>;

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
  /** Semáforo derivado en vivo (S2: causas rojas de competencia/restricción por persona). */
  status: z.object({
    level: z.enum(WORKER_STATUS_LEVELS),
    reasons: z.array(z.enum(WORKER_BLOCK_REASONS)),
    /** Detalle legible por causa (para explicar el bloqueo en español). */
    details: z.array(workerStatusDetailSchema),
  }),
  /** Override gobernado (si se confirmó con la persona en ROJO — §6.3); null si no hubo. */
  override: z
    .object({
      reason: z.string(),
      byName: z.string().nullable(),
      at: z.string(),
    })
    .nullable(),
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
 * Excepción por persona: motivo de autorizar a alguien en ROJO (S2-B). El aprobador
 * registra un motivo por CADA persona en rojo; la confirmación entera se sella con UNA
 * firma (un acto de autorización = una firma; OSHA (e)(2)/Part 11).
 */
export const rosterOverrideRequestSchema = z.object({
  workerId: z.string().min(1),
  reason: z.string().trim().min(1).max(500),
});
export type RosterOverrideRequest = z.infer<typeof rosterOverrideRequestSchema>;

/**
 * Confirmar (sellar) la dotación. FIRMADA (Part 11): re-autenticación del aprobador.
 * Traza OSHA 1910.146(e)(2) — la autorización de entrada del supervisor ES una firma.
 * Si hay personas en ROJO, `overrides` debe traer un motivo por CADA una (S2-B); sin
 * rojos, se ignora.
 */
export const confirmRosterRequestSchema = z.object({
  password: z.string().min(1),
  mfaCode: z.string().trim().optional(),
  overrides: z.array(rosterOverrideRequestSchema).max(200).optional(),
});
export type ConfirmRosterRequest = z.infer<typeof confirmRosterRequestSchema>;

/** Significado de la firma de confirmación de dotación (Part 11). */
export const ROSTER_CONFIRM_SIGNATURE_MEANING = "Autorización de la dotación que ingresa a ejecutar el permiso";

/** Significado de la firma cuando la confirmación incluye override(s) de personas en rojo. */
export const ROSTER_OVERRIDE_SIGNATURE_MEANING =
  "Autorización de la dotación con excepción(es) documentada(s) para personas con impedimentos";

// ============================================================================
// DOTACIÓN · Slice 2 — competencias con vigencia, restricciones y reglas
// ============================================================================

/**
 * Ventana AMBAR por defecto ("por vencer"), en días, si el tipo de competencia no fija
 * su propia `warningLeadDays`. Traza: ISN recomienda flag a 90 días; las prácticas de
 * compliance avisan a 30/14/7 — 30 es un punto medio sensato y configurable por tipo.
 */
export const DEFAULT_COMPETENCY_WARNING_LEAD_DAYS = 30;

/**
 * Ventana ÁMBAR por defecto para la ACREDITACIÓN DE EMPRESA ("por vencer"), en días.
 * Traza: ISNetworld marca la acreditación con un "90-day flag" antes de vencer; re-acreditar
 * una empresa (re-revisión de prequalification) toma semanas, por lo que el margen es mayor
 * que el de una competencia individual (30 d). Fijo en S3 (config por empresa = over-eng).
 */
export const DEFAULT_ACCREDITATION_WARNING_LEAD_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// === Vocabulario: categoría de competencia ====================================

export const COMPETENCY_CATEGORIES = ["CERTIFICATION", "TRAINING", "MEDICAL_EXAM", "INDUCTION", "LICENSE"] as const;
export const competencyCategorySchema = z.enum(COMPETENCY_CATEGORIES);
export type CompetencyCategory = (typeof COMPETENCY_CATEGORIES)[number];

export const COMPETENCY_CATEGORY_META: Record<CompetencyCategory, { label: string; hint: string }> = {
  CERTIFICATION: { label: "Certificación", hint: "Certificado de competencia (p. ej. trabajo en altura, espacio confinado)" },
  TRAINING: { label: "Formación", hint: "Curso o capacitación (p. ej. LOTO, primeros auxilios)" },
  MEDICAL_EXAM: { label: "Examen médico", hint: "Vigilancia de salud (preocupacional/ocupacional, Ley 16.744 art.71)" },
  INDUCTION: { label: "Inducción", hint: "ODI / inducción de faena (DS 44 art.15; DS 132 SERNAGEOMIN)" },
  LICENSE: { label: "Licencia", hint: "Licencia habilitante (conducción, operación de equipo)" },
};

// === Vocabulario: tipo de restricción =========================================

export const RESTRICTION_TYPES = ["MEDICAL", "DISCIPLINARY", "SITE_BAN", "OTHER"] as const;
export const restrictionTypeSchema = z.enum(RESTRICTION_TYPES);
export type RestrictionType = (typeof RESTRICTION_TYPES)[number];

export const RESTRICTION_TYPE_META: Record<RestrictionType, { label: string }> = {
  MEDICAL: { label: "Médica (no apto)" },
  DISCIPLINARY: { label: "Disciplinaria" },
  SITE_BAN: { label: "Prohibición de acceso a faena" },
  OTHER: { label: "Otra" },
};

// === DTO: CompetencyType (catálogo) ===========================================

export const competencyTypeSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  category: competencyCategorySchema,
  defaultValidityDays: z.number().int().nullable(),
  requiresExpiry: z.boolean(),
  warningLeadDays: z.number().int().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type CompetencyTypeDto = z.infer<typeof competencyTypeSchema>;

export const upsertCompetencyTypeRequestSchema = z.object({
  id: z.string().min(1).optional(),
  key: z.string().trim().min(1).max(60).optional(), // se deriva del nombre al crear si falta
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(500).nullable().optional(),
  category: competencyCategorySchema,
  defaultValidityDays: z.number().int().min(1).max(36500).nullable().optional(),
  requiresExpiry: z.boolean().optional(),
  warningLeadDays: z.number().int().min(1).max(3650).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertCompetencyTypeRequest = z.infer<typeof upsertCompetencyTypeRequestSchema>;

// === DTO: PersonCompetency (la persona posee la competencia) ==================

/** Estado de vigencia DERIVADO de una competencia (nunca almacenado). */
export const COMPETENCY_VALIDITY_STATES = ["valid", "expiring", "expired", "no_expiry"] as const;
export type CompetencyValidityState = (typeof COMPETENCY_VALIDITY_STATES)[number];

export const COMPETENCY_VALIDITY_META: Record<CompetencyValidityState, { label: string; level: WorkerStatusLevel }> = {
  valid: { label: "Vigente", level: "ok" },
  expiring: { label: "Por vencer", level: "warning" },
  expired: { label: "Vencida", level: "blocked" },
  no_expiry: { label: "Sin vencimiento", level: "ok" },
};

export const personCompetencySchema = z.object({
  id: z.string(),
  personId: z.string(),
  competencyTypeId: z.string(),
  competencyTypeName: z.string(),
  category: competencyCategorySchema,
  issuedAt: z.string(),
  expiresAt: z.string().nullable(),
  certificateNumber: z.string().nullable(),
  issuedBy: z.string().nullable(),
  verifiedById: z.string().nullable(),
  verifiedByName: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  note: z.string().nullable(),
  /** Estado de vigencia derivado en vivo (para el badge de la fila). */
  validity: z.enum(COMPETENCY_VALIDITY_STATES),
  /** Fecha de ARCHIVADO (soft-delete) si fue quitada; null = vigente en el registro. */
  archivedAt: z.string().nullable(),
});
export type PersonCompetencyDto = z.infer<typeof personCompetencySchema>;

export const upsertPersonCompetencyRequestSchema = z
  .object({
    id: z.string().min(1).optional(), // presente = editar; ausente = crear (renovar = crear otra)
    competencyTypeId: z.string().min(1),
    issuedAt: z.string().datetime(),
    expiresAt: z.string().datetime().nullable().optional(),
    certificateNumber: z.string().trim().max(80).nullable().optional(),
    issuedBy: z.string().trim().max(160).nullable().optional(),
    note: z.string().trim().max(500).nullable().optional(),
    /** Marca la evidencia como verificada por el actor (ISO 45001 evidencia documentada). */
    markVerified: z.boolean().optional(),
  })
  .refine((d) => !d.expiresAt || d.expiresAt >= d.issuedAt, {
    message: "La fecha de vencimiento no puede ser anterior a la de emisión",
    path: ["expiresAt"],
  });
export type UpsertPersonCompetencyRequest = z.infer<typeof upsertPersonCompetencyRequestSchema>;

// === DTO: PersonRestriction (veto — Eje B) ====================================

export const personRestrictionSchema = z.object({
  id: z.string(),
  personId: z.string(),
  type: restrictionTypeSchema,
  reason: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  active: z.boolean(),
  /** ¿Está vigente ahora? (active && dentro de ventana). Derivado. */
  effective: z.boolean(),
  /** Fecha de ARCHIVADO (soft-delete) si fue levantada/quitada; null = vigente en el registro. */
  archivedAt: z.string().nullable(),
});
export type PersonRestrictionDto = z.infer<typeof personRestrictionSchema>;

export const upsertPersonRestrictionRequestSchema = z
  .object({
    id: z.string().min(1).optional(),
    type: restrictionTypeSchema,
    reason: z.string().trim().min(1).max(500),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((d) => !d.endsAt || !d.startsAt || d.endsAt >= d.startsAt, {
    message: "El fin de la restricción no puede ser anterior a su inicio",
    path: ["endsAt"],
  });
export type UpsertPersonRestrictionRequest = z.infer<typeof upsertPersonRestrictionRequestSchema>;

// === DTO: WorkOrderCompetencyRule (regla de requisito · catálogo) =============

export const workOrderCompetencyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  competencyTypeId: z.string(),
  competencyTypeName: z.string().nullable(),
  mandatory: z.boolean(),
  appliesToTypeIds: z.array(z.string()),
  appliesToTypeNames: z.array(z.string()),
  minCriticality: z.number().int().nullable(),
  specialtyId: z.string().nullable(),
  specialtyName: z.string().nullable(),
  requiresPtw: z.boolean().nullable(),
  /** Exigir sólo a cierto rol de la dotación (null = a toda la dotación). */
  appliesToRosterRoleId: z.string().nullable(),
  appliesToRosterRoleName: z.string().nullable(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type WorkOrderCompetencyRuleDto = z.infer<typeof workOrderCompetencyRuleSchema>;

export const upsertWorkOrderCompetencyRuleRequestSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(120),
  competencyTypeId: z.string().min(1),
  mandatory: z.boolean().optional(),
  appliesToTypeIds: z.array(z.string().min(1)).max(100).optional(),
  minCriticality: z.number().int().min(1).max(5).nullable().optional(),
  specialtyId: z.string().min(1).nullable().optional(),
  requiresPtw: z.boolean().nullable().optional(),
  appliesToRosterRoleId: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertWorkOrderCompetencyRuleRequest = z.infer<typeof upsertWorkOrderCompetencyRuleRequestSchema>;

// === Funciones PURAS (con specs) ==============================================

/**
 * Filtra las reglas de competencia aplicables a una OT por su contexto. ESPEJO EXACTO
 * de `applicableChecklistRules` (mismo shape de aplicabilidad). NO discrimina por rol:
 * el filtro por `appliesToRosterRoleId` es POR PERSONA y lo aplica `deriveWorkerReasons`.
 */
export function applicableCompetencyRules<
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

/** Estado de vigencia derivado de una competencia (epoch ms). PURA. */
export function competencyValidityState(
  expiresAtMs: number | null,
  nowMs: number,
  warningLeadDays: number,
): CompetencyValidityState {
  if (expiresAtMs == null) return "no_expiry";
  if (expiresAtMs <= nowMs) return "expired";
  if (expiresAtMs - nowMs <= warningLeadDays * MS_PER_DAY) return "expiring";
  return "valid";
}

/** Regla de competencia (subset) que consume la derivación por persona. */
export interface WorkerCompetencyRuleInput {
  competencyTypeId: string;
  competencyTypeName: string;
  mandatory: boolean;
  /** null = aplica a toda la dotación; si trae rol, sólo a quien tenga ese rol. */
  appliesToRosterRoleId: string | null;
  /** Ventana ámbar del tipo (null ⇒ usa el default). */
  warningLeadDays: number | null;
}

/** Competencia vigente-o-no que posee la persona (subset). */
export interface WorkerCompetencyInput {
  competencyTypeId: string;
  /** Vencimiento en epoch ms; null = sin vencimiento. */
  expiresAtMs: number | null;
}

/** Restricción activa+vigente de la persona (subset). */
export interface WorkerRestrictionInput {
  type: string;
  reason: string;
}

/**
 * Acreditación de la EMPRESA contratista de la persona (nivel empresa — S3). Sólo se evalúa
 * si `required` (el tipo de OT exige acreditación, `WorkOrderType.requireCompanyAccreditation`)
 * y la persona es CONTRATISTA con empresa. Traza Ley 16.744 art.66 bis + ISN/Avetta/Veriforce.
 */
export interface WorkerCompanyAccreditationInput {
  /** El tipo de la OT exige acreditación de empresa (toggle por tipo). */
  required: boolean;
  companyName: string | null;
  status: AccreditationStatus;
  /** Vencimiento de la acreditación en epoch ms; null = sin vencimiento declarado. */
  accreditedUntilMs: number | null;
  /** Ventana ámbar (null ⇒ usa `DEFAULT_ACCREDITATION_WARNING_LEAD_DAYS`). */
  warningLeadDays?: number | null;
}

/** Contexto de derivación de causas para UNA persona de la dotación. */
export interface DeriveWorkerReasonsContext {
  /** Reglas aplicables a la OT (ya filtradas por `applicableCompetencyRules`). */
  rules: ReadonlyArray<WorkerCompetencyRuleInput>;
  /** Roles de la persona en esta dotación (para el filtro `appliesToRosterRoleId`). */
  personRosterRoleIds: ReadonlyArray<string>;
  /** Competencias (no borradas) que posee la persona. */
  competencies: ReadonlyArray<WorkerCompetencyInput>;
  /** Restricciones activas y vigentes de la persona. */
  restrictions: ReadonlyArray<WorkerRestrictionInput>;
  /** Acreditación de la empresa contratista (nivel empresa — S3); null = no aplica. */
  company?: WorkerCompanyAccreditationInput | null;
  nowMs: number;
  defaultWarningLeadDays?: number;
}

/**
 * Deriva las causas del semáforo de UNA persona (Ejes A y B, ORTOGONALES). PURA.
 *  - Eje A · Competencia: por cada regla aplicable a la persona, exige una competencia del
 *    tipo VIGENTE. Falta ⇒ COMPETENCY_MISSING; todas vencidas ⇒ COMPETENCY_EXPIRED (ambas
 *    sólo si la regla es `mandatory` ⇒ bloquean). Vigente pero dentro de la ventana ⇒
 *    COMPETENCY_EXPIRING (ámbar, informativo, aunque la regla no sea obligatoria).
 *  - Eje B · Autorización: cualquier restricción activa+vigente ⇒ RESTRICTION_ACTIVE (rojo).
 *  - Nivel EMPRESA (S3): si el tipo de OT exige acreditación y la persona es contratista, la
 *    acreditación de su empresa se cruza EN VIVO ⇒ COMPANY_NOT_ACCREDITED (rojo: no acreditada/
 *    suspendida/vencida) · COMPANY_ACCREDITATION_CONDITIONAL (ámbar: condicional) ·
 *    COMPANY_ACCREDITATION_EXPIRING (ámbar: por vencer). Los tres ejes son ORTOGONALES.
 */
export function deriveWorkerReasons(ctx: DeriveWorkerReasonsContext): WorkerStatusDetail[] {
  const details: WorkerStatusDetail[] = [];
  const roleSet = new Set(ctx.personRosterRoleIds);
  const defWarn = ctx.defaultWarningLeadDays ?? DEFAULT_COMPETENCY_WARNING_LEAD_DAYS;
  for (const rule of ctx.rules) {
    // ¿La regla aplica a esta persona por su rol?
    if (rule.appliesToRosterRoleId != null && !roleSet.has(rule.appliesToRosterRoleId)) continue;
    const held = ctx.competencies.filter((c) => c.competencyTypeId === rule.competencyTypeId);
    const warn = rule.warningLeadDays ?? defWarn;
    // La "mejor" competencia = la de mayor vencimiento (null=sin vencimiento gana).
    const best = held.reduce<WorkerCompetencyInput | null>((acc, c) => {
      if (!acc) return c;
      if (c.expiresAtMs == null) return c;
      if (acc.expiresAtMs == null) return acc;
      return c.expiresAtMs > acc.expiresAtMs ? c : acc;
    }, null);
    if (!best) {
      if (rule.mandatory) {
        details.push({ reason: "COMPETENCY_MISSING", competencyTypeId: rule.competencyTypeId, competencyTypeName: rule.competencyTypeName });
      }
      continue;
    }
    const state = competencyValidityState(best.expiresAtMs, ctx.nowMs, warn);
    if (state === "expired") {
      if (rule.mandatory) {
        details.push({
          reason: "COMPETENCY_EXPIRED",
          competencyTypeId: rule.competencyTypeId,
          competencyTypeName: rule.competencyTypeName,
          expiresAt: best.expiresAtMs != null ? new Date(best.expiresAtMs).toISOString() : null,
        });
      }
    } else if (state === "expiring") {
      details.push({
        reason: "COMPETENCY_EXPIRING",
        competencyTypeId: rule.competencyTypeId,
        competencyTypeName: rule.competencyTypeName,
        expiresAt: best.expiresAtMs != null ? new Date(best.expiresAtMs).toISOString() : null,
      });
    }
  }
  for (const r of ctx.restrictions) {
    details.push({ reason: "RESTRICTION_ACTIVE", restrictionType: r.type, restrictionReason: r.reason });
  }
  // Eje EMPRESA (S3): sólo si el tipo exige acreditación y la persona trae empresa contratista.
  const co = ctx.company;
  if (co && co.required) {
    const warn = co.warningLeadDays ?? DEFAULT_ACCREDITATION_WARNING_LEAD_DAYS;
    const untilIso = co.accreditedUntilMs != null ? new Date(co.accreditedUntilMs).toISOString() : null;
    const base = { companyName: co.companyName, accreditationStatus: co.status, accreditedUntil: untilIso };
    if (co.status === "ACCREDITED" || co.status === "CONDITIONAL") {
      // Acreditada/condicional: el vencimiento manda. Vencida ⇒ rojo; por vencer ⇒ ámbar; si
      // no, una acreditación CONDICIONAL sigue siendo ámbar (pasa marcada, ISN B/Avetta conditional).
      if (co.accreditedUntilMs != null && co.accreditedUntilMs <= ctx.nowMs) {
        details.push({ reason: "COMPANY_NOT_ACCREDITED", ...base });
      } else if (co.accreditedUntilMs != null && co.accreditedUntilMs - ctx.nowMs <= warn * MS_PER_DAY) {
        details.push({ reason: "COMPANY_ACCREDITATION_EXPIRING", ...base });
      } else if (co.status === "CONDITIONAL") {
        details.push({ reason: "COMPANY_ACCREDITATION_CONDITIONAL", ...base });
      }
    } else {
      // SUSPENDED / EXPIRED / NONE ⇒ no acreditada (rojo). NONE = "sin acreditación": bajo un
      // tipo que la exige, el mandante no verificó el cumplimiento (Ley 16.744 art.66 bis).
      details.push({ reason: "COMPANY_NOT_ACCREDITED", ...base });
    }
  }
  return details;
}

/** Colapsa un conjunto de detalles al nivel del semáforo (blocked > warning > ok). PURA. */
export function workerStatusFromDetails(details: ReadonlyArray<WorkerStatusDetail>): WorkerStatus {
  return evaluateWorkerStatus({ reasons: details.map((d) => d.reason) });
}
