import { z } from "zod";

/**
 * Excepciones operacionales desde bitácoras (Fase 4.1) — contratos compartidos
 * back↔front. Materializan la capa explícita **Bitácora → Excepción → Incidencia**
 * (DECISIONS 2026-06-16): una lectura fuera de umbral / regla WARN / registro
 * manual deja de ser efímera y pasa a ser una entidad con ESTADO y TRIAGE.
 *
 * Principios:
 *  - El CONTEXTO se CONGELA en la detección (valor original, umbrales, campo,
 *    operador, turno, nodo, equipo). No se re-deriva: patrón `LogEntry`/`AuditLog`.
 *  - El valor ORIGINAL nunca se pierde; una corrección lo preserva (GxP/ALCOA+).
 *  - La excepción NO siempre crea incidencia: hay un paso de triage humano.
 *  - Single-tenant: aislamiento por NODO/PLANTILLA (ABAC), sin `tenantId`.
 */

// === Vocabularios =============================================================

/** Qué disparó la excepción. */
export const EXCEPTION_TRIGGERS = ["THRESHOLD_WARN", "THRESHOLD_CRIT", "RULE", "MANUAL"] as const;
export const exceptionTriggerSchema = z.enum(EXCEPTION_TRIGGERS);
export type ExceptionTrigger = (typeof EXCEPTION_TRIGGERS)[number];

/** Severidad operacional de la excepción (clasificación del prompt). */
export const EXCEPTION_THRESHOLD_TYPES = ["warning", "critical", "invalid"] as const;
export const exceptionThresholdTypeSchema = z.enum(EXCEPTION_THRESHOLD_TYPES);
export type ExceptionThresholdType = (typeof EXCEPTION_THRESHOLD_TYPES)[number];

/** Estado de triage (ciclo de vida de la excepción). */
export const EXCEPTION_STATUSES = ["OPEN", "ACKNOWLEDGED", "DISMISSED", "CONVERTED", "CORRECTED"] as const;
export const exceptionStatusSchema = z.enum(EXCEPTION_STATUSES);
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

/** ¿El estado de triage es TERMINAL (ya no requiere acción)? */
export function isExceptionResolved(status: ExceptionStatus): boolean {
  return status === "DISMISSED" || status === "CONVERTED" || status === "CORRECTED";
}

/** Mapea el `triggerKind` al `thresholdType` semántico (clasificación de severidad). */
export function thresholdTypeForTrigger(trigger: ExceptionTrigger, ruleSeverity?: string | null): ExceptionThresholdType {
  if (trigger === "THRESHOLD_CRIT") return "critical";
  if (trigger === "THRESHOLD_WARN") return "warning";
  if (trigger === "RULE") return ruleSeverity === "ERROR" ? "critical" : "warning";
  return "warning"; // MANUAL
}

// === DTO de excepción (listado + detalle) =====================================

/** Snapshot de las bandas de umbral efectivas en el momento de la detección. */
export const exceptionBandsSnapshotSchema = z.object({
  warnLow: z.number().nullable().optional(),
  warnHigh: z.number().nullable().optional(),
  critLow: z.number().nullable().optional(),
  critHigh: z.number().nullable().optional(),
});
export type ExceptionBandsSnapshot = z.infer<typeof exceptionBandsSnapshotSchema>;

export const logEntryExceptionSchema = z.object({
  id: z.string(),
  code: z.string(),
  // --- Origen del dato (contexto congelado) ---
  logEntryId: z.string(),
  logEntryNumber: z.number().int().nullable(),
  templateId: z.string().nullable(),
  templateName: z.string().nullable(),
  templateVersionId: z.string().nullable(),
  /** Sección de origen. NULL en excepciones de REGLA cruzada (no atan un campo único). */
  sectionKey: z.string().nullable(),
  sectionLabel: z.string().nullable(),
  /** Campo de origen. NULL en excepciones de REGLA cruzada (la corrección no aplica). */
  fieldKey: z.string().nullable(),
  fieldLabel: z.string().nullable(),
  fieldType: z.string().nullable(),
  unit: z.string().nullable(),
  /** Referencia a la celda de una TABLE/MATRIX (MVP: nivel de campo, suele ser null). */
  occurrenceRef: z.string().nullable(),
  // --- Valor ---
  originalValue: z.unknown().nullable(),
  bandsSnapshot: exceptionBandsSnapshotSchema.nullable(),
  // --- Disparador ---
  triggerKind: exceptionTriggerSchema,
  thresholdType: exceptionThresholdTypeSchema,
  ruleKey: z.string().nullable(),
  ruleVersionId: z.string().nullable(),
  ruleSeverity: z.string().nullable(),
  detail: z.string().nullable(),
  // --- Operacional (denormalizado) ---
  orgNodeId: z.string(),
  orgNodeName: z.string().nullable(),
  equipmentId: z.string().nullable(),
  equipmentTag: z.string().nullable(),
  shiftCode: z.string().nullable(),
  operatorId: z.string().nullable(),
  operatorName: z.string().nullable(),
  detectedAt: z.string(),
  entrySealedAt: z.string().nullable(),
  // --- Triage ---
  status: exceptionStatusSchema,
  triagedById: z.string().nullable(),
  triagedByName: z.string().nullable(),
  triagedAt: z.string().nullable(),
  dismissReason: z.string().nullable(),
  // --- Corrección (GxP) ---
  correctedValue: z.unknown().nullable(),
  correctionReason: z.string().nullable(),
  correctedById: z.string().nullable(),
  correctedByName: z.string().nullable(),
  correctedAt: z.string().nullable(),
  // --- Ligazón ---
  incidentId: z.string().nullable(),
  incidentCode: z.string().nullable(),
  incidentTitle: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LogEntryExceptionDto = z.infer<typeof logEntryExceptionSchema>;

// === Resumen para el panel en la bitácora ====================================

/** Conteo por severidad para el panel de revisión "N críticas · N advertencias · N inválidas". */
export const exceptionSummarySchema = z.object({
  total: z.number().int(),
  open: z.number().int(),
  critical: z.number().int(),
  warning: z.number().int(),
  invalid: z.number().int(),
});
export type ExceptionSummary = z.infer<typeof exceptionSummarySchema>;

// === Listado / filtros / paginación ==========================================

const csv = () =>
  z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : v),
    z.array(z.string()).max(50),
  );

