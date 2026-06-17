import { z } from "zod";

/**
 * Acciones CAPA (correctivas / preventivas / inmediatas) de una incidencia
 * (Fase 4.2a) — contratos compartidos back↔front.
 *
 * Una ACCIÓN convierte el módulo de "registro" en "gestión con cierre verificado":
 * cada incidencia puede tener acciones con responsable, plazo, estado, evidencia y
 * VERIFICACIÓN DE EFICACIA. Una acción marcada `mandatory` BLOQUEA el cierre de la
 * incidencia mientras siga abierta (estándar CAPA: ISO 9001 §10.2, OHSAS/ISO 45001).
 *
 * Diseño (DECISIONS 2026-06-17):
 *  - Genérico/transversal: nada minero ni HSE hardcodeado (sirve a calidad,
 *    mantenimiento, ambiente, etc.). Las particularidades son catálogo/configuración.
 *  - El alcance de datos (nodo) lo HEREDA de la incidencia (ABAC del módulo).
 *  - Segregación de funciones: quien ejecuta una acción NO debería auto-verificarla
 *    (permiso `incident:action:verify` separado de `incident:action:manage`).
 *  - La evidencia (archivos) reusa el Storage Ola 3 (MinIO); en 4.2a se reserva el
 *    campo y se difiere la subida a un follow-up inmediato (la narrativa GxP queda
 *    cubierta por las notas de cierre/verificación).
 */

// === Vocabularios =============================================================

/** Naturaleza de la acción (CAPA + contención inmediata, práctica estándar). */
export const INCIDENT_ACTION_KINDS = ["CORRECTIVE", "PREVENTIVE", "IMMEDIATE"] as const;
export const incidentActionKindSchema = z.enum(INCIDENT_ACTION_KINDS);
export type IncidentActionKind = (typeof INCIDENT_ACTION_KINDS)[number];

/** Estado del ciclo de vida de la acción. */
export const INCIDENT_ACTION_STATUSES = ["OPEN", "IN_PROGRESS", "DONE", "VERIFIED", "CANCELED"] as const;
export const incidentActionStatusSchema = z.enum(INCIDENT_ACTION_STATUSES);
export type IncidentActionStatus = (typeof INCIDENT_ACTION_STATUSES)[number];

/** Resultado de la verificación de eficacia (CAPA). */
export const INCIDENT_ACTION_OUTCOMES = ["EFFECTIVE", "NOT_EFFECTIVE"] as const;
export const incidentActionOutcomeSchema = z.enum(INCIDENT_ACTION_OUTCOMES);
export type IncidentActionOutcome = (typeof INCIDENT_ACTION_OUTCOMES)[number];

/** Estados que cuentan como "abierta" (NO cerrada): pueden bloquear el cierre. */
export const OPEN_INCIDENT_ACTION_STATUSES: readonly IncidentActionStatus[] = ["OPEN", "IN_PROGRESS", "DONE"];

// === DTO ======================================================================

