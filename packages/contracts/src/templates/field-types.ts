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
  // --- Catálogo de objetos premium · Ola 2 (2026-06-15) -------------------
  // Referencia (apuntan a una entidad de la plataforma; almacenan un id):
  "REFERENCE", // selector de equipo/usuario/nodo/turno (discriminado por config.entity)
  // Evaluación estructurada:
  "RISK_MATRIX", // matriz de riesgo probabilidad×consecuencia → nivel (ISO 31000)
  // Lectura con tolerancia y contador/acumulado son VARIANTES de NUMBER (config),
  // no tipos nuevos (espejo de percent/currency en Ola 1).
  // --- Catálogo de objetos premium · Ola 3 (2026-06-15) -------------------
  // Adjuntos/terreno (infra MinIO; valor = descriptor[] de objetos almacenados):
  "ATTACHMENT", // foto/archivo/nota de voz/croquis, discriminado por config.kind
  // El escaneo QR/código de barras NO es archivo: es config.scan sobre TEXT
  // (decode client-side que rellena el valor), sin storage ni dataType nuevo.
  // --- Catálogo de objetos premium · Ola 4 (2026-06-15) -------------------
  // Objetos ESTRUCTURADOS / repetibles (valor = colección de celdas):
  "TABLE", // tabla/grilla repetible (filas dinámicas) o grupo repetible (layout cards)
  "MATRIX", // matriz parámetro×turno (filas y columnas fijas, celda uniforme)
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
  "FILE", // un objeto almacenado (descriptor único) — reservado
  "FILE_ARRAY", // varios objetos almacenados (descriptor[]) — adjuntos Ola 3
  "GEO",
  "COMPUTED",
  "RANGE", // rango estructurado {from,to} de dos números (Ola 1)
  "LAYOUT", // objeto de PRESENTACIÓN: no es dato, el llenado lo ignora (Ola 1)
  "RISK", // matriz de riesgo: valor estructurado {probability,consequence} (Ola 2)
  "TABLE", // tabla/grupo repetible: valor = array de filas Record<colKey, escalar> (Ola 4)
  "MATRIX", // matriz parámetro×turno: valor = Record<rowKey, Record<colKey, escalar>> (Ola 4)
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
  // --- Ola 2 ---
  REFERENCE: "REFERENCE", // id de una entidad (equipo/usuario/nodo/turno)
  RISK_MATRIX: "RISK", // {probability, consequence}
  // --- Ola 3 ---
  ATTACHMENT: "FILE_ARRAY", // descriptor[] (multiple=false solo limita a 1)
  // --- Ola 4 ---
  TABLE: "TABLE", // Array<Record<colKey, escalar>>
  MATRIX: "MATRIX", // Record<rowKey, Record<colKey, escalar>>
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

// === Objetos de REFERENCIA (Ola 2) ==========================================
//
// Un objeto de referencia apunta a una ENTIDAD de la plataforma y almacena su
// `id` (dataType REFERENCE). Un único `FieldType REFERENCE` discriminado por
// `config.entity` cubre las cuatro entidades (patrón de presets de Ola 1). La
// resolución de opciones y la validación "existe + activo + EN ALCANCE" (ABAC)
// son SERVER-SIDE (el cliente solo ofrece): `validateFieldValue` recibe el set
// de ids válidos por `opts.allowedRefIds`, espejo de `allowedCodes`.

/** Entidades a las que puede apuntar un campo de REFERENCIA. */
export const REFERENCE_ENTITIES = ["equipment", "user", "orgNode", "shift"] as const;
export type ReferenceEntity = (typeof REFERENCE_ENTITIES)[number];

/** Presentación del selector de referencia. `dropdown` = Combobox buscable; `modal` = Value Help (LookupPicker). */
export const REFERENCE_DISPLAYS = ["dropdown", "modal"] as const;
export type ReferenceDisplay = (typeof REFERENCE_DISPLAYS)[number];

