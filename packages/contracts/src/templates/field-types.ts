import { z } from "zod";

/**
 * Tipos de campo del Form Builder y su configuración por tipo.
 *
 * En 2.1 tienen editor completo los 8 tipos NÚCLEO; `SEVERITY` y `SIGNATURE`
 * quedan modelados (su comportamiento enterprise pleno —firma Part 11— es 2.5).
 * El resto de objetos del prototipo (radio, checklist, slider, foto, GPS, tabla,
 * activo/QR) se incorpora con su editor cuando toque.
 *
 * La configuración específica de cada tipo viaja en `TemplateField.config`
 * (JSONB) y se valida con el esquema correspondiente vía `fieldConfigSchemaFor`.
 */

export const FIELD_TYPES = [
  "NUMBER",
  "TEXT",
  "TEXTAREA",
  "SELECT",
  "MULTISELECT",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "SEVERITY",
  "SIGNATURE",
] as const;

export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/** Tipos con editor completo en 2.1 (los 8 núcleo del alcance). */
export const CORE_FIELD_TYPES = [
  "NUMBER",
  "TEXT",
  "TEXTAREA",
  "SELECT",
  "MULTISELECT",
  "BOOLEAN",
  "DATE",
  "DATETIME",
] as const satisfies readonly FieldType[];

// === Modelo de campo en 3 capas (Fase 2.1.1) ================================
//
// Un campo son tres capas separadas (estilo FHIR `item.type` + answerOption/
// answerValueSet, ver DECISIONS 2026-06-09):
//   1. Presentación/widget  → `type` (FieldType, arriba): cómo se ve.
//   2. Tipo de dato         → `dataType` (FieldDataType): cómo se almacena/
//      valida/reporta. Es DERIVADO del `type` (no lo edita el usuario) vía
//      `deriveDataType`. La UI sigue simple; el MODELO lleva la semántica.
//   3. Rol semántico        → `semanticRole` (FieldSemanticRole?, nullable):
//      qué significa para la plataforma (effectiveDate/title/…). null = ninguno.
//
// El almacenamiento/reporte sigue al `dataType`, no al widget. Para un campo de
// referencia, el valor que se persiste al llenar (Fase 2.4) es el **`code`
// estable, NO el label** (reportabilidad = patrón dimensión de DW / FHIR Coding).

/**
 * Tipo de dato (cómo se almacena/valida/reporta). Enum aditivo: incluye
 * valores sin productor aún (TIME/FILE/GEO/COMPUTED) para la taxonomía futura.
 */
export const FIELD_DATA_TYPES = [
  "STRING",
  "NUMBER",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "TIME",
  "CODE", // un code estable de una lista (dimensión reportable)
  "CODE_ARRAY", // varios codes
  "REFERENCE", // id de una entidad (equipo/usuario/nodo/firma)
  "FILE",
  "GEO",
  "COMPUTED",
] as const;
export const fieldDataTypeSchema = z.enum(FIELD_DATA_TYPES);
export type FieldDataType = z.infer<typeof fieldDataTypeSchema>;

/**
 * Rol semántico opcional (qué significa el campo para la plataforma). En 2.1.1
 * solo `EFFECTIVE_DATE` tiene comportamiento (promueve `LogEntry.effectiveAt`,
 * Fase 2.4); el resto queda modelado. null/ausente = sin rol.
 */
export const FIELD_SEMANTIC_ROLES = [
  "EFFECTIVE_DATE",
  "TITLE",
  "PRIMARY_EQUIPMENT",
  "SEVERITY_DRIVER",
] as const;
export const fieldSemanticRoleSchema = z.enum(FIELD_SEMANTIC_ROLES);
export type FieldSemanticRole = z.infer<typeof fieldSemanticRoleSchema>;

/** Mapeo `FieldType → FieldDataType` (fuente única; backend deriva al guardar). */
export const FIELD_TYPE_TO_DATA_TYPE: Record<FieldType, FieldDataType> = {
  NUMBER: "NUMBER",
  TEXT: "STRING",
  TEXTAREA: "STRING",
  SELECT: "CODE",
  MULTISELECT: "CODE_ARRAY",
  BOOLEAN: "BOOLEAN",
  DATE: "DATE",
  DATETIME: "DATETIME",
  SEVERITY: "CODE", // escala cerrada {1..5} = code/dimensión (lista de sistema implícita)
  SIGNATURE: "REFERENCE", // el valor referencia la firma/identidad del firmante (2.5)
};

/** Deriva el `dataType` de un `type` (la presentación define el almacenamiento). */
export function deriveDataType(type: FieldType): FieldDataType {
  return FIELD_TYPE_TO_DATA_TYPE[type];
}

