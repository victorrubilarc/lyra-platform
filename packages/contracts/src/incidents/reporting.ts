import { z } from "zod";
import { incidentSeveritySchema } from "./incidents.js";

/**
 * Reportabilidad configurable de incidencias (Fase 4.3) — contratos compartidos
 * back↔front.
 *
 * Una incidencia puede gatillar uno o más REPORTES a una AUTORIDAD u obligación
 * (regulatoria, corporativa, contractual) con su PLAZO y seguimiento de estado. El
 * QUÉ se reporta y a QUIÉN es 100% CATÁLOGO configurable (`ReportingObligation`),
 * NUNCA lógica: los marcos concretos (DS 132, SERNAGEOMIN, ISO 14001, etc.) son
 * SEED por vertical, jamás hardcodeados en el código.
 *
 * Diseño (DECISIONS 2026-06-17):
 *  - Entidad dedicada espejo de CAPA/Investigación: catálogo `ReportingObligation`
 *    + materialización `IncidentReport` (N por incidencia). Auditable, consultable
 *    ("incidencias con reporte vencido" sale de un índice), multiplicidad real.
 *  - El alcance de datos (nodo) lo HEREDA de la incidencia (ABAC del módulo).
 *  - SIN permiso nuevo: el catálogo se gobierna con `incidentcatalog:manage` (es otro
 *    catálogo, como Tipos/Categorías); los reportes sobre una incidencia con
 *    `incident:edit` (gestión de su contenido, sin segregación de funciones como en
 *    la verificación CAPA).
 *  - BLOQUEA EL CIERRE gobernado por `ReportingObligation.mandatory` (el marco
 *    regulatorio declara si es legalmente vinculante): un reporte de obligación
 *    `mandatory` aún PENDIENTE bloquea el cierre; se resuelve enviándolo (SUBMITTED)
 *    o marcándolo NO APLICA (con motivo). Las no obligatorias solo ALERTAN. Lógica
 *    autoritativa compartida (`reportsBlockingClose`), espejo de
 *    `blockingActionsForClose` (CAPA).
 *  - "VENCIDO" se DERIVA (status PENDING && dueAt < now), sin estado persistido ni
 *    cron, igual que el SLA de permanencia y las rondas. El AVISO de plazo se apoya
 *    en el épico de notificaciones avanzadas (Fase 4.4, diferido).
 */

// === Vocabularios =============================================================

/** Estado del reporte de una incidencia. "Vencido" NO es estado: se deriva. */
export const INCIDENT_REPORT_STATUSES = ["PENDING", "SUBMITTED", "NOT_APPLICABLE", "CANCELED"] as const;
export const incidentReportStatusSchema = z.enum(INCIDENT_REPORT_STATUSES);
export type IncidentReportStatus = (typeof INCIDENT_REPORT_STATUSES)[number];

// === DTO: catálogo de obligaciones ============================================

/** Clave estable de una obligación (minúsculas, números y guiones). */
export const reportingObligationKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9-]+$/, "Usa solo minúsculas, números y guiones");

export const reportingObligationSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  /** Autoridad/obligado a quien se reporta (informativo). */
  authorityName: z.string().nullable(),
  /** Plazo por defecto en minutos desde la materialización (null = sin plazo). */
  defaultDueMinutes: z.number().int().nullable(),
  /** Tipos de incidencia a los que aplica. Vacío = TODOS los tipos. */
  appliesToTypeIds: z.array(z.string()),
  /** Nombres de los tipos aplicables (resueltos, para mostrar; vacío = todos). */
  appliesToTypeNames: z.array(z.string()),
  /** Severidad mínima a la que aplica (null = cualquiera). */
  minSeverity: incidentSeveritySchema.nullable(),
  /** ¿Es legalmente vinculante? Si sí, su reporte PENDIENTE bloquea el cierre. */
  mandatory: z.boolean(),
  active: z.boolean(),
  sortOrder: z.number().int(),
});
export type ReportingObligationDto = z.infer<typeof reportingObligationSchema>;

// === DTO: reporte materializado ===============================================