// === Matriz de riesgo (Ola 2, ISO 31000) ====================================
//
// Valor estructurado {probability, consequence} (índices 1-based, como RATING);
// el NIVEL se DERIVA por una matriz configurable: `cells[p-1][c-1]` = severidad
// 1..5 (extiende la escala de Severidad del DS). Ejes 2..7 con rótulos.
export const RISK_AXIS_MIN = 2;
export const RISK_AXIS_MAX = 7;
export const RISK_SEVERITY_MIN = 1;
export const RISK_SEVERITY_MAX = 5;

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
    // --- Ola 2: lectura con tolerancia (target ± tol) -----------------------
    // Cuando `expected` está definido, las bandas warn/crit se DERIVAN de él
    // (`deriveToleranceBands`) y mandan sobre warnLow/warnHigh/critLow/critHigh.
    /** Valor esperado (objetivo) de la lectura. */
    expected: z.number().optional(),
    /** Tolerancia de advertencia: fuera de `expected ± tolerance` ⇒ WARN. */
    tolerance: z.number().min(0).optional(),
    /** Tolerancia crítica (≥ tolerance): fuera de `expected ± critTolerance` ⇒ CRIT. */
    critTolerance: z.number().min(0).optional(),
    // --- Ola 2: contador / acumulado ---------------------------------------
    /** Lectura incremental (horómetro/medidor): el backend muestra el delta vs la previa del mismo equipo. */
    counter: z.boolean().optional(),
    /** El contador no puede decrecer (nuevo ≥ previo). Validado server-side contra la lectura anterior. */
    counterNonDecreasing: z.boolean().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.min !== undefined && c.max !== undefined && c.min > c.max) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "min no puede ser mayor que max", path: ["min"] });
    }
    if (c.tolerance !== undefined && c.expected === undefined) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La tolerancia exige un valor esperado", path: ["expected"] });
    }
    if (c.critTolerance !== undefined && c.tolerance !== undefined && c.critTolerance < c.tolerance) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La tolerancia crítica no puede ser menor que la de advertencia",
        path: ["critTolerance"],
      });
    }
  });
export type NumberFieldConfig = z.infer<typeof numberFieldConfigSchema>;

/**
 * Deriva las bandas ISA-18.2 (warn/crit) de una lectura con tolerancia
 * (`expected ± tolerance` / `± critTolerance`). FUENTE ÚNICA: la consumen
 * `validateFieldValue` (advertencias) y `thresholdBandFor` (estampado) para que
 * tolerancia y umbral compartan exactamente la misma semántica. Sin `expected`
 * devuelve `{}` (el campo usa sus warn/crit explícitos, si los tiene).
 */
export function deriveToleranceBands(config: Record<string, unknown>): {
  warnLow?: number;
  warnHigh?: number;
  critLow?: number;
  critHigh?: number;
} {
  const c = config as { expected?: number; tolerance?: number; critTolerance?: number };
  if (typeof c.expected !== "number") return {};
  const out: { warnLow?: number; warnHigh?: number; critLow?: number; critHigh?: number } = {};
  if (typeof c.tolerance === "number") {
    out.warnLow = c.expected - c.tolerance;
    out.warnHigh = c.expected + c.tolerance;
  }
  if (typeof c.critTolerance === "number") {
    out.critLow = c.expected - c.critTolerance;
    out.critHigh = c.expected + c.critTolerance;
  }
  return out;
}

/**
 * Bandas warn/crit EFECTIVAS de un campo numérico: si tiene `expected`
 * (tolerancia), se derivan; si no, son las explícitas del config. Fuente única
 * compartida por la validación y el estampado de umbral.
 */
export function effectiveNumberBands(config: Record<string, unknown>): {
  warnLow?: number;
  warnHigh?: number;
  critLow?: number;
  critHigh?: number;
} {
  const c = config as {
    expected?: number;
    warnLow?: number;
    warnHigh?: number;
    critLow?: number;
    critHigh?: number;
  };
  if (typeof c.expected === "number") return deriveToleranceBands(config);
  return { warnLow: c.warnLow, warnHigh: c.warnHigh, critLow: c.critLow, critHigh: c.critHigh };
}