// === Ancho del campo en la grilla (Fase 2.1.2 → 2.1.3) =======================
//
// Hint de PRESENTACIÓN del campo: cuántas columnas ocupa dentro de la grilla
// responsiva de su sección, sobre una grilla de **12 columnas** (estándar SAP
// Fiori / ServiceNow / Bootstrap). 12 = ancho completo, 6 = media, 4 = un tercio,
// 3 = un cuarto, 8 = dos tercios, etc. Vive en la versión INMUTABLE (diseño
// controlado MMR/Part 11) como columna dedicada `TemplateField.colSpan` (paralelo
// a `visibleWhen`/`computed`/`semanticRole`, NO dentro de `config`). El motor de
// render solo COLOCA: no fuerza, no valida. En celular la grilla colapsa a 1 col.
// (2.1.3 reemplazó el enum {FULL,HALF,THIRD} de 2.1.2 por el span 1..12 para
// permitir el redimensionado fino por arrastre estilo Fiori/Bootstrap.)
export const GRID_COLUMNS = 12;
export const DEFAULT_COL_SPAN = GRID_COLUMNS; // 12 = ancho completo (cero ruptura)
export const colSpanSchema = z.number().int().min(1).max(GRID_COLUMNS);
export type ColSpan = z.infer<typeof colSpanSchema>;

// === Geometría del campo en el LIENZO (Fase 2.1.7) ===========================
//
// El editor evoluciona de "lista auto-acomodada" a un LIENZO DE POSICIONAMIENTO
// LIBRE sobre una grilla responsiva (modelo react-grid-layout). Cada campo lleva
// geometría EXPLÍCITA y persistente (NO en CSS): `gridX` (columna 0..11), `gridY`
// (fila lógica 0..N), `gridH` (alto en filas; el ANCHO sigue siendo `colSpan` = w).
// Viven en la versión INMUTABLE como columnas dedicadas (paralelas a `colSpan`).
// Son NULLABLE: `null` = plantilla legacy sin geometría ⇒ el editor la DERIVA del
// orden + `colSpan` (idéntica a la vista anterior) y la persiste al primer guardado.
// El render del llenado/visor usa (x, w, y) para reproducir columnas/filas; en
// celular la grilla colapsa a 1 columna (regla de terreno).
export const GRID_DEFAULT_H = 1; // alto por defecto (1 fila lógica)
export const gridXSchema = z.number().int().min(0).max(GRID_COLUMNS - 1); // 0..11
export const gridYSchema = z.number().int().min(0).max(2000);
export const gridHSchema = z.number().int().min(1).max(40);

// === Config por tipo =========================================================

/** Opción de un selector (valor estable + etiqueta visible). @deprecated 2.1.1 → usar inline `optionSource`. */
export const fieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

// --- optionSource discriminado (Fase 2.1.1) ---------------------------------
//
// Reemplaza el `options[]` literal de SELECT/MULTISELECT por una fuente de
// opciones discriminada (ver DECISIONS 2026-06-09):
//   - `inline`        → ítems {code,label} en el propio campo (caso trivial).
//   - `referenceList` → referencia una Lista de Referencia gobernada por
//                       `listKey` (la entidad ReferenceList + FK llegan en 2.x;
//                       mismo patrón que WorkflowDefinition en 2.2).
//   - `external`      → endpoint de Orígenes de Datos (Fase 3), resuelto y
//                       cacheado en backend. Aquí solo se modela la forma.
// El valor almacenado al llenar (2.4) es el `code` estable, no el label.

/** Ítem de una lista inline: `code` estable + `label` visible. */
export const optionInlineItemSchema = z.object({
  code: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
});
export type OptionInlineItem = z.infer<typeof optionInlineItemSchema>;

export const optionSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("inline"), items: z.array(optionInlineItemSchema).max(500) }),
  z.object({ kind: z.literal("referenceList"), listKey: z.string().trim().min(1).max(120) }),
  z.object({
    kind: z.literal("external"),
    sourceKey: z.string().trim().min(1).max(120),
    params: z.record(z.unknown()).optional(),
  }),
]);
export type OptionSource = z.infer<typeof optionSourceSchema>;

/**
 * NÚMERO con unidad, rango válido (min/max) y, opcionalmente, bandas de umbral
 * inspiradas en ISA-18.2 (LL/L/H/HH): `warn*` = advertencia, `crit*` = crítico.
 * Las bandas crítico alimentan la regla que dispara incidencia en Fase 4.
 * `min`/`max` son el rango VÁLIDO duro; las bandas viven dentro de él.
 */
export const numberFieldConfigSchema = z
  .object({
    unit: z.string().trim().max(24).optional(),
    decimals: z.number().int().min(0).max(6).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
    warnLow: z.number().optional(),
    warnHigh: z.number().optional(),
    critLow: z.number().optional(),
    critHigh: z.number().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "min no puede ser mayor que max", path: ["min"] });
    }
  });
export type NumberFieldConfig = z.infer<typeof numberFieldConfigSchema>;

export const textFieldConfigSchema = z
  .object({
    placeholder: z.string().trim().max(120).optional(),
    minLength: z.number().int().min(0).max(10000).optional(),
    maxLength: z.number().int().min(1).max(10000).optional(),
    /** Regex de formato (validada en backend al llenar, Fase 2.4). */
    pattern: z.string().trim().max(300).optional(),
  })
  .strict();
export type TextFieldConfig = z.infer<typeof textFieldConfigSchema>;

