import { z } from "zod";

/**
 * Investigación de causa raíz de una incidencia (Fase 4.2b) — contratos
 * compartidos back↔front.
 *
 * La investigación documenta CÓMO se llegó a la(s) causa(s) raíz del evento. El
 * método inicial es **5 Porqués** (Toyota / Lean / ISO 45001 §10.2): una cadena
 * ORDENADA de preguntas "¿por qué?" que desciende del problema hasta una o más
 * causas raíz. No es ICAM/TapRooT/Bowtie (árboles multi-rama) — eso sería
 * sobreingeniería para el MVP; el enum de método deja la puerta abierta a
 * agregarlos como plantillas posteriores sin re-migrar.
 *
 * Diseño (DECISIONS 2026-06-17):
 *  - Genérico/transversal: nada minero ni HSE hardcodeado (sirve a calidad,
 *    mantenimiento, ambiente, seguridad, etc.). Las particularidades son catálogo.
 *  - El alcance de datos (nodo) lo HEREDA de la incidencia (ABAC del módulo).
 *  - SIN permiso nuevo: la investigación es parte de la GESTIÓN de la incidencia
 *    (no hay segregación de funciones como en la verificación CAPA); se gobierna con
 *    `incident:edit`. (Contraste con 4.2a, que sí creó permisos por la segregación
 *    ejecutar≠verificar.)
 *  - Conecta con CAPA: una acción (`IncidentAction.investigationStepId`) puede
 *    declarar qué CAUSA RAÍZ atiende (cierra el lazo problema→causa→acción, ISO 9001
 *    §10.2 / CAPA).
 *  - BLOQUEA EL CIERRE configurable: si el `IncidentType.requiresInvestigation`,
 *    no se cierra la incidencia sin una investigación COMPLETED con ≥1 causa raíz
 *    (espejo de cómo 4.2a honra `requiresCapa`). Lógica autoritativa compartida
 *    (`investigationBlocksClose`).
 */

// === Vocabularios =============================================================

/** Método de investigación. MVP = 5 Porqués; el enum es extensible. */
export const INCIDENT_INVESTIGATION_METHODS = ["FIVE_WHYS"] as const;
export const incidentInvestigationMethodSchema = z.enum(INCIDENT_INVESTIGATION_METHODS);
export type IncidentInvestigationMethod = (typeof INCIDENT_INVESTIGATION_METHODS)[number];

/** Estado de la investigación. */
export const INCIDENT_INVESTIGATION_STATUSES = ["DRAFT", "COMPLETED"] as const;
export const incidentInvestigationStatusSchema = z.enum(INCIDENT_INVESTIGATION_STATUSES);
export type IncidentInvestigationStatus = (typeof INCIDENT_INVESTIGATION_STATUSES)[number];

// === DTO ======================================================================

/** Un "porqué" de la cadena (ordenado). El terminal marca causa raíz. */
export const incidentInvestigationStepSchema = z.object({
  id: z.string(),
  order: z.number().int(),
  /** La pregunta "¿por qué?" (enunciado del paso). */
  statement: z.string(),
  answer: z.string().nullable(),
  isRootCause: z.boolean(),
});
export type IncidentInvestigationStepDto = z.infer<typeof incidentInvestigationStepSchema>;

export const incidentInvestigationSchema = z.object({
  id: z.string(),
  incidentId: z.string(),
  method: incidentInvestigationMethodSchema,
  status: incidentInvestigationStatusSchema,
  problemStatement: z.string(),
  rootCauseSummary: z.string().nullable(),
  conductedById: z.string().nullable(),
  conductedByName: z.string().nullable(),
  completedAt: z.string().nullable(),
  completedById: z.string().nullable(),
  completedByName: z.string().nullable(),
  steps: z.array(incidentInvestigationStepSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IncidentInvestigationDto = z.infer<typeof incidentInvestigationSchema>;

// === Requests =================================================================

/** Sub-paso al crear/reemplazar la cadena (sin id = nuevo; el orden lo da la posición). */
export const investigationStepInputSchema = z.object({
  statement: z.string().trim().min(3).max(1000),
  answer: z.string().trim().max(2000).nullable().optional(),
  isRootCause: z.boolean().optional(),
});
export type InvestigationStepInput = z.infer<typeof investigationStepInputSchema>;

/**
 * Crear o actualizar (upsert) la investigación de una incidencia. La cadena de
 * pasos se REEMPLAZA EN BLOQUE (el cliente envía el estado completo; patrón de
 * edición de listas del proyecto, p. ej. turnos del calendario). Solo en DRAFT.
 */
export const upsertIncidentInvestigationRequestSchema = z.object({
  method: incidentInvestigationMethodSchema.optional(),
  problemStatement: z.string().trim().min(3).max(2000),
  rootCauseSummary: z.string().trim().max(5000).nullable().optional(),
  conductedById: z.string().min(1).nullable().optional(),
  steps: z.array(investigationStepInputSchema).max(20),
});
export type UpsertIncidentInvestigationRequest = z.infer<typeof upsertIncidentInvestigationRequestSchema>;

/** Completar la investigación (DRAFT → COMPLETED). Exige ≥1 causa raíz (validado en server). */
export const completeIncidentInvestigationRequestSchema = z.object({
  rootCauseSummary: z.string().trim().max(5000).nullable().optional(),
});
export type CompleteIncidentInvestigationRequest = z.infer<typeof completeIncidentInvestigationRequestSchema>;

// === Lógica compartida (back autoritativo; el front la usa para avisar) ========

/** ¿La investigación cuenta con al menos una causa raíz marcada? */
export function hasRootCause(steps: ReadonlyArray<{ isRootCause: boolean }>): boolean {
  return steps.some((s) => s.isRootCause);
}

/**
 * ¿La investigación está lista para cerrar la incidencia? Completa = COMPLETED con
 * ≥1 causa raíz. Una causa raíz formal (paso marcado) es lo que ata las acciones
 * CAPA, por eso se exige (no basta con texto narrativo).
 */
export function isInvestigationComplete(
  investigation: { status: IncidentInvestigationStatus; steps: ReadonlyArray<{ isRootCause: boolean }> } | null | undefined,
): boolean {
  if (!investigation) return false;
  return investigation.status === "COMPLETED" && hasRootCause(investigation.steps);
}

/**
 * ¿La investigación BLOQUEA el cierre? Bloquea cuando el tipo la EXIGE
 * (`requiresInvestigation`) y aún no está completa. Si el tipo no la exige, nunca
 * bloquea (la investigación es opcional pero registrable). Espejo de
 * `blockingActionsForClose` (CAPA).
 */
export function investigationBlocksClose(
  requiresInvestigation: boolean,
  investigation: { status: IncidentInvestigationStatus; steps: ReadonlyArray<{ isRootCause: boolean }> } | null | undefined,
): boolean {
  if (!requiresInvestigation) return false;
  return !isInvestigationComplete(investigation);
}
