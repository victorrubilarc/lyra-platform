import { z } from "zod";
import {
  deriveDataType,
  fieldConfigSchemaFor,
  fieldDataTypeSchema,
  colSpanSchema,
  gridXSchema,
  gridYSchema,
  gridHSchema,
  fieldSemanticRoleSchema,
  fieldTypeSchema,
  recurrenceConfigSchema,
  recurrenceKindSchema,
  visibleWhenSchema,
} from "./field-types.js";
import {
  computedFieldConfigSchema,
  crossRuleSchema,
  templateVersionRulesSchema,
  validateRulesDesign,
  type FieldForRules,
} from "../rules/rules.js";

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

/**
 * Modo de equipo por plantilla (Fase 2.8.0.2) — GOBERNANZA del objeto de referencia
 * EAM sobre la mecánica de 2.8.0.1. El TIPO de registro (la plantilla) decide cómo se
 * trata el equipo al crear una entrada, patrón notification-type de SAP PM / WO-type
 * de Maximo (el tipo decide si el objeto de referencia es obligatorio). Vive en el
 * CONTENEDOR mutable (`Template`), gobernanza VIVA: cambiarlo aplica de inmediato a las
 * entradas NUEVAS, sin republicar la versión (mismo patrón que la ventana de edición).
 *
 *  - NONE:      la plantilla no usa equipo; el selector NO se muestra al crear.
 *  - OPTIONAL:  el equipo se ofrece, "(sin equipo)" permitido; sin empuje (comportamiento
 *               histórico de 2.8.0.1 ⇒ default de migración).
 *  - SUGGESTED: igual que OPTIONAL en el BACKEND (permisivo, sin enforcement); la UI
 *               EMPUJA a elegir equipo (autoselecciona el único, "recomendado").
 *  - REQUIRED:  el equipo es OBLIGATORIO; el backend lo AUTORIZA en `create`/materialización
 *               (rechaza si falta), igual que el nodo. "(sin equipo)" no se ofrece.
 */
export const EQUIPMENT_MODES = ["NONE", "OPTIONAL", "SUGGESTED", "REQUIRED"] as const;
export const equipmentModeSchema = z.enum(EQUIPMENT_MODES);
export type EquipmentMode = z.infer<typeof equipmentModeSchema>;

export const templateVersionStatusSchema = z.enum(["DRAFT", "PUBLISHED"]);
export type TemplateVersionStatus = z.infer<typeof templateVersionStatusSchema>;

/**
 * Asignación de la plantilla a un NODO de la estructura (Fase 2.8.0 — multi-nodo).
 * Es el eje de NODO de la visibilidad de plantilla y la FUENTE DE VERDAD ÚNICA:
 * una plantilla es visible/usable en un nodo si ALGUNA de sus asignaciones lo
 * cubre (el nodo, o su subárbol si `includeDescendants`). Los 3 modos se componen
 * de filas: un nodo · varios nodos · "todos los hijos de X" (1 fila con
 * `includeDescendants`). CERO asignaciones = GLOBAL (visible en todo nodo),
 * consistente con la semántica PERMISIVA del ABAC.
 */
export const templateNodeAssignmentInputSchema = z.object({
  orgNodeId: z.string().min(1),
  includeDescendants: z.boolean(),
});
export type TemplateNodeAssignmentInput = z.infer<typeof templateNodeAssignmentInputSchema>;

/** Forma de respuesta: la asignación + la ruta legible del nodo para mostrar. */
export const templateNodeAssignmentSchema = templateNodeAssignmentInputSchema.extend({
  orgNodePath: z.string().nullable(),
});
export type TemplateNodeAssignmentDto = z.infer<typeof templateNodeAssignmentSchema>;

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
  /**
   * Campo FORMULADO (Req-7): expresión que DERIVA el valor (read-only). Vive en
   * la versión INMUTABLE (paralelo a `visibleWhen`, NO dentro de `config`).
   * null = campo tecleado normal. El valor se estampa al guardar y congela al sellar.
   */
  computed: computedFieldConfigSchema.nullable(),
  /**
   * Ancho del campo en columnas de la grilla de 12 (Fase 2.1.3). Hint de
   * PRESENTACIÓN puro; vive en la versión INMUTABLE. NO nullable: el backend mapea
   * 12 (ancho completo) por default, así el render nunca ramifica sobre null.
   */
  colSpan: colSpanSchema,
  /**
   * Geometría EXPLÍCITA en el lienzo de posicionamiento libre (Fase 2.1.7):
   * `gridX` columna (0..11), `gridY` fila lógica, `gridH` alto en filas; el ANCHO
   * es `colSpan` (= w). NULLABLE: null = plantilla legacy ⇒ el editor deriva la
   * geometría del orden + colSpan y la persiste al guardar.
   */
  gridX: gridXSchema.nullable(),
  gridY: gridYSchema.nullable(),
  gridH: gridHSchema.nullable(),
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
  /**
   * Reglas de validación CRUZADA entre campos (Req-7) — viven en la versión
   * INMUTABLE (cambiar una regla = nueva versión auditada, GxP). Cada regla =
   * `{key, when, severity, message}`. Vacío = sin reglas cruzadas.
   */
  rules: templateVersionRulesSchema,
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
  /**
   * Modo de equipo (2.8.0.2) — gobernanza del objeto de referencia EAM. No nullable:
   * siempre tiene un valor concreto (default OPTIONAL), no hereda de un global.
   */
  equipmentMode: equipmentModeSchema,
  /**
   * Campos de resumen en la grilla de Bitácoras (2.8.1a) — GOBERNANZA VIVA en el
   * contenedor mutable. Pool ORDENADO de `key` de campos candidatos a mostrarse
   * como "Resumen" en /bitacoras ("el diseñador ofrece, el usuario dispone"). Keyed
   * por el `key` ESTABLE del campo (no la versión inmutable): se aplica sin republicar.
   */
  gridFieldKeys: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TemplateDto = z.infer<typeof templateSchema>;

