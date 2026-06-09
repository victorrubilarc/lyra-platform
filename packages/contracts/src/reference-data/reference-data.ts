import { z } from "zod";

/**
 * Datos de referencia / Listas (ReferenceList + ReferenceItem).
 *
 * Catálogo GOBERNADO de listas de valores reutilizables (modos de falla, turnos,
 * causas, contratistas…). NO es versionado-inmutable como Template/Workflow: es
 * un catálogo vivo estilo Equipment/Role (code estable + activar/desactivar +
 * sortOrder + borrado lógico). Ver docs/DECISIONS.md (2026-06-09).
 *
 * Regla de oro de reportabilidad (patrón dimensión de DW / FHIR Coding): el valor
 * que un campo persiste al llenar (Fase 2.4) es el **`code` estable, NO el label**.
 * Los reportes unen valor→ReferenceItem y traen label + metadata. Un code en uso
 * **no se borra: se desactiva** (preserva el histórico).
 *
 * `optionSource.referenceList.listKey` (de un campo SELECT/MULTISELECT, ver
 * `templates/field-types`) referencia una lista por su `key` estable —igual que
 * `editableInStateKey` referencia un estado de flujo por clave—. La integridad se
 * valida en backend (`TemplatesService.saveDraft`), no por FK: mantiene el config
 * en JSONB y la degradación elegante.
 */

// === Origen de la lista ======================================================

/**
 * MANUAL = administrada a mano en el mantenedor. EXTERNAL = alimentada/
 * sincronizada desde un Origen de Datos (ERP/MES/RRHH). En esta fase EXTERNAL
 * solo se MODELA; el motor de sync es Fase 3.
 */
export const REFERENCE_SOURCES = ["MANUAL", "EXTERNAL"] as const;
export const referenceSourceSchema = z.enum(REFERENCE_SOURCES);
export type ReferenceSource = z.infer<typeof referenceSourceSchema>;

/** Metadata enriquecida de un ítem (freeform). Ej: {isoCategory}, {rut}, {CAS}. */
export const referenceMetadataSchema = z.record(z.unknown());
export type ReferenceMetadata = z.infer<typeof referenceMetadataSchema>;

// === ReferenceItem ===========================================================

export const referenceItemSchema = z.object({
  id: z.string(),
  listId: z.string(),
  /** Clave estable, única dentro de la lista. Es lo que se persiste al llenar. */
  code: z.string(),
  label: z.string(),
  active: z.boolean(),
  /** Orden de presentación en pickers, relativo a la lista (asc). */
  sortOrder: z.number().int(),
  /** Atributos enriquecidos (jsonb freeform); null = sin metadata. */
  metadata: referenceMetadataSchema.nullable(),
  createdAt: z.string(),
});
export type ReferenceItem = z.infer<typeof referenceItemSchema>;

export const createReferenceItemRequestSchema = z.object({
  code: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(200),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  metadata: referenceMetadataSchema.nullable().optional(),
});
export type CreateReferenceItemRequest = z.infer<typeof createReferenceItemRequestSchema>;

export const updateReferenceItemRequestSchema = z.object({
  /** El code es estable; permitir cambiarlo solo mientras no haya uso (Fase 2.4). */
  code: z.string().trim().min(1).max(120).optional(),
  label: z.string().trim().min(1).max(200).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  metadata: referenceMetadataSchema.nullable().optional(),
});
export type UpdateReferenceItemRequest = z.infer<typeof updateReferenceItemRequestSchema>;

// === ReferenceList ===========================================================

export const referenceListSchema = z.object({
  id: z.string(),
  /** Clave estable y única; la referencia el `optionSource.referenceList.listKey`. */
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  source: referenceSourceSchema,
  active: z.boolean(),
  /** Orden de presentación del catálogo (asc). */
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Conteo de ítems vivos (para la grilla de listas). */
  itemCount: z.number().int().optional(),
});
export type ReferenceList = z.infer<typeof referenceListSchema>;

/** Lista con sus ítems embebidos (detalle del mantenedor). */
export const referenceListDetailSchema = referenceListSchema.extend({
  items: z.array(referenceItemSchema),
});
export type ReferenceListDetail = z.infer<typeof referenceListDetailSchema>;

/**
 * `key` de lista: estable y URL-safe (slug). Se valida estricto porque es la
 * clave de join que viaja en el JSONB del campo (`listKey`). Minúsculas, dígitos
 * y guiones; no editable tras la creación en la UI (igual que claves de flujo).
 */
export const referenceListKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Use minúsculas, dígitos y guiones (ej. failure-modes)");

export const createReferenceListRequestSchema = z.object({
  key: referenceListKeySchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  source: referenceSourceSchema.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
export type CreateReferenceListRequest = z.infer<typeof createReferenceListRequestSchema>;

export const updateReferenceListRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  source: referenceSourceSchema.optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
});
export type UpdateReferenceListRequest = z.infer<typeof updateReferenceListRequestSchema>;

// === Resolución de opciones (consumida por el Form Builder y, en 2.4, el llenado)

/**
 * Opción resuelta de una lista: el `code` que se persiste + el `label` que se
 * muestra + metadata opcional. El backend resuelve solo ítems ACTIVOS, ordenados.
 */
export const resolvedOptionSchema = z.object({
  code: z.string(),
  label: z.string(),
  metadata: referenceMetadataSchema.nullable().optional(),
});
export type ResolvedOption = z.infer<typeof resolvedOptionSchema>;
