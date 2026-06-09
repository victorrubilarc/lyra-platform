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

// === Config por tipo =========================================================

/** Opción de un selector (valor estable + etiqueta visible). */
export const fieldOptionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
});
export type FieldOption = z.infer<typeof fieldOptionSchema>;

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

/** SELECT / MULTISELECT con lista de opciones fija. (Datos vivos = Fase 3.) */
export const optionsFieldConfigSchema = z
  .object({
    options: z.array(fieldOptionSchema).max(200).optional(),
  })
  .strict();
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
