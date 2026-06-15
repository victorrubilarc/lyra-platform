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
  // --- Núcleo (Fase 2.1) ---
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
  // --- Catálogo de objetos premium · Ola 1 (2026-06-15) -------------------
  // Evaluación (semántica propia, no son variantes de SELECT/NUMBER):
  "CONFORMITY", // tri-estado de inspección: Conforme / No conforme / N.A.
  "RATING", // valoración ordinal: estrellas / numérica / Likert
  // Fecha/hora/cantidad (teclado y validación distintos del núcleo):
  "TIME", // hora del día HH:MM
  "DURATION", // duración HH:MM (almacenada en MINUTOS canónicos)
  "RANGE", // rango mín–máx (valor estructurado {from,to})
  // Presentación (NO-dato: el llenado los IGNORA, dataType = LAYOUT):
  "HEADING", // encabezado / subtítulo de bloque
  "STATIC_TEXT", // texto / instrucción fija
  "DIVIDER", // separador visual
  "NOTICE", // aviso (info / advertencia / éxito / peligro)
  "PROCEDURE_LINK", // enlace a un procedimiento / documento
  "REFERENCE_IMAGE", // imagen de referencia (URL configurada por el diseñador)
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

/**
 * Objetos de PRESENTACIÓN (no-dato, Ola 1): el LLENADO los ignora por completo
 * (no crea `LogEntryValue`, no valida, no entra a reglas/resumen/obligatorios).
 * Mapean todos a `dataType = LAYOUT`. La fuente única para "saltarlos" es
 * `isPresentationalType` (basada en el dataType, no en una lista que se desincronice).
 */
export const PRESENTATIONAL_FIELD_TYPES = [
  "HEADING",
  "STATIC_TEXT",
  "DIVIDER",
  "NOTICE",
  "PROCEDURE_LINK",
  "REFERENCE_IMAGE",
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
  "RANGE", // rango estructurado {from,to} de dos números (Ola 1)
  "LAYOUT", // objeto de PRESENTACIÓN: no es dato, el llenado lo ignora (Ola 1)
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
  // --- Ola 1 ---
  CONFORMITY: "CODE", // escala cerrada {CONFORME, NO_CONFORME, NA} = dimensión reportable
  RATING: "NUMBER", // valoración ordinal almacenada como entero 1..max
  TIME: "TIME", // "HH:MM"
  DURATION: "NUMBER", // minutos canónicos (espejo de SLA / ventana de edición)
  RANGE: "RANGE", // {from, to}
  HEADING: "LAYOUT",
  STATIC_TEXT: "LAYOUT",
  DIVIDER: "LAYOUT",
  NOTICE: "LAYOUT",
  PROCEDURE_LINK: "LAYOUT",
  REFERENCE_IMAGE: "LAYOUT",
};

/** Deriva el `dataType` de un `type` (la presentación define el almacenamiento). */
export function deriveDataType(type: FieldType): FieldDataType {
  return FIELD_TYPE_TO_DATA_TYPE[type];
}

/**
 * ¿Es un objeto de PRESENTACIÓN (no-dato)? Fuente única para que el llenado lo
 * salte (no exige, no valida, no persiste valor, no entra a reglas/resumen).
 * Basada en el `dataType = LAYOUT` derivado, no en una lista paralela.
 */
export function isPresentationalType(type: FieldType): boolean {
  return FIELD_TYPE_TO_DATA_TYPE[type] === "LAYOUT";
}

/** Códigos cerrados del tri-estado de inspección (Conforme / No conforme / N.A.). */
export const CONFORMITY_CODES = ["CONFORME", "NO_CONFORME", "NA"] as const;
export type ConformityCode = (typeof CONFORMITY_CODES)[number];

/** Estilos de la valoración (RATING). `numeric` = botones 1..max; `stars` = estrellas; `likert` = escala con rótulos. */
export const RATING_STYLES = ["stars", "numeric", "likert"] as const;
export type RatingStyle = (typeof RATING_STYLES)[number];
/** Máximo por defecto de la valoración (5 estrellas / 1..5). */
export const RATING_DEFAULT_MAX = 5;

// === Validadores de FORMATO regional/semántico (fuente única back↔front) ======
//
// RUT/correo/teléfono/URL son VARIANTES de TEXT (config.format); su validación
// vive aquí para que backend (autoritativo) y frontend (feedback) usen lo mismo.
// El FORMATEO visual (puntos/guion del RUT, etc.) es responsabilidad de la UI
// (apps/.../lib/format.ts); aquí solo se decide validez.