export const textFieldConfigSchema = z
  .object({
    placeholder: z.string().trim().max(120).optional(),
    minLength: z.number().int().min(0).max(10000).optional(),
    maxLength: z.number().int().min(1).max(10000).optional(),
    /** Regex de formato (validada en backend al llenar, Fase 2.4). */
    pattern: z.string().trim().max(300).optional(),
    /** Formato semántico (Ola 1): rut/email/phone/url. Validado por `isValidTextFormat`. */
    format: z.enum(TEXT_FORMATS).optional(),
    /**
     * Máscara de entrada (formateo en vivo, paso B): patrón con `#`=dígito, `A`=letra,
     * `*`=alfanumérico; el resto son literales (p. ej. `OT-#####`). Solo formatea la
     * presentación al teclear; el valor persistido es el texto ya enmascarado. Si hay
     * `format` semántico (RUT/correo/…), este manda y la máscara se ignora.
     */
    mask: z.string().trim().max(40).optional(),
    /**
     * Escáner QR/código de barras (Ola 3): habilita un botón de captura por cámara
     * que decodifica un código client-side y rellena el valor. NO es un archivo (sin
     * storage): el código queda como el texto del campo. Validación = la del TEXT.
     */
    scan: z.boolean().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.minLength !== undefined && c.maxLength !== undefined && c.minLength > c.maxLength) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El mínimo de caracteres no puede superar al máximo", path: ["minLength"] });
    }
  });
export type TextFieldConfig = z.infer<typeof textFieldConfigSchema>;

export const textareaFieldConfigSchema = z
  .object({
    placeholder: z.string().trim().max(160).optional(),
    rows: z.number().int().min(2).max(20).optional(),
    /** Mínimo de caracteres (validado por `validateFieldValue`, igual que TEXT). */
    minLength: z.number().int().min(0).max(20000).optional(),
    maxLength: z.number().int().min(1).max(20000).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.minLength !== undefined && c.maxLength !== undefined && c.minLength > c.maxLength) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "El mínimo de caracteres no puede superar al máximo", path: ["minLength"] });
    }
  });
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

// === Config de objetos Ola 2 =================================================

/**
 * REFERENCE — selector que apunta a una entidad. `entity` discrimina el endpoint
 * de opciones, las columnas y el alcance (ABAC), todo resuelto SERVER-SIDE. El
 * valor almacenado es el `id` (string) de la entidad. `display` elige el widget.
 */
export const referenceFieldConfigSchema = z
  .object({
    entity: z.enum(REFERENCE_ENTITIES),
    display: z.enum(REFERENCE_DISPLAYS).optional(),
  })
  .strict();
export type ReferenceFieldConfig = z.infer<typeof referenceFieldConfigSchema>;

/**
 * RISK_MATRIX — ejes de probabilidad×consecuencia (2..7 rótulos cada uno) y la
 * cuadrícula `cells[p-1][c-1]` con la severidad 1..5 resultante (ISO 31000). El
 * valor de la entrada es {probability, consequence} (índices 1-based); el nivel
 * se DERIVA con `riskLevelFor`. La matriz vive en la versión INMUTABLE (config).
 */
export const riskMatrixFieldConfigSchema = z
  .object({
    probabilityLabels: z.array(z.string().trim().min(1).max(40)).min(RISK_AXIS_MIN).max(RISK_AXIS_MAX),
    consequenceLabels: z.array(z.string().trim().min(1).max(40)).min(RISK_AXIS_MIN).max(RISK_AXIS_MAX),
    cells: z.array(z.array(z.number().int().min(RISK_SEVERITY_MIN).max(RISK_SEVERITY_MAX))),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.cells.length !== c.probabilityLabels.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La cuadrícula debe tener una fila por nivel de probabilidad",
        path: ["cells"],
      });
      return;
    }
    for (let i = 0; i < c.cells.length; i++) {
      if (c.cells[i]!.length !== c.consequenceLabels.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Cada fila debe tener una celda por nivel de consecuencia",
          path: ["cells", i],
        });
      }
    }
  });
export type RiskMatrixFieldConfig = z.infer<typeof riskMatrixFieldConfigSchema>;

/** Valor de una matriz de riesgo: índices 1-based sobre los ejes (probabilidad × consecuencia). */
export const riskValueSchema = z.object({
  probability: z.number().int().min(1),
  consequence: z.number().int().min(1),
});
export type RiskValue = z.infer<typeof riskValueSchema>;

