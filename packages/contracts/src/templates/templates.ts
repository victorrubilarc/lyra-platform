import { z } from "zod";
import {
  fieldConfigSchemaFor,
  fieldDataTypeSchema,
  fieldSemanticRoleSchema,
  fieldTypeSchema,
  recurrenceConfigSchema,
  recurrenceKindSchema,
  visibleWhenSchema,
} from "./field-types.js";

/**
 * Plantillas / Form Builder (Fase 2.1) — contratos compartidos.
 *
 * Modelo: `Template` (contenedor lógico mutable) 1—N `TemplateVersion`
 * (INMUTABLE al publicar, patrón MMR de 21 CFR Part 11) → `TemplateSection`
 * (unidad atómica de permiso/llenado/firma) → `TemplateField`.
 *
 * La maquinaria enterprise (flujo, firma Part 11, recurrencia) es OPT-IN: sus
 * campos viajan modelados aunque sus editores lleguen en 2.2/2.3. El LLENADO y
 * las tablas de EJECUCIÓN (LogEntry…) NO se construyen en 2.1.
 */

// Clave estable (sección/campo) dentro de una versión: identificador legible.
const keySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Use letras, números y guión bajo; debe iniciar con letra");

export const templateStatusSchema = z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]);
export type TemplateStatus = z.infer<typeof templateStatusSchema>;

/**
 * Ancla de la VENTANA DE EDICIÓN (Fase 2.7.2): desde qué instante corre el plazo
 * para editar una entrada.
 *  - RECORDED (default): desde la captura (`recordedAt`, inmutable). El operador
 *    siempre dispone de la ventana completa desde que crea la entrada — un registro
 *    diferido legítimo (2.7.0) no nace vencido.
 *  - EFFECTIVE: desde la fecha del evento (`effectiveAt`). Más estricta: un registro
 *    declarado tarde puede nacer fuera de ventana y exigir el override.
 */
export const EDIT_WINDOW_ANCHORS = ["RECORDED", "EFFECTIVE"] as const;
export const editWindowAnchorSchema = z.enum(EDIT_WINDOW_ANCHORS);
export type EditWindowAnchor = z.infer<typeof editWindowAnchorSchema>;

/**
 * Duración de la ventana de edición en MINUTOS (unidad canónica de almacenamiento;
 * la UI permite ingresarla en minutos u horas). Tri-estado a nivel de plantilla:
 * null = hereda la configuración global · 0 = SIN ventana (explícito) · >0 = ventana propia.
 * Tope 525600 = 365 días.
 */
export const editWindowMinutesSchema = z.number().int().min(0).max(525_600);

export const templateVersionStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export type TemplateVersionStatus = z.infer<typeof templateVersionStatusSchema>;

// === Entidades (forma de respuesta; fechas como ISO string) ==================

export const templateFieldSchema = z.object({
  id: z.string(),
  key: z.string(),
  type: fieldTypeSchema,
  /** Capa 2: tipo de dato (almacenamiento/reporte). Derivado del `type` en backend. */
  dataType: fieldDataTypeSchema,
  /** Capa 3: rol semántico opcional (effectiveDate/…). null = ninguno. */
  semanticRole: fieldSemanticRoleSchema.nullable(),
  label: z.string(),
  help: z.string().nullable(),
  required: z.boolean(),
  order: z.number().int(),
  /** Config por tipo (validada contra `fieldConfigSchemaFor` al escribir). */
  config: z.record(z.unknown()),
  visibleWhen: visibleWhenSchema.nullable(),
  /** Override por campo del permiso de la sección (vacío = hereda la sección). */
  roleIds: z.array(z.string()),
});
export type TemplateFieldDto = z.infer<typeof templateFieldSchema>;

export const templateSectionSchema = z.object({
  id: z.string(),
  key: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  order: z.number().int(),
  requireSignature: z.boolean(),
  editableInStateKey: z.string().nullable(),
  /** Roles que pueden llenar la sección (permiso por sección). */
  roleIds: z.array(z.string()),
  fields: z.array(templateFieldSchema),
});
export type TemplateSectionDto = z.infer<typeof templateSectionSchema>;

export const templateVersionSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  versionNumber: z.number().int(),
  status: templateVersionStatusSchema,
  name: z.string(),
  description: z.string().nullable(),
  // Referencias futuras (modeladas; editores en 2.2/2.3).
  workflowDefinitionId: z.string().nullable(),
  workflowDefinitionVersionId: z.string().nullable(),
  requireSignature: z.boolean(),
  recurrenceKind: recurrenceKindSchema,
  recurrenceConfig: z.unknown().nullable(),
  publishedAt: z.string().nullable(),
  sections: z.array(templateSectionSchema),
});
export type TemplateVersionDto = z.infer<typeof templateVersionSchema>;

export const templateSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  orgNodeId: z.string().nullable(),
  status: templateStatusSchema,
  currentVersionId: z.string().nullable(),
  /**
   * Ventana de edición (2.7.2) — GOBERNANZA VIVA en el contenedor mutable (patrón
   * SAP OB52 / Odoo lock dates: cambiarla aplica de inmediato a TODAS las entradas
   * de la plantilla, sin republicar). null = hereda el ancla/horas globales.
   */
  editWindowAnchor: editWindowAnchorSchema.nullable(),
  /** null = hereda global · 0 = sin ventana (explícito) · >0 = minutos propios. */
  editWindowMinutes: z.number().int().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TemplateDto = z.infer<typeof templateSchema>;