/** Formatos semánticos de un campo de TEXTO. */
export const TEXT_FORMATS = ["rut", "email", "phone", "url"] as const;
export type TextFormat = (typeof TEXT_FORMATS)[number];
/** Formatos semánticos de un campo NUMÉRICO. */
export const NUMBER_FORMATS = ["percent", "currency"] as const;
export type NumberFormat = (typeof NUMBER_FORMATS)[number];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const URL_RE = /^https?:\/\/[^\s.]+\.[^\s]+$/i;
// Teléfono permisivo (E.164-ish): + opcional, dígitos/espacios/guiones/paréntesis, 7..20 dígitos.
const PHONE_RE = /^\+?[0-9()\s-]{7,24}$/;

/** Normaliza un RUT chileno a "cuerpo-DV" sin puntos, DV en mayúscula. null si no parsea. */
export function normalizeRut(raw: string): string | null {
  const cleaned = raw.replace(/[.\s]/g, "").replace(/-/g, "").toUpperCase();
  if (cleaned.length < 2) return null;
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  if (!/^\d+$/.test(body) || !/^[0-9K]$/.test(dv)) return null;
  return `${body}-${dv}`;
}

/** Dígito verificador esperado (módulo 11) del cuerpo numérico de un RUT. */
export function rutCheckDigit(body: string): string {
  let sum = 0;
  let mul = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  }
  const res = 11 - (sum % 11);
  return res === 11 ? "0" : res === 10 ? "K" : String(res);
}

/** ¿RUT chileno válido (con dígito verificador correcto)? */
export function isValidRut(raw: string): boolean {
  const norm = normalizeRut(raw);
  if (!norm) return false;
  const [body, dv] = norm.split("-");
  return rutCheckDigit(body!) === dv;
}

/** Valida un valor de texto contra su formato semántico. true = válido. */
export function isValidTextFormat(format: TextFormat, value: string): boolean {
  const v = value.trim();
  if (v === "") return true; // vacío lo gobierna "obligatorio", no el formato
  switch (format) {
    case "rut":
      return isValidRut(v);
    case "email":
      return EMAIL_RE.test(v);
    case "phone":
      return PHONE_RE.test(v) && (v.match(/\d/g)?.length ?? 0) >= 7;
    case "url":
      return URL_RE.test(v);
  }
}

/** "HH:MM" 24h válido (00:00..23:59). */
export function isValidTimeOfDay(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
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
    /** Formato semántico (Ola 1): `percent` (0..100, sufijo %) o `currency` (moneda regional). */
    format: z.enum(NUMBER_FORMATS).optional(),
    /** Código ISO de moneda cuando `format=currency` (default CLP). */
    currency: z.string().trim().length(3).optional(),
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
    /** Formato semántico (Ola 1): rut/email/phone/url. Validado por `isValidTextFormat`. */
    format: z.enum(TEXT_FORMATS).optional(),
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

/**
 * Presentación de un SELECT (Ola 1, fork `displayAs`): un único `code` con la
 * MISMA fuente de opciones y validación; solo cambia el widget.
 *  - dropdown (default): combobox buscable. - radio: opciones visibles 1-toque.
 *  - segmented: chips/segmentos (pocas opciones).
 */
export const SELECT_DISPLAYS = ["dropdown", "radio", "segmented"] as const;
export type SelectDisplay = (typeof SELECT_DISPLAYS)[number];

/**
 * Presentación de un MULTISELECT (Ola 1): varios `code`, misma fuente/validación.
 *  - dropdown (default): tags + menú. - checkboxes: casillas visibles.
 *  - modal: Value Help emergente (reusa LookupPicker) para listas grandes.
 */
export const MULTISELECT_DISPLAYS = ["dropdown", "checkboxes", "modal"] as const;
export type MultiselectDisplay = (typeof MULTISELECT_DISPLAYS)[number];

/** SELECT / MULTISELECT con fuente de opciones discriminada (`optionSource`). Base común. */
export const optionsFieldConfigSchema = z.preprocess(
  upgradeLegacyOptions,
  z.object({ optionSource: optionSourceSchema.optional() }).strict(),
);
export type OptionsFieldConfig = z.infer<typeof optionsFieldConfigSchema>;

/** Config de SELECT: fuente de opciones + presentación (`displayAs`). */
export const selectFieldConfigSchema = z.preprocess(
  upgradeLegacyOptions,
  z.object({ optionSource: optionSourceSchema.optional(), displayAs: z.enum(SELECT_DISPLAYS).optional() }).strict(),
);

/** Config de MULTISELECT: fuente de opciones + presentación (`displayAs`). */
export const multiselectFieldConfigSchema = z.preprocess(
  upgradeLegacyOptions,
  z
    .object({ optionSource: optionSourceSchema.optional(), displayAs: z.enum(MULTISELECT_DISPLAYS).optional() })
    .strict(),
);

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

// === Config de objetos Ola 1 =================================================

/** CONFORMITY (tri-estado): `allowNa` permite/oculta la opción N.A. (default true). */
export const conformityFieldConfigSchema = z
  .object({
    allowNa: z.boolean().optional(),
  })
  .strict();

/** RATING (valoración): estilo (estrellas/numérica/Likert), máximo y rótulos opcionales. */
export const ratingFieldConfigSchema = z
  .object({
    style: z.enum(RATING_STYLES).optional(),
    max: z.number().int().min(2).max(10).optional(),
    /** Rótulos de la escala Likert (1 por punto; opcional, solo display). */
    labels: z.array(z.string().trim().max(40)).max(10).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.labels && c.max && c.labels.length > c.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Más rótulos que puntos de la escala", path: ["labels"] });
    }
  });