/**
 * Nivel de riesgo (severidad 1..5 + rótulos de ejes) que resulta de un valor en
 * la matriz configurada. FUENTE ÚNICA del color/etiqueta en builder, llenado y
 * visor. Devuelve null si el valor está fuera de los ejes o la matriz es inválida.
 */
export function riskLevelFor(
  config: Record<string, unknown>,
  value: unknown,
): { severity: number; probabilityLabel: string; consequenceLabel: string } | null {
  const c = config as Partial<RiskMatrixFieldConfig>;
  if (!c.probabilityLabels || !c.consequenceLabels || !c.cells) return null;
  if (typeof value !== "object" || value === null) return null;
  const v = value as { probability?: unknown; consequence?: unknown };
  const p = typeof v.probability === "number" ? v.probability : Number(v.probability);
  const cons = typeof v.consequence === "number" ? v.consequence : Number(v.consequence);
  if (!Number.isInteger(p) || !Number.isInteger(cons)) return null;
  if (p < 1 || p > c.probabilityLabels.length || cons < 1 || cons > c.consequenceLabels.length) return null;
  const severity = c.cells[p - 1]?.[cons - 1];
  if (typeof severity !== "number") return null;
  return {
    severity,
    probabilityLabel: c.probabilityLabels[p - 1]!,
    consequenceLabel: c.consequenceLabels[cons - 1]!,
  };
}

// === Objetos de ADJUNTO / TERRENO (Ola 3, infra MinIO) ======================
//
// Un ATTACHMENT almacena uno o varios OBJETOS en el storage on-prem (MinIO). El
// valor persistido en `LogEntryValue.value` es un **descriptor[]** (NUNCA una
// URL): metadata inmutable del objeto. La descarga = presigned GET de vida corta
// firmado server-side con la MISMA ABAC que `getDetail`. Un único `FieldType
// ATTACHMENT` discriminado por `config.kind` cubre los cuatro presets (patrón de
// Ola 1/2): foto/cámara, archivo, nota de voz, croquis. El valor es SIEMPRE un
// arreglo (multiple=false solo limita a 1) ⇒ mapa `dataType` estático intacto.
// La subida es PROXIED por la API (choke-point de validación tamaño/tipo/audit);
// la pertenencia de la `key` a esta entrada+campo se verifica server-side (por
// prefijo de objeto, análogo a `allowedRefIds` pero por prefijo).