export const incidentReportSchema = z.object({
  id: z.string(),
  /** Folio humano "REP-####". */
  code: z.string(),
  incidentId: z.string(),
  obligationId: z.string(),
  /** Snapshot del nombre de la obligación en la materialización (integridad histórica). */
  obligationName: z.string(),
  authorityName: z.string().nullable(),
  /** Snapshot de la obligatoriedad: gobierna el bloqueo de cierre. */
  mandatory: z.boolean(),
  status: incidentReportStatusSchema,
  dueAt: z.string().nullable(),
  /** Derivado: ¿pendiente y con plazo vencido? */
  overdue: z.boolean(),
  // --- Envío (evidencia de cumplimiento) ---
  submittedAt: z.string().nullable(),
  submittedById: z.string().nullable(),
  submittedByName: z.string().nullable(),
  /** Folio/número externo entregado por la autoridad. */
  externalFolio: z.string().nullable(),
  notes: z.string().nullable(),
  // --- Anulación (sin borrado físico) ---
  canceledAt: z.string().nullable(),
  cancelReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type IncidentReportDto = z.infer<typeof incidentReportSchema>;

// === Requests: catálogo =======================================================

export const upsertReportingObligationRequestSchema = z.object({
  key: reportingObligationKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  authorityName: z.string().trim().max(160).nullable().optional(),
  defaultDueMinutes: z.number().int().min(0).max(525600).nullable().optional(),
  appliesToTypeIds: z.array(z.string().min(1)).max(100).optional(),
  minSeverity: incidentSeveritySchema.nullable().optional(),
  mandatory: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});
export type UpsertReportingObligationRequest = z.infer<typeof upsertReportingObligationRequestSchema>;

// === Requests: reportes de una incidencia =====================================

/** Agregar manualmente un reporte de una obligación a la incidencia. */
export const createIncidentReportRequestSchema = z.object({
  obligationId: z.string().min(1),
  /** Plazo (ISO). Ausente ⇒ se deriva de `defaultDueMinutes` de la obligación. */
  dueAt: z.string().datetime().nullable().optional(),
});
export type CreateIncidentReportRequest = z.infer<typeof createIncidentReportRequestSchema>;

/** Editar atributos de un reporte pendiente (plazo / notas). */
export const updateIncidentReportRequestSchema = z.object({
  dueAt: z.string().datetime().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateIncidentReportRequest = z.infer<typeof updateIncidentReportRequestSchema>;

/** Marcar enviado (PENDING → SUBMITTED): registra folio externo, fecha y notas. */
export const submitIncidentReportRequestSchema = z.object({
  /** Fecha/hora de envío (ISO). Ausente ⇒ momento del registro. */
  submittedAt: z.string().datetime().nullable().optional(),
  externalFolio: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type SubmitIncidentReportRequest = z.infer<typeof submitIncidentReportRequestSchema>;

/** Marcar NO APLICA (PENDING → NOT_APPLICABLE) con motivo auditado. */
export const markIncidentReportNotApplicableRequestSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type MarkIncidentReportNotApplicableRequest = z.infer<typeof markIncidentReportNotApplicableRequestSchema>;

/** Anular un reporte materializado por error (sin borrado físico). */
export const cancelIncidentReportRequestSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});
export type CancelIncidentReportRequest = z.infer<typeof cancelIncidentReportRequestSchema>;

// === Lógica compartida (back autoritativo; front la usa para avisar) ==========

/** Folio humano de un reporte a partir del correlativo. */
export function incidentReportCode(num: number): string {
  return `REP-${String(num).padStart(4, "0")}`;
}

/**
 * Obligaciones APLICABLES a una incidencia: activas, cuyo conjunto de tipos esté
 * vacío (todos) o incluya el tipo, y cuya severidad mínima (si la hay) no supere la
 * de la incidencia. Función PURA: el backend la usa para materializar reportes al
 * crear una incidencia reportable; el front, para previsualizar.
 */
export function applicableObligationsFor<
  T extends { appliesToTypeIds: ReadonlyArray<string>; minSeverity: number | null; active: boolean },
>(ctx: { typeId: string; severity: number }, obligations: ReadonlyArray<T>): T[] {
  return obligations.filter((o) => {
    if (!o.active) return false;
    if (o.appliesToTypeIds.length > 0 && !o.appliesToTypeIds.includes(ctx.typeId)) return false;
    if (o.minSeverity != null && ctx.severity < o.minSeverity) return false;
    return true;
  });
}

/** ¿El reporte está pendiente y con el plazo vencido? (derivado, sin estado persistido). */
export function isReportOverdue(
  report: { status: IncidentReportStatus; dueAt: string | Date | null },
  now: number = Date.now(),
): boolean {
  if (report.status !== "PENDING" || !report.dueAt) return false;
  const due = report.dueAt instanceof Date ? report.dueAt.getTime() : new Date(report.dueAt).getTime();
  return Number.isFinite(due) && due < now;
}

/**
 * Reportes que BLOQUEAN el cierre de la incidencia: los OBLIGATORIOS (`mandatory`)
 * que siguen PENDIENTES. Un reporte SUBMITTED, NOT_APPLICABLE o CANCELED nunca
 * bloquea (la obligación se resolvió o se descartó con motivo). Espejo de
 * `blockingActionsForClose` (CAPA).
 */
export function reportsBlockingClose<T extends { mandatory: boolean; status: IncidentReportStatus }>(
  reports: ReadonlyArray<T>,
): T[] {
  return reports.filter((r) => r.mandatory && r.status === "PENDING");
}