export const textareaFieldConfigSchema = z
  .object({
    placeholder: z.string().trim().max(160).optional(),
    rows: z.number().int().min(2).max(20).optional(),
    maxLength: z.number().int().min(1).max(20000).optional(),
  })
  .strict();
export type TextareaFieldConfig = z.infer<typeof textareaFieldConfigSchema>;

/**
 * Upgrade del shape legacy de opciones de 2.1 (`{ options: [{value,label}] }`)
 * al `optionSource` discriminado de 2.1.1 (`{ optionSource: { kind:'inline',
 * items:[{code,label}] } }`). Idempotente: si ya viene en el shape nuevo (o sin
 * opciones), lo devuelve tal cual. Los configs en BD son JSONB ⇒ sin migración
 * SQL; esto los normaliza al leer/escribir/clonar.
 */
function upgradeLegacyOptions(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const cfg = input as Record<string, unknown>;
  if ("optionSource" in cfg || !("options" in cfg)) return cfg;
  const legacy = Array.isArray(cfg.options) ? (cfg.options as Array<Record<string, unknown>>) : [];
  const items = legacy
    .filter((o) => o && typeof o.value === "string" && typeof o.label === "string")
    .map((o) => ({ code: o.value as string, label: o.label as string }));
  const { options: _drop, ...rest } = cfg;
  return { ...rest, optionSource: { kind: "inline", items } };
}

/** SELECT / MULTISELECT con fuente de opciones discriminada (`optionSource`). */
export const optionsFieldConfigSchema = z.preprocess(
  upgradeLegacyOptions,
  z.object({ optionSource: optionSourceSchema.optional() }).strict(),
);
export type OptionsFieldConfig = z.infer<typeof optionsFieldConfigSchema>;

export const booleanFieldConfigSchema = z
  .object({
    trueLabel: z.string().trim().max(40).optional(),
    falseLabel: z.string().trim().max(40).optional(),
  })
  .strict();
export type BooleanFieldConfig = z.infer<typeof booleanFieldConfigSchema>;

/** DATE / DATETIME — sin config adicional en 2.1. */
export const dateFieldConfigSchema = z.object({}).strict();

/** SEVERITY (escala 1–5 del DS) — sin config en 2.1. */
export const severityFieldConfigSchema = z.object({}).strict();

/** SIGNATURE — `meaning` (significado Part 11). La re-auth/MFA es ejecución (2.5). */
export const signatureFieldConfigSchema = z
  .object({
    meaning: z.string().trim().max(80).optional(),
  })
  .strict();

/**
 * Normaliza la config almacenada de un campo al shape vigente (2.1.1): para
 * SELECT/MULTISELECT, sube el `options[]` legacy a `optionSource.inline`. Para
 * los demás tipos, la devuelve tal cual. Reutilizable por el backend al LEER el
 * detalle (el cliente nunca ve el shape viejo) y al clonar versiones.
 */
export function upgradeFieldConfig(type: FieldType, config: Record<string, unknown>): Record<string, unknown> {
  if (type !== "SELECT" && type !== "MULTISELECT") return config;
  return upgradeLegacyOptions(config) as Record<string, unknown>;
}

/** Devuelve el esquema de config que corresponde a un tipo de campo. */
export function fieldConfigSchemaFor(type: FieldType): z.ZodTypeAny {
  switch (type) {
    case "NUMBER":
      return numberFieldConfigSchema;
    case "TEXT":
      return textFieldConfigSchema;
    case "TEXTAREA":
      return textareaFieldConfigSchema;
    case "SELECT":
    case "MULTISELECT":
      return optionsFieldConfigSchema;
    case "BOOLEAN":
      return booleanFieldConfigSchema;
    case "DATE":
    case "DATETIME":
      return dateFieldConfigSchema;
    case "SEVERITY":
      return severityFieldConfigSchema;
    case "SIGNATURE":
      return signatureFieldConfigSchema;
  }
}

// === Visibilidad condicional =================================================

/**
 * Visibilidad condicional (estilo `showIf` del prototipo): el campo se muestra
 * solo si el campo `fieldKey` de la misma versión es igual a `equals`.
 */
export const visibleWhenSchema = z.object({
  fieldKey: z.string().trim().min(1).max(64),
  equals: z.union([z.string(), z.number(), z.boolean()]),
});
export type VisibleWhen = z.infer<typeof visibleWhenSchema>;

// === Recurrencia (modelada; editor en 2.3) ===================================

export const RECURRENCE_KINDS = ["NONE", "SHIFT", "INTERVAL", "CALENDAR"] as const;
export const recurrenceKindSchema = z.enum(RECURRENCE_KINDS);
export type RecurrenceKind = z.infer<typeof recurrenceKindSchema>;

/**
 * Config de recurrencia (rondas/turnos). Modelada laxa a propósito: su forma
 * exacta la define el editor de programación en 2.3 (ISA-95 / shift handover).
 */
export const recurrenceConfigSchema = z.record(z.unknown());
export type RecurrenceConfig = z.infer<typeof recurrenceConfigSchema>;
