import { z } from "zod";

/**
 * Contrato de lectura de la bitácora de auditoría (`GET /security/audit`).
 *
 * El AuditLog es append-only e inmutable a nivel de base (trigger Postgres que
 * rechaza UPDATE/DELETE). Aquí solo se modela su forma de LECTURA para la UI; el
 * backend nunca acepta escrituras desde el cliente. Los campos `before`/`after`/
 * `metadata` son JSON arbitrario (snapshots), por eso `unknown` y no un shape fijo.
 */
export const auditLogEntrySchema = z.object({
  id: z.string(),
  /** Marca temporal del evento (ISO 8601). */
  occurredAt: z.string(),
  /** Snapshot del actor: puede ser null si fue un evento del sistema. */
  actorId: z.string().nullable(),
  actorEmail: z.string().nullable(),
  /** Acción en notación punteada, ej. "user.created", "role.updated". */
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  /** Estado anterior (para diff); JSON arbitrario o null. */
  before: z.unknown().nullable(),
  /** Estado posterior (para diff); JSON arbitrario o null. */
  after: z.unknown().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  /** Metadatos adicionales del evento; JSON arbitrario o null. */
  metadata: z.unknown().nullable(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

/** Parámetros de consulta de la auditoría (paginación por cursor + filtros). */
export const auditQuerySchema = z.object({
  /** Cuántos registros traer (1–200, def. 50 en el backend). */
  take: z.number().int().min(1).max(200).optional(),
  /** `id` del último registro de la página anterior (paginación hacia atrás en el tiempo). */
  cursor: z.string().optional(),
  /** Desde (ISO 8601 inclusive). */
  from: z.string().optional(),
  /** Hasta (ISO 8601 inclusive). */
  to: z.string().optional(),
  /** Coincidencia parcial en la acción (insensible a mayúsculas). */
  action: z.string().optional(),
  /** Coincidencia parcial en el correo del actor. */
  actor: z.string().optional(),
  /** Coincidencia parcial en el tipo de entidad (User, Role, OrgNode…). */
  entityType: z.string().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

/** Filtros de auditoría que maneja la UI (sin paginación). */
export type AuditFilters = Omit<AuditQuery, "take" | "cursor">;