export const exceptionListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: exceptionStatusSchema.optional(),
  /** Solo las pendientes de triage (OPEN/ACKNOWLEDGED). */
  openOnly: z.coerce.boolean().optional(),
  thresholdType: exceptionThresholdTypeSchema.optional(),
  triggerKind: exceptionTriggerSchema.optional(),
  logEntryId: z.string().optional(),
  /** Excepciones ligadas a una incidencia concreta (trazabilidad campo→excepción→incidencia). */
  incidentId: z.string().optional(),
  orgNodeIds: csv().optional(),
  equipmentId: z.string().optional(),
  /** Solo sin incidencia asociada. */
  unlinkedOnly: z.coerce.boolean().optional(),
  sort: z.enum(["recent", "severity"]).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
export type ExceptionListQuery = z.infer<typeof exceptionListQuerySchema>;

export const exceptionListResponseSchema = z.object({
  items: z.array(logEntryExceptionSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  summary: exceptionSummarySchema,
});
export type ExceptionListResponse = z.infer<typeof exceptionListResponseSchema>;

// === Requests de triage =======================================================

/** Reconocer (acuse de revisión sin descartar ni convertir). */
export const acknowledgeExceptionRequestSchema = z.object({
  note: z.string().trim().max(1000).optional(),
});
export type AcknowledgeExceptionRequest = z.infer<typeof acknowledgeExceptionRequestSchema>;

/** Descartar con motivo auditado (el descarte de una crítica exige permiso superior). */
export const dismissExceptionRequestSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type DismissExceptionRequest = z.infer<typeof dismissExceptionRequestSchema>;

/**
 * Corregir el valor que originó la excepción, preservando el original (GxP). El
 * backend valida el nuevo valor con `validateFieldValue` y aplica la ventana de
 * edición / `logentry:write-expired` igual que una edición normal.
 */
export const correctExceptionRequestSchema = z.object({
  correctedValue: z.unknown(),
  reason: z.string().trim().min(5).max(1000),
  /** Re-auth para entradas selladas (Part 11) si la política lo exige. */
  password: z.string().optional(),
  mfaCode: z.string().optional(),
});
export type CorrectExceptionRequest = z.infer<typeof correctExceptionRequestSchema>;

/**
 * Convertir una excepción (o varias) en una incidencia NUEVA. Reusa los campos
 * mínimos de creación de incidencia; el resto se prellena server-side desde el
 * contexto congelado (nodo/equipo/turno/origen EXCEPTION).
 */
export const convertExceptionRequestSchema = z.object({
  /** Excepciones a agrupar bajo la incidencia nueva (incluye la actual). */
  exceptionIds: z.array(z.string().min(1)).min(1).max(50),
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  typeId: z.string().min(1),
  categoryId: z.string().min(1).nullable().optional(),
  severity: z.number().int().min(1).max(5),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  ownerId: z.string().min(1).nullable().optional(),
});
export type ConvertExceptionRequest = z.infer<typeof convertExceptionRequestSchema>;

/** Asociar una (o varias) excepción(es) a una incidencia EXISTENTE. */
export const associateExceptionRequestSchema = z.object({
  exceptionIds: z.array(z.string().min(1)).min(1).max(50),
  incidentId: z.string().min(1),
});
export type AssociateExceptionRequest = z.infer<typeof associateExceptionRequestSchema>;

/** Registrar manualmente una excepción desde el llenado (registro del operador). */
export const createManualExceptionRequestSchema = z.object({
  logEntryId: z.string().min(1),
  sectionKey: z.string().min(1),
  fieldKey: z.string().min(1).optional(),
  detail: z.string().trim().min(3).max(1000),
});
export type CreateManualExceptionRequest = z.infer<typeof createManualExceptionRequestSchema>;

// === Sugerencia de deduplicación =============================================

/**
 * Incidencia ABIERTA candidata a agrupar la excepción (misma `(nodo, equipo,
 * tipo, ventana 24h)`). Es SUGERENCIA: nunca se asocia automáticamente.
 */
export const exceptionDedupeSuggestionSchema = z.object({
  incidentId: z.string(),
  code: z.string(),
  title: z.string(),
  currentStateName: z.string().nullable(),
  severity: z.number().int(),
  createdAt: z.string(),
});
export type ExceptionDedupeSuggestion = z.infer<typeof exceptionDedupeSuggestionSchema>;

/** Ventana (horas) de la sugerencia de dedup (fija en el MVP; configurable luego). */
export const EXCEPTION_DEDUPE_WINDOW_HOURS = 24;