/** TIME (hora del día) — sin config en Ola 1. */
export const timeFieldConfigSchema = z.object({}).strict();

/** DURATION (duración HH:MM, almacenada en minutos) — sin config en Ola 1. */
export const durationFieldConfigSchema = z.object({}).strict();

/** RANGE (mín–máx): unidad/decimales + cotas duras opcionales para ambos extremos. */
export const rangeFieldConfigSchema = z
  .object({
    unit: z.string().trim().max(24).optional(),
    decimals: z.number().int().min(0).max(6).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "min no puede ser mayor que max", path: ["min"] });
    }
  });

// --- Objetos de PRESENTACIÓN (dataType LAYOUT; el llenado los ignora) --------

/** HEADING — nivel jerárquico del encabezado (1..3). El texto va en `label`. */
export const headingFieldConfigSchema = z
  .object({
    level: z.number().int().min(1).max(3).optional(),
  })
  .strict();

/** STATIC_TEXT — cuerpo del texto/instrucción (el `label` es el título opcional). */
export const staticTextFieldConfigSchema = z
  .object({
    text: z.string().trim().max(4000).optional(),
  })
  .strict();

/** DIVIDER — separador. `spacing` controla el aire vertical. */
export const dividerFieldConfigSchema = z
  .object({
    spacing: z.enum(["sm", "md", "lg"]).optional(),
  })
  .strict();

/** NOTICE — aviso con intención semántica + cuerpo. */
export const NOTICE_VARIANTS = ["info", "warning", "success", "danger"] as const;
export type NoticeVariant = (typeof NOTICE_VARIANTS)[number];
export const noticeFieldConfigSchema = z
  .object({
    variant: z.enum(NOTICE_VARIANTS).optional(),
    text: z.string().trim().max(2000).optional(),
  })
  .strict();

/** PROCEDURE_LINK — enlace a un procedimiento/documento (URL + texto del enlace). */
export const procedureLinkFieldConfigSchema = z
  .object({
    url: z.string().trim().max(2000).optional(),
    linkText: z.string().trim().max(200).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.url && !isValidTextFormat("url", c.url)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL inválida", path: ["url"] });
    }
  });

/** REFERENCE_IMAGE — imagen de referencia por URL (sin upload: eso es Ola 3/MinIO). */
export const referenceImageFieldConfigSchema = z
  .object({
    url: z.string().trim().max(2000).optional(),
    alt: z.string().trim().max(200).optional(),
    caption: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.url && !isValidTextFormat("url", c.url)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "URL inválida", path: ["url"] });
    }
  });

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
      return selectFieldConfigSchema;
    case "MULTISELECT":
      return multiselectFieldConfigSchema;
    case "BOOLEAN":
      return booleanFieldConfigSchema;
    case "DATE":
    case "DATETIME":
      return dateFieldConfigSchema;
    case "SEVERITY":
      return severityFieldConfigSchema;
    case "SIGNATURE":
      return signatureFieldConfigSchema;
    // --- Ola 1 ---
    case "CONFORMITY":
      return conformityFieldConfigSchema;
    case "RATING":
      return ratingFieldConfigSchema;
    case "TIME":
      return timeFieldConfigSchema;
    case "DURATION":
      return durationFieldConfigSchema;
    case "RANGE":
      return rangeFieldConfigSchema;
    case "HEADING":
      return headingFieldConfigSchema;
    case "STATIC_TEXT":
      return staticTextFieldConfigSchema;
    case "DIVIDER":
      return dividerFieldConfigSchema;
    case "NOTICE":
      return noticeFieldConfigSchema;
    case "PROCEDURE_LINK":
      return procedureLinkFieldConfigSchema;
    case "REFERENCE_IMAGE":
      return referenceImageFieldConfigSchema;
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