/** Ítem de listado: plantilla + conteos y números de versión para las cards. */
export const templateListItemSchema = templateSchema.extend({
  /** Ruta del nodo de la estructura (legible), si está anclada. */
  orgNodePath: z.string().nullable(),
  sectionCount: z.number().int(),
  fieldCount: z.number().int(),
  draftVersionNumber: z.number().int().nullable(),
  publishedVersionNumber: z.number().int().nullable(),
});
export type TemplateListItem = z.infer<typeof templateListItemSchema>;

/** Detalle: plantilla + la versión que se edita/visualiza (borrador o publicada). */
export const templateDetailSchema = templateSchema.extend({
  version: templateVersionSchema,
  /** Hay una versión en borrador editable (distinta de la publicada). */
  hasDraft: z.boolean(),
});
export type TemplateDetail = z.infer<typeof templateDetailSchema>;

// === Requests ================================================================

export const createTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1000).optional(),
  orgNodeId: z.string().nullable().optional(),
  editWindowAnchor: editWindowAnchorSchema.nullable().optional(),
  editWindowMinutes: editWindowMinutesSchema.nullable().optional(),
});
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

export const updateTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  orgNodeId: z.string().nullable().optional(),
  editWindowAnchor: editWindowAnchorSchema.nullable().optional(),
  editWindowMinutes: editWindowMinutesSchema.nullable().optional(),
});
export type UpdateTemplateRequest = z.infer<typeof updateTemplateRequestSchema>;

// --- Save del borrador (estructura completa del builder) ---------------------
// El orden de secciones/campos es el del arreglo (el backend asigna `order`).

export const draftFieldInputSchema = z
  .object({
    key: keySchema,
    type: fieldTypeSchema,
    // `dataType` NO viaja: el backend lo deriva de `type` (capa 2 = derivada).
    /** Rol semántico opcional (capa 3). En 2.1.1 el builder solo setea EFFECTIVE_DATE. */
    semanticRole: fieldSemanticRoleSchema.nullable().optional(),
    label: z.string().trim().min(1).max(200),
    help: z.string().trim().max(500).nullable().optional(),
    required: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
    visibleWhen: visibleWhenSchema.nullable().optional(),
    roleIds: z.array(z.string()).max(50).optional(),
  })
  .superRefine((field, ctx) => {
    const result = fieldConfigSchemaFor(field.type).safeParse(field.config ?? {});
    if (!result.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Configuración inválida para el tipo ${field.type}`,
        path: ["config"],
      });
    }
  });
export type DraftFieldInput = z.infer<typeof draftFieldInputSchema>;

export const draftSectionInputSchema = z
  .object({
    key: keySchema,
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(1000).nullable().optional(),
    requireSignature: z.boolean().optional(),
    editableInStateKey: z.string().trim().max(64).nullable().optional(),
    roleIds: z.array(z.string()).max(50).optional(),
    fields: z.array(draftFieldInputSchema).max(200),
  })
  .superRefine((section, ctx) => {
    const seen = new Set<string>();
    section.fields.forEach((f, i) => {
      if (seen.has(f.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Clave de campo duplicada: ${f.key}`,
          path: ["fields", i, "key"],
        });
      }
      seen.add(f.key);
    });
  });
export type DraftSectionInput = z.infer<typeof draftSectionInputSchema>;

export const saveTemplateDraftRequestSchema = z
  .object({
    // Metadata opcional (el builder puede guardarla junto a la estructura).
    name: z.string().trim().min(1).max(140).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    orgNodeId: z.string().nullable().optional(),
    // Ventana de edición (2.7.2): vive en el CONTENEDOR (gobernanza viva), pero el
    // builder la guarda por este mismo canal junto al resto de la metadata.
    editWindowAnchor: editWindowAnchorSchema.nullable().optional(),
    editWindowMinutes: editWindowMinutesSchema.nullable().optional(),
    requireSignature: z.boolean().optional(),
    recurrenceKind: recurrenceKindSchema.optional(),
    recurrenceConfig: recurrenceConfigSchema.nullable().optional(),
    // Flujo reutilizable asignado a la versión (Fase 2.2). null = sin flujo
    // (degradación elegante: form simple, todas las secciones siempre editables).
    // El backend valida que el flujo exista, esté publicado y que la versión
    // coincida con su versión publicada actual.
    workflowDefinitionId: z.string().nullable().optional(),
    workflowDefinitionVersionId: z.string().nullable().optional(),
    sections: z.array(draftSectionInputSchema).max(100),
  })
  .superRefine((body, ctx) => {
    const seen = new Set<string>();
    body.sections.forEach((s, i) => {
      if (seen.has(s.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Clave de sección duplicada: ${s.key}`,
          path: ["sections", i, "key"],
        });
      }
      seen.add(s.key);
    });

    // A lo sumo un campo puede ser la "fecha efectiva del registro" por versión
    // (promueve LogEntry.effectiveAt en 2.4).
    const effectiveDateFields: Array<[number, number]> = [];
    body.sections.forEach((s, si) => {
      s.fields.forEach((f, fi) => {
        if (f.semanticRole === "EFFECTIVE_DATE") effectiveDateFields.push([si, fi]);
      });
    });
    if (effectiveDateFields.length > 1) {
      for (const [si, fi] of effectiveDateFields) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Solo un campo puede ser la fecha efectiva del registro",
          path: ["sections", si, "fields", fi, "semanticRole"],
        });
      }
    }
  });
export type SaveTemplateDraftRequest = z.infer<typeof saveTemplateDraftRequestSchema>;

export const publishTemplateRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type PublishTemplateRequest = z.infer<typeof publishTemplateRequestSchema>;

export const templateListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: templateStatusSchema.optional(),
  orgNodeId: z.string().optional(),
});
export type TemplateListQuery = z.infer<typeof templateListQuerySchema>;