export const incidentActionSchema = z.object({
  id: z.string(),
  code: z.string(),
  incidentId: z.string(),
  kind: incidentActionKindSchema,
  title: z.string(),
  description: z.string().nullable(),
  /** Si está abierta, bloquea el cierre de la incidencia. */
  mandatory: z.boolean(),
  responsibleId: z.string().nullable(),
  responsibleName: z.string().nullable(),
  /** Grupo/rol responsable (alternativa o complemento a la persona). */
  responsibleRoleId: z.string().nullable(),
  responsibleRoleName: z.string().nullable(),
  dueAt: z.string().nullable(),
  status: incidentActionStatusSchema,
  /** Derivado: ¿está abierta y con plazo vencido? */
  overdue: z.boolean(),
  completedAt: z.string().nullable(),
  completedById: z.string().nullable(),
  completedByName: z.string().nullable(),
  completionNote: z.string().nullable(),
  // --- Verificación de eficacia ---
  verifiedAt: z.string().nullable(),
  verifiedById: z.string().nullable(),
  verifiedByName: z.string().nullable(),
  effectivenessOutcome: incidentActionOutcomeSchema.nullable(),
  verificationNote: z.string().nullable(),
  /** Causa raíz que esta acción ATIENDE (Fase 4.2b; null = ninguna / contención). */
  investigationStepId: z.string().nullable(),
  /** Enunciado de la causa raíz ligada (para mostrar sin re-consultar). */
  investigationStepLabel: z.string().nullable(),
  canceledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IncidentActionDto = z.infer<typeof incidentActionSchema>;

// === Requests =================================================================

export const createIncidentActionRequestSchema = z.object({
  kind: incidentActionKindSchema,
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  mandatory: z.boolean().optional(),
  responsibleId: z.string().min(1).nullable().optional(),
  responsibleRoleId: z.string().min(1).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  /** Causa raíz (paso de la investigación) que esta acción atiende. */
  investigationStepId: z.string().min(1).nullable().optional(),
});
export type CreateIncidentActionRequest = z.infer<typeof createIncidentActionRequestSchema>;

export const updateIncidentActionRequestSchema = z.object({
  kind: incidentActionKindSchema.optional(),
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  mandatory: z.boolean().optional(),
  responsibleId: z.string().min(1).nullable().optional(),
  responsibleRoleId: z.string().min(1).nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  investigationStepId: z.string().min(1).nullable().optional(),
  /** Cambio de estado entre los NO terminales (OPEN ↔ IN_PROGRESS). */
  status: z.enum(["OPEN", "IN_PROGRESS"]).optional(),
});
export type UpdateIncidentActionRequest = z.infer<typeof updateIncidentActionRequestSchema>;

/** Marcar una acción como realizada (DONE), con nota de cierre opcional. */
export const completeIncidentActionRequestSchema = z.object({
  completionNote: z.string().trim().max(5000).nullable().optional(),
});
export type CompleteIncidentActionRequest = z.infer<typeof completeIncidentActionRequestSchema>;

/** Verificar la eficacia (DONE → VERIFIED). Segregación de funciones (permiso aparte). */
export const verifyIncidentActionRequestSchema = z.object({
  effectivenessOutcome: incidentActionOutcomeSchema,
  verificationNote: z.string().trim().max(5000).nullable().optional(),
});
export type VerifyIncidentActionRequest = z.infer<typeof verifyIncidentActionRequestSchema>;

export const cancelIncidentActionRequestSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type CancelIncidentActionRequest = z.infer<typeof cancelIncidentActionRequestSchema>;

// === Lógica compartida (back autoritativo; front la usa para avisar) ===========

/** ¿La acción está abierta (no cerrada/cancelada/verificada)? */
export function isOpenIncidentAction(status: IncidentActionStatus): boolean {
  return OPEN_INCIDENT_ACTION_STATUSES.includes(status);
}

/**
 * ¿Hay acciones OBLIGATORIAS aún abiertas? Si sí, el cierre de la incidencia debe
 * bloquearse. "Abierta" = OPEN/IN_PROGRESS/DONE (DONE sin verificar también bloquea
 * cuando se exige verificación; ver `blockingActionsForClose`).
 */
export function hasOpenMandatoryActions(
  actions: ReadonlyArray<{ mandatory: boolean; status: IncidentActionStatus }>,
): boolean {
  return actions.some((a) => a.mandatory && isOpenIncidentAction(a.status));
}

/**
 * Acciones que BLOQUEAN el cierre. Una acción obligatoria bloquea si:
 *  - sigue abierta (OPEN/IN_PROGRESS), o
 *  - está DONE pero se exige verificación de eficacia (`requireVerification`) y aún
 *    no fue verificada.
 * Las VERIFIED/CANCELED nunca bloquean.
 */
export function blockingActionsForClose<T extends { mandatory: boolean; status: IncidentActionStatus }>(
  actions: ReadonlyArray<T>,
  requireVerification: boolean,
): T[] {
  return actions.filter((a) => {
    if (!a.mandatory) return false;
    if (a.status === "OPEN" || a.status === "IN_PROGRESS") return true;
    if (a.status === "DONE") return requireVerification;
    return false; // VERIFIED | CANCELED
  });
}

/** Folio humano de una acción a partir del correlativo. */
export function incidentActionCode(num: number): string {
  return `ACT-${String(num).padStart(4, "0")}`;
}