/** Tipo de adjunto: elige el widget de captura y el `accept` por defecto. */
export const ATTACHMENT_KINDS = ["file", "photo", "audio", "sketch"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/** Tamaño máximo por archivo por defecto (MB). Foto/voz/croquis de terreno son chicos. */
export const ATTACHMENT_DEFAULT_MAX_SIZE_MB = 25;
export const ATTACHMENT_MAX_SIZE_MB_CAP = 100;
/** Tope de archivos por defecto cuando `multiple`. */
export const ATTACHMENT_DEFAULT_MAX_COUNT = 10;
export const ATTACHMENT_MAX_COUNT_CAP = 30;

/** `accept` (patrón MIME) por defecto según el tipo de adjunto. "" = cualquiera. */
export const ATTACHMENT_KIND_DEFAULT_ACCEPT: Record<AttachmentKind, string> = {
  file: "", // cualquier tipo (acotado por tamaño); el diseñador puede restringir
  photo: "image/*",
  audio: "audio/*",
  sketch: "image/png", // el croquis se exporta del canvas a PNG
};

/**
 * ATTACHMENT — adjunto de uno o varios objetos. `kind` elige el widget de captura
 * y el `accept` por defecto; `accept` (MIME) lo restringe; `multiple`/`maxCount`
 * la cardinalidad; `maxSizeMb` el tamaño por archivo; `capture` sugiere la cámara
 * trasera en móvil para fotos. La validación de tipo/tamaño la aplica el backend
 * (autoritativo) y la reusa el cliente (`validateFieldValue`).
 */
export const attachmentFieldConfigSchema = z
  .object({
    kind: z.enum(ATTACHMENT_KINDS),
    accept: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
    multiple: z.boolean().optional(),
    maxCount: z.number().int().min(1).max(ATTACHMENT_MAX_COUNT_CAP).optional(),
    maxSizeMb: z.number().int().min(1).max(ATTACHMENT_MAX_SIZE_MB_CAP).optional(),
    capture: z.boolean().optional(),
  })
  .strict();
export type AttachmentFieldConfig = z.infer<typeof attachmentFieldConfigSchema>;

/**
 * Descriptor de un objeto almacenado: lo que se persiste en `LogEntryValue.value`
 * (NUNCA una URL). `id` direcciona la descarga sin exponer la `key` cruda; `key`
 * es la ruta en el bucket (`entries/{entryId}/{fieldKey}/{id}-{filename}`);
 * `checksum` (sha256) da integridad ALCOA+/Part 11. Fuente única back↔front.
 */
export const fileDescriptorSchema = z
  .object({
    id: z.string().min(1).max(64),
    key: z.string().min(1).max(512),
    filename: z.string().min(1).max(255),
    size: z.number().int().min(0),
    contentType: z.string().min(1).max(160),
    checksum: z.string().min(1).max(128).optional(),
    uploadedAt: z.string().min(1),
    uploadedById: z.string().min(1).max(64),
  })
  .strict();
export type FileDescriptor = z.infer<typeof fileDescriptorSchema>;

/** ¿El `contentType` cae bajo alguno de los patrones `accept` (p. ej. `image/` parcial, `application/pdf`, comodín total)? */
export function acceptMatches(accept: readonly string[] | undefined, contentType: string): boolean {
  if (!accept || accept.length === 0) return true; // sin restricción
  const ct = contentType.trim().toLowerCase();
  return accept.some((a) => {
    const pat = a.trim().toLowerCase();
    if (pat === "*" || pat === "*/*") return true;
    if (pat.endsWith("/*")) return ct.startsWith(pat.slice(0, -1)); // "image/" como prefijo
    return ct === pat;
  });
}

/** Lista `accept` EFECTIVA: la explícita del config o la del `kind` por defecto. */
export function effectiveAccept(config: { kind?: AttachmentKind; accept?: readonly string[] }): readonly string[] {
  if (config.accept && config.accept.length > 0) return config.accept;
  const def = config.kind ? ATTACHMENT_KIND_DEFAULT_ACCEPT[config.kind] : "";
  return def ? [def] : [];
}

/** Tamaño máximo por archivo en BYTES (config o default). */
export function maxAttachmentBytes(config: { maxSizeMb?: number }): number {
  return (config.maxSizeMb ?? ATTACHMENT_DEFAULT_MAX_SIZE_MB) * 1024 * 1024;
}

/** Cantidad máxima de archivos EFECTIVA (1 si no es múltiple). */
export function maxAttachmentCount(config: { multiple?: boolean; maxCount?: number }): number {
  if (!config.multiple) return 1;
  return config.maxCount ?? ATTACHMENT_DEFAULT_MAX_COUNT;
}

// === Objetos ESTRUCTURADOS / repetibles (Ola 4) =============================
//
// TABLE y MATRIX capturan una COLECCIÓN de celdas escalares en un solo campo,
// reusando la validación por tipo de cada celda (`fieldConfigSchemaFor` /
// `validateFieldValue`). Las columnas/ejes se definen en `config` (sub-campos
// escalares) y viajan en la versión INMUTABLE (config jsonb, clonado al publicar,
// igual que `RISK_MATRIX.cells`). El valor se persiste en `LogEntryValue.value`:
//   - TABLE  → `Array<Record<colKey, escalar>>` (filas dinámicas que el operador
//              agrega/quita/reordena; layout `table` = grilla, `cards` = bloque
//              repetible "agregar otro hallazgo").
//   - MATRIX → `Record<rowKey, Record<colKey, escalar>>` (filas=parámetros y
//              columnas=turnos/intervalos FIJAS y configuradas; celda uniforme).
// MVP (forks 2026-06-15): sub-tipos de celda = SOLO escalares; columnas de matriz
// configuradas (sin ShiftResolver); SELECT de celda = opciones INLINE (sin ABAC
// por celda); sin agregados (total/promedio diferidos). Patrón de industria: SAP
// measurement documents/characteristics, IBM Maximo Multi-record/Asset Meter,
// ServiceNow MultiRow Variable Set, j5 tabular logs, EBR repeating sections.

/** Sub-tipos ESCALARES permitidos dentro de una celda/columna (MVP Ola 4). */
export const STRUCTURED_CELL_TYPES = [
  "TEXT",
  "TEXTAREA",
  "NUMBER",
  "SELECT",
  "BOOLEAN",
  "DATE",
  "TIME",
  "DURATION",
  "CONFORMITY",
  "RATING",
] as const satisfies readonly FieldType[];
export type StructuredCellType = (typeof STRUCTURED_CELL_TYPES)[number];
export const structuredCellTypeSchema = z.enum(STRUCTURED_CELL_TYPES);

/** Layout de un TABLE: `table` = grilla de filas; `cards` = bloque repetible vertical. */
export const TABLE_LAYOUTS = ["table", "cards"] as const;
export type TableLayout = (typeof TABLE_LAYOUTS)[number];

export const TABLE_MAX_COLUMNS = 12;
export const TABLE_ROWS_CAP = 200; // tope duro de filas (anti-abuso); el operador no llega aquí
export const MATRIX_MAX_ROWS = 50; // parámetros
export const MATRIX_MAX_COLUMNS = 24; // turnos/intervalos

/** Clave estable de columna/eje (identificador, no se muestra). */
const cellKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "clave inválida (letra inicial, alfanumérico/_)");

