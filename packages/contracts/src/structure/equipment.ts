import { z } from "zod";

/**
 * Equipos (Equipment) y su catálogo de clasificación (EquipmentCategory).
 *
 * Un equipo es la unidad operacional (máquina) que cuelga de un nodo de la
 * estructura (típicamente el de último nivel: Proceso). Patrón SAP PM:
 * Functional Location (OrgNode) 1:N Equipment. Ver docs/DECISIONS.md.
 *
 * Diseño integration-ready: la plataforma conversará con historiadores/MES/EAM
 * (PI System, OPC UA, SAP PM, Maximo). Un equipo mapea a VARIOS sistemas a la
 * vez, por lo que los mapeos viven en `ExternalReference` (polimórfica), no en
 * un `externalCode` único. El MOTOR de integración es Fase 3 (Orígenes de datos).
 */

// === Catálogo de categorías / clases de equipo (configurable) ================

export const equipmentCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Código corto interno opcional, p. ej. "MOTOR". */
  code: z.string().nullable(),
  /** Referencia opcional a una taxonomía externa (ej. clase ISO 14224). */
  isoRef: z.string().nullable(),
  description: z.string().nullable(),
  /** Orden de presentación en pickers/informes, relativo al catálogo (asc). */
  reportOrder: z.number().int(),
  active: z.boolean(),
});
export type EquipmentCategory = z.infer<typeof equipmentCategorySchema>;

export const createEquipmentCategoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().max(40).optional(),
  isoRef: z.string().trim().max(40).optional(),
  description: z.string().trim().max(500).optional(),
  reportOrder: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional(),
});
export type CreateEquipmentCategoryRequest = z.infer<
  typeof createEquipmentCategoryRequestSchema
>;

export const updateEquipmentCategoryRequestSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  code: z.string().trim().max(40).nullable().optional(),
  isoRef: z.string().trim().max(40).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  reportOrder: z.number().int().min(0).max(100000).optional(),
  active: z.boolean().optional(),
});
export type UpdateEquipmentCategoryRequest = z.infer<
  typeof updateEquipmentCategoryRequestSchema
>;

// === Equipos =================================================================

/** Criticidad 1–5 (RCM / ISO 14224). Reusa la escala de severidad del DS. */
export const EQUIPMENT_CRITICALITY = [1, 2, 3, 4, 5] as const;

export const equipmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  /** Código corto interno opcional, p. ej. "MOLD-01". */
  code: z.string().nullable(),
  /** assetTag estable y único: clave de negocio y de reportes. */
  tag: z.string().nullable(),
  description: z.string().nullable(),
  categoryId: z.string().nullable(),
  manufacturer: z.string().nullable(),
  model: z.string().nullable(),
  serialNumber: z.string().nullable(),
  /** Criticidad 1–5 (RCM/ISO 14224); null = sin clasificar. */
  criticality: z.number().int().min(1).max(5).nullable(),
  /** Estado operacional (en servicio / fuera de servicio). */
  active: z.boolean(),
  /** Orden en informes, relativo a los equipos del mismo nodo (asc). */
  reportOrder: z.number().int(),
  /** Nodo de la estructura al que pertenece (proceso / último nivel). */
  orgNodeId: z.string(),
  createdAt: z.string(),
});
export type Equipment = z.infer<typeof equipmentSchema>;

export const createEquipmentRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).optional(),
  tag: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  categoryId: z.string().nullable().optional(),
  manufacturer: z.string().trim().max(120).optional(),
  model: z.string().trim().max(120).optional(),
  serialNumber: z.string().trim().max(120).optional(),
  criticality: z.number().int().min(1).max(5).nullable().optional(),
  active: z.boolean().optional(),
  reportOrder: z.number().int().min(0).max(100000).optional(),
  orgNodeId: z.string().min(1),
});
export type CreateEquipmentRequest = z.infer<typeof createEquipmentRequestSchema>;

export const updateEquipmentRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  code: z.string().trim().max(40).nullable().optional(),
  tag: z.string().trim().max(80).nullable().optional(),
  description: z.string().trim().max(500).nullable().optional(),
  categoryId: z.string().nullable().optional(),
  manufacturer: z.string().trim().max(120).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  serialNumber: z.string().trim().max(120).nullable().optional(),
  criticality: z.number().int().min(1).max(5).nullable().optional(),
  active: z.boolean().optional(),
  reportOrder: z.number().int().min(0).max(100000).optional(),
  /** Reasignar el equipo a otro nodo de la estructura. */
  orgNodeId: z.string().min(1).optional(),
});
export type UpdateEquipmentRequest = z.infer<typeof updateEquipmentRequestSchema>;

// === Referencias externas (integration-ready) ================================
//
// Modelo polimórfico (dueño orgNodeId XOR equipmentId, check constraint en la
// migración — mismo patrón que Scope). Esta sesión define SOLO el modelo y los
// tipos; la UI de mapeos y el motor de sincronización llegan en Fase 3.

/**
 * `systemType` se valida contra un catálogo configurable que se define en Fase 3
 * (cuando llegan el motor de integración y su UI). Aquí es una cadena estable
 * para no hardcodear el universo de sistemas. Ejemplos conocidos abajo.
 */
export const KNOWN_EXTERNAL_SYSTEM_TYPES = [
  "PI_WEB_API",
  "OPC_UA",
  "SAP_PM",
  "MAXIMO",
  "GENERIC",
] as const;

export const externalReferenceSchema = z.object({
  id: z.string(),
  orgNodeId: z.string().nullable(),
  equipmentId: z.string().nullable(),
  systemType: z.string(),
  externalId: z.string().nullable(),
  externalPath: z.string().nullable(),
  endpoint: z.string().nullable(),
  metadata: z.unknown().nullable(),
  enabled: z.boolean(),
  createdAt: z.string(),
});
export type ExternalReference = z.infer<typeof externalReferenceSchema>;