/** Tope del pool de campos de resumen (Fiori smart columns son acotadas; 2.8.1a). */
export const GRID_FIELD_KEYS_MAX = 6;
export const gridFieldKeysSchema = z
  .array(z.string().trim().min(1).max(120))
  .max(GRID_FIELD_KEYS_MAX)
  // Sin duplicados: el pool es un conjunto ordenado.
  .refine((keys) => new Set(keys).size === keys.length, { message: "No se permiten campos repetidos" });

/** Ítem de listado: plantilla + conteos y números de versión para las cards. */
export const templateListItemSchema = templateSchema.extend({
  /**
   * Ruta del nodo PRIMARIO (derivado, deprecado) — legible, si está anclada.
   * Para la visibilidad/alcance usa `nodeAssignments` (multi-nodo, 2.8.0).
   */
  orgNodePath: z.string().nullable(),
  /** Alcance de estructura: nodos asignados (vacío = GLOBAL). Fuente de verdad. */
  nodeAssignments: z.array(templateNodeAssignmentSchema),
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
  /** Alcance de estructura: nodos asignados (vacío = GLOBAL). Fuente de verdad. */
  nodeAssignments: z.array(templateNodeAssignmentSchema),
});
export type TemplateDetail = z.infer<typeof templateDetailSchema>;

// === Requests ================================================================

export const createTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(1000).optional(),
  /** @deprecated Nodo primario (derivado de `nodeAssignments`). Usar `nodeAssignments`. */
  orgNodeId: z.string().nullable().optional(),
  /** Alcance de estructura (2.8.0). Si se envía, REEMPLAZA el set. Vacío = GLOBAL. */
  nodeAssignments: z.array(templateNodeAssignmentInputSchema).max(200).optional(),
  editWindowAnchor: editWindowAnchorSchema.nullable().optional(),
  editWindowMinutes: editWindowMinutesSchema.nullable().optional(),
  /** Modo de equipo (2.8.0.2). Omitido = default OPTIONAL. */
  equipmentMode: equipmentModeSchema.optional(),
  /** Campos de resumen de grilla (2.8.1a). Si se envía, REEMPLAZA el set. Omitido = []. */
  gridFieldKeys: gridFieldKeysSchema.optional(),
});
export type CreateTemplateRequest = z.infer<typeof createTemplateRequestSchema>;