/**
 * Una COLUMNA de TABLE = sub-campo escalar. `config` se valida contra el esquema
 * del tipo de la columna (`fieldConfigSchemaFor`), igual que un campo normal; así
 * un NUMBER de columna trae unidad/min/max/umbral y un SELECT su `optionSource`.
 */
export const tableColumnSchema = z
  .object({
    key: cellKeySchema,
    label: z.string().trim().min(1).max(120),
    type: structuredCellTypeSchema,
    required: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .strict()
  .superRefine((col, ctx) => {
    const r = fieldConfigSchemaFor(col.type).safeParse(col.config ?? {});
    if (!r.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Configuración inválida para la columna "${col.key}"`,
        path: ["config"],
      });
      return;
    }
    // Las celdas SOLO admiten catálogos INLINE (MVP Ola 4). Una lista de referencia/
    // externa en una columna NO se valida server-side (no hay resolución por celda) ⇒
    // se rechaza en el diseño (el backend es la autoridad; el builder solo ofrece inline).
    if (nonInlineCellSelect(col.type, r.data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La columna "${col.key}" de selección solo admite opciones definidas en la columna (lista de referencia no soportada en celdas)`,
        path: ["config", "optionSource"],
      });
    }
  });
export type TableColumn = z.infer<typeof tableColumnSchema>;

/** ¿Una celda de selección usa un catálogo NO inline (no soportado en celdas, Ola 4)? */
function nonInlineCellSelect(type: StructuredCellType, parsedConfig: unknown): boolean {
  if (type !== "SELECT") return false;
  const src = (parsedConfig as { optionSource?: { kind?: string } }).optionSource;
  return !!src && src.kind !== "inline";
}

/** TABLE — tabla/grupo repetible. Columnas = sub-campos escalares; filas dinámicas. */
export const tableFieldConfigSchema = z
  .object({
    layout: z.enum(TABLE_LAYOUTS).optional(), // default "table"
    columns: z.array(tableColumnSchema).min(1).max(TABLE_MAX_COLUMNS),
    /** Mínimo de filas COMPLETAS exigidas cuando el campo es obligatorio (default 1). */
    minRows: z.number().int().min(0).max(TABLE_ROWS_CAP).optional(),
    /** Máximo de filas permitidas. */
    maxRows: z.number().int().min(1).max(TABLE_ROWS_CAP).optional(),
    /** Rótulo del botón "agregar fila" (default "Agregar fila"). */
    addRowLabel: z.string().trim().max(60).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    c.columns.forEach((col, i) => {
      if (seen.has(col.key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Clave de columna duplicada: ${col.key}`, path: ["columns", i, "key"] });
      }
      seen.add(col.key);
    });
    if (c.minRows !== undefined && c.maxRows !== undefined && c.minRows > c.maxRows) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "minRows no puede superar maxRows", path: ["minRows"] });
    }
  });
export type TableFieldConfig = z.infer<typeof tableFieldConfigSchema>;

/** Un eje (fila o columna) de MATRIX: clave estable + rótulo visible. */
export const matrixAxisItemSchema = z
  .object({
    key: cellKeySchema,
    label: z.string().trim().min(1).max(120),
  })
  .strict();
export type MatrixAxisItem = z.infer<typeof matrixAxisItemSchema>;

/**
 * MATRIX — parámetro×turno. Filas (parámetros) y columnas (turnos/intervalos) son
 * FIJAS y configuradas; cada celda es del MISMO sub-tipo escalar (`cell`). El valor
 * es `Record<rowKey, Record<colKey, escalar>>`. Cabeceras read-only.
 */
export const matrixFieldConfigSchema = z
  .object({
    rows: z.array(matrixAxisItemSchema).min(1).max(MATRIX_MAX_ROWS),
    columns: z.array(matrixAxisItemSchema).min(1).max(MATRIX_MAX_COLUMNS),
    cell: z
      .object({
        type: structuredCellTypeSchema,
        config: z.record(z.unknown()).optional(),
      })
      .strict(),
    /** Rótulo de la cabecera de la columna de parámetros (default "Parámetro"). */
    rowHeaderLabel: z.string().trim().max(60).optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    const seenR = new Set<string>();
    c.rows.forEach((r, i) => {
      if (seenR.has(r.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Clave de fila duplicada: ${r.key}`, path: ["rows", i, "key"] });
      seenR.add(r.key);
    });
    const seenC = new Set<string>();
    c.columns.forEach((col, i) => {
      if (seenC.has(col.key)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Clave de columna duplicada: ${col.key}`, path: ["columns", i, "key"] });
      seenC.add(col.key);
    });
    const r = fieldConfigSchemaFor(c.cell.type).safeParse(c.cell.config ?? {});
    if (!r.success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Configuración de celda inválida", path: ["cell", "config"] });
    } else if (nonInlineCellSelect(c.cell.type, r.data)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La celda de selección solo admite opciones definidas (lista de referencia no soportada en celdas)",
        path: ["cell", "config", "optionSource"],
      });
    }
  });
export type MatrixFieldConfig = z.infer<typeof matrixFieldConfigSchema>;

/** Layout EFECTIVO de un TABLE (default `table`). */
export function tableLayoutOf(config: Record<string, unknown>): TableLayout {
  return (config as { layout?: TableLayout }).layout === "cards" ? "cards" : "table";
}

/** Codes inline de una columna/celda SELECT (única fuente de catálogo permitida en celda, MVP). */
export function inlineCellCodes(config: Record<string, unknown> | undefined): Set<string> | undefined {
  const src = (config ?? {}) as { optionSource?: { kind?: string; items?: { code?: unknown }[] } };
  if (src.optionSource?.kind === "inline" && Array.isArray(src.optionSource.items)) {
    return new Set(src.optionSource.items.map((i) => String(i.code)));
  }
  return undefined;
}

/** Vista de una columna como campo para reusar `validateFieldValue` por celda. */
export function columnAsField(col: { key: string; label: string; type: StructuredCellType; config?: Record<string, unknown> }) {
  return { key: col.key, type: col.type as FieldType, dataType: deriveDataType(col.type), label: col.label, config: col.config ?? {} };
}

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
    // --- Ola 2 ---
    case "REFERENCE":
      return referenceFieldConfigSchema;
    case "RISK_MATRIX":
      return riskMatrixFieldConfigSchema;
    // --- Ola 3 ---
    case "ATTACHMENT":
      return attachmentFieldConfigSchema;
    // --- Ola 4 ---
    case "TABLE":
      return tableFieldConfigSchema;
    case "MATRIX":
      return matrixFieldConfigSchema;
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