export const updateTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(140).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  /** @deprecated Nodo primario (derivado de `nodeAssignments`). Usar `nodeAssignments`. */
  orgNodeId: z.string().nullable().optional(),
  /** Alcance de estructura (2.8.0). Si se envía, REEMPLAZA el set. Vacío = GLOBAL. */
  nodeAssignments: z.array(templateNodeAssignmentInputSchema).max(200).optional(),
  editWindowAnchor: editWindowAnchorSchema.nullable().optional(),
  editWindowMinutes: editWindowMinutesSchema.nullable().optional(),
  /** Modo de equipo (2.8.0.2). Omitido = sin cambio. */
  equipmentMode: equipmentModeSchema.optional(),
  /** Campos de resumen de grilla (2.8.1a). Si se envía, REEMPLAZA el set. Omitido = sin cambio. */
  gridFieldKeys: gridFieldKeysSchema.optional(),
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
    /** Campo FORMULADO (Req-7): expresión que deriva el valor (read-only). null = tecleado. */
    computed: computedFieldConfigSchema.nullable().optional(),
    /** Ancho en columnas de la grilla de 12 (Fase 2.1.3). Ausente = 12 (ancho completo). */
    colSpan: colSpanSchema.optional(),
    /** Geometría en el lienzo (Fase 2.1.7): columna/fila/alto. Ausente = el backend deja null. */
    gridX: gridXSchema.nullable().optional(),
    gridY: gridYSchema.nullable().optional(),
    gridH: gridHSchema.nullable().optional(),
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
    // Un campo formulado es read-only ⇒ no tiene sentido marcarlo obligatorio (el
    // valor lo deriva el motor, no lo teclea nadie). SIGNATURE no admite fórmula.
    if (field.computed && field.type === "SIGNATURE") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Un campo de firma no puede ser formulado",
        path: ["computed"],
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
    /** @deprecated Nodo primario (derivado de `nodeAssignments`). Usar `nodeAssignments`. */
    orgNodeId: z.string().nullable().optional(),
    /** Alcance de estructura (2.8.0). Si se envía, REEMPLAZA el set. Vacío = GLOBAL. */
    nodeAssignments: z.array(templateNodeAssignmentInputSchema).max(200).optional(),
    // Ventana de edición (2.7.2): vive en el CONTENEDOR (gobernanza viva), pero el
    // builder la guarda por este mismo canal junto al resto de la metadata.
    editWindowAnchor: editWindowAnchorSchema.nullable().optional(),
    editWindowMinutes: editWindowMinutesSchema.nullable().optional(),
    /** Modo de equipo (2.8.0.2). Gobernanza viva en el contenedor; el builder la guarda aquí. */
    equipmentMode: equipmentModeSchema.optional(),
    requireSignature: z.boolean().optional(),
    recurrenceKind: recurrenceKindSchema.optional(),
    recurrenceConfig: recurrenceConfigSchema.nullable().optional(),
    // Flujo reutilizable asignado a la versión (Fase 2.2). null = sin flujo
    // (degradación elegante: form simple, todas las secciones siempre editables).
    // El backend valida que el flujo exista, esté publicado y que la versión
    // coincida con su versión publicada actual.
    workflowDefinitionId: z.string().nullable().optional(),
    workflowDefinitionVersionId: z.string().nullable().optional(),
    /** Reglas de validación CRUZADA de la versión (Req-7). Si se envía, REEMPLAZA el set. */
    rules: z.array(crossRuleSchema).max(100).optional(),
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

    // Motor de reglas (Req-7): valida fórmulas + reglas cruzadas de toda la versión
    // (refs a campos existentes, cotas de expresión, sin ciclos entre formulados).
    // Fallar en DISEÑO, nunca en llenado. La clave de campo debe ser ÚNICA en la
    // versión para que las `var(key)` no sean ambiguas entre secciones.
    const fieldsForRules: FieldForRules[] = [];
    const fieldKeySeen = new Set<string>();
    let dupKey = false;
    body.sections.forEach((s) => {
      s.fields.forEach((f) => {
        if (fieldKeySeen.has(f.key)) dupKey = true;
        fieldKeySeen.add(f.key);
        fieldsForRules.push({ key: f.key, dataType: deriveDataType(f.type), computed: f.computed ?? null });
      });
    });
    // Si hay claves de campo duplicadas a través de secciones, el análisis de
    // referencias sería ambiguo; se exige unicidad global SOLO si hay reglas/fórmulas.
    const hasRuleLogic = fieldsForRules.some((f) => f.computed) || (body.rules?.length ?? 0) > 0;
    if (hasRuleLogic && dupKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Con campos formulados o reglas, las claves de campo deben ser únicas en toda la plantilla",
        path: ["sections"],
      });
    }
    for (const err of validateRulesDesign(fieldsForRules, body.rules ?? [])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err.message, path: ["rules"] });
    }

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

/**
 * Acceso por ROL desde el lado de la PLANTILLA (vista recíproca del alcance por
 * plantilla, Fase 2.8): qué roles tienen esta plantilla en su alcance. Editar
 * aquí solo afecta las filas de ESTA plantilla — no toca el resto del alcance de
 * cada rol ni las asignaciones por usuario.
 */
export const templateRoleScopeOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  key: z.string(),
});
export type TemplateRoleScopeOption = z.infer<typeof templateRoleScopeOptionSchema>;

export const templateRoleScopeSchema = z.object({
  roles: z.array(templateRoleScopeOptionSchema),
  assignedRoleIds: z.array(z.string()),
});
export type TemplateRoleScope = z.infer<typeof templateRoleScopeSchema>;

export const assignTemplateRoleScopeRequestSchema = z.object({
  roleIds: z.array(z.string()),
});
export type AssignTemplateRoleScopeRequest = z.infer<typeof assignTemplateRoleScopeRequestSchema>;
