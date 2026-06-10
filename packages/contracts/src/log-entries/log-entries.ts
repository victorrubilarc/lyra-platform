import { z } from "zod";
import { templateVersionSchema, type TemplateFieldDto, type TemplateSectionDto } from "../templates/templates.js";
import type { VisibleWhen } from "../templates/field-types.js";

/**
 * Llenado de bitácoras (Fase 2.4) — EJECUCIÓN de una plantilla.
 *
 * Paradigma EBR/GxP (ver docs/DECISIONS.md 2026-06-09): definición versionada
 * inmutable (`TemplateVersion`) vs **ejecución relacional auditada** (`LogEntry`).
 * La SECCIÓN es la unidad atómica de permiso/llenado/concurrencia/firma. La
 * captura es multi-actor por fases: el operador A llena la sección 1 en T1, el
 * técnico B la sección 2 en T2, resuelto por `secciones × flujo × RBAC/ABAC`.
 *
 * Decisiones de modelo (forks confirmados por el usuario):
 *  - Valores en TABLA HIJA (`LogEntryValue`, 1 fila por campo) + historial
 *    (`LogEntryFieldChange` append-only). El valor de un campo de referencia se
 *    persiste como `code` estable, NO como label (dimensión de DW / FHIR Coding).
 *  - Secciones INSTANCIADAS como filas (portan estado/filledBy/version).
 *  - Concurrencia optimista POR SECCIÓN (`version` check-and-bump).
 *  - Sellado: `recordedAt` al crear (inmutable); `effectiveAt` + dimensiones de
 *    turno se recalculan en DRAFT y se CONGELAN al enviar (`sealedAt`).
 *
 * Límite de 2.4 (la EJECUCIÓN DE FLUJO es 2.5): la entrada permanece en su
 * estado inicial; las transiciones y las firmas Part 11 NO se ejecutan aquí.
 */

// === Enums ===================================================================

/** Ciclo de vida grueso de la entrada (independiente del estado configurable del flujo). */
export const LOG_ENTRY_STATUSES = ["DRAFT", "SUBMITTED", "VOID"] as const;
export const logEntryStatusSchema = z.enum(LOG_ENTRY_STATUSES);
export type LogEntryStatus = z.infer<typeof logEntryStatusSchema>;

/** Estado de completitud de una sección instanciada. */
export const LOG_ENTRY_SECTION_STATES = ["PENDING", "IN_PROGRESS", "COMPLETED", "LOCKED"] as const;
export const logEntrySectionStateSchema = z.enum(LOG_ENTRY_SECTION_STATES);
export type LogEntrySectionState = z.infer<typeof logEntrySectionStateSchema>;

// === Entidades (forma de respuesta; fechas como ISO string) ==================

/** Valor actual de un campo (el `value` viaja como JSON arbitrario, tipado por dataType). */
export const logEntryValueSchema = z.object({
  fieldKey: z.string(),
  /** code/code[]/número/booleano/fecha ISO/etc. null = sin valor. */
  value: z.unknown().nullable(),
  updatedAt: z.string(),
  updatedById: z.string().nullable(),
});
export type LogEntryValueDto = z.infer<typeof logEntryValueSchema>;

/**
 * Estado de EJECUCIÓN de una sección (no su definición, que vive en la versión).
 * `editable` lo resuelve el backend para el usuario que pide el detalle =
 * (sección editable en el estado actual) × (rol con permiso de sección) × (ABAC).
 */
export const logEntrySectionStateDtoSchema = z.object({
  sectionKey: z.string(),
  state: logEntrySectionStateSchema,
  filledById: z.string().nullable(),
  filledByName: z.string().nullable(),
  filledAt: z.string().nullable(),
  /** Revisión para la concurrencia optimista por sección (check-and-bump). */
  version: z.number().int(),
  /** ¿Puede ESTE usuario editar la sección ahora? (decidido en backend). */
  editable: z.boolean(),
});
export type LogEntrySectionStateDto = z.infer<typeof logEntrySectionStateDtoSchema>;

/** Cabecera de la entrada: campos de SISTEMA intrínsecos (columnas indexadas). */
export const logEntrySchema = z.object({
  id: z.string(),
  templateId: z.string(),
  templateVersionId: z.string(),
  // Flujo DENORMALIZADO (copiado al crear). null = plantilla sin flujo (form simple).
  workflowDefinitionId: z.string().nullable(),
  workflowDefinitionVersionId: z.string().nullable(),
  orgNodeId: z.string(),
  equipmentId: z.string().nullable(),
  /** Estado del flujo (clave); null = sin flujo. En 2.4 queda en el estado inicial. */
  currentStateKey: z.string().nullable(),
  status: logEntryStatusSchema,
  /** Marca de captura (commit), inmutable. */
  recordedAt: z.string(),
  /** Fecha efectiva de negocio (del campo EFFECTIVE_DATE, fallback recordedAt). */
  effectiveAt: z.string(),
  // Dimensiones operacionales estampadas vía ShiftResolver (nullable = sin calendario).
  shiftCode: z.string().nullable(),
  operationalDate: z.string().nullable(),
  periodKey: z.string().nullable(),
  /** Instante en que se congelaron effectiveAt + dimensiones (al enviar). null = aún DRAFT. */
  sealedAt: z.string().nullable(),
  createdById: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LogEntryDto = z.infer<typeof logEntrySchema>;

/**
 * Detalle de llenado: cabecera + DEFINICIÓN congelada (la versión de plantilla,
 * para renderizar) + ESTADO de ejecución por sección + valores actuales. El
 * cliente une definición y ejecución por `sectionKey`/`fieldKey`.
 */
export const logEntryDetailSchema = logEntrySchema.extend({
  /** Definición congelada que se está llenando (secciones → campos → config). */
  version: templateVersionSchema,
  /** Nombre legible de la plantilla y ruta del nodo (cabecera de la pantalla). */
  templateName: z.string(),
  orgNodePath: z.string().nullable(),
  sectionStates: z.array(logEntrySectionStateDtoSchema),
  values: z.array(logEntryValueSchema),
});
export type LogEntryDetail = z.infer<typeof logEntryDetailSchema>;

/** Ítem de listado de entradas (vista de bitácoras 2.6 / pruebas). */
export const logEntryListItemSchema = logEntrySchema.extend({
  templateName: z.string(),
  orgNodePath: z.string().nullable(),
});
export type LogEntryListItem = z.infer<typeof logEntryListItemSchema>;

// === Requests ================================================================

export const createLogEntryRequestSchema = z.object({
  templateId: z.string().min(1),
  /** Nodo de la entrada. Si se omite, hereda el de la plantilla (debe existir uno). */
  orgNodeId: z.string().nullable().optional(),
  /** Equipo opcional al que refiere el registro. */
  equipmentId: z.string().nullable().optional(),
});
export type CreateLogEntryRequest = z.infer<typeof createLogEntryRequestSchema>;

/** Un valor que el cliente envía al guardar una sección. */
export const logEntryValueInputSchema = z.object({
  fieldKey: z.string().min(1).max(64),
  value: z.unknown().nullable(),
});
export type LogEntryValueInput = z.infer<typeof logEntryValueInputSchema>;

export const saveLogEntrySectionRequestSchema = z.object({
  /** Revisión que el cliente cree vigente (concurrencia optimista por sección). */
  expectedVersion: z.number().int().min(0),
  values: z.array(logEntryValueInputSchema).max(500),
  /** Marca la sección como COMPLETED (exige obligatorios visibles llenos). */
  markComplete: z.boolean().optional(),
});
export type SaveLogEntrySectionRequest = z.infer<typeof saveLogEntrySectionRequestSchema>;

export const submitLogEntryRequestSchema = z.object({
  note: z.string().trim().max(500).optional(),
});
export type SubmitLogEntryRequest = z.infer<typeof submitLogEntryRequestSchema>;

export const logEntryListQuerySchema = z.object({
  templateId: z.string().optional(),
  orgNodeId: z.string().optional(),
  status: logEntryStatusSchema.optional(),
});
export type LogEntryListQuery = z.infer<typeof logEntryListQuerySchema>;

// === Lógica compartida (fuente única backend + frontend) =====================

/** ¿Está vacío el valor (a efectos de "obligatorio")? */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Visibilidad condicional de un campo dada la foto de valores por clave. Espejo
 * del `showIf` del prototipo: visible si no hay condición, o si el campo
 * referenciado es igual al valor esperado. Fuente única (la usa el backend para
 * no exigir/validar campos ocultos y el frontend para mostrarlos).
 */
export function isFieldVisible(
  visibleWhen: VisibleWhen | null | undefined,
  valuesByKey: Record<string, unknown>,
): boolean {
  if (!visibleWhen) return true;
  const current = valuesByKey[visibleWhen.fieldKey];
  // Comparación laxa por valor (los selects guardan code string; números/booleanos directos).
  return current === visibleWhen.equals;
}

/** Resultado de validar un único valor de campo. */
export interface FieldValueValidation {
  errors: string[];
  warnings: string[];
}

/** Forma mínima de un campo para validar su valor (subconjunto del DTO). */
export interface FieldForValidation {
  key: string;
  type: TemplateFieldDto["type"];
  dataType: TemplateFieldDto["dataType"];
  label: string;
  config: Record<string, unknown>;
}

/** Opciones de validación: códigos permitidos resueltos por el backend (listas vivas). */
export interface ValidateFieldValueOptions {
  /** Conjunto de `code` válidos para SELECT/MULTISELECT (inline o lista resuelta). */
  allowedCodes?: ReadonlySet<string> | readonly string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida un valor de campo contra su tipo/config. NO decide "obligatorio" (eso lo
 * resuelve el llamador con `isEmptyValue` + completitud): aquí, un valor vacío es
 * válido. Devuelve errores (rechazan el guardado) y advertencias (bandas de
 * umbral ISA-18.2: se registran pero no bloquean; disparan incidencia en Fase 4).
 *
 * Es la FUENTE ÚNICA de validación de valor: el backend la ejecuta como verdad,
 * el frontend la reutiliza para feedback inmediato.
 */
export function validateFieldValue(
  field: FieldForValidation,
  value: unknown,
  opts: ValidateFieldValueOptions = {},
): FieldValueValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (isEmptyValue(value)) return { errors, warnings };

  const allowed =
    opts.allowedCodes instanceof Set
      ? opts.allowedCodes
      : opts.allowedCodes
        ? new Set(opts.allowedCodes as readonly string[])
        : undefined;

  switch (field.type) {
    case "NUMBER": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(n)) {
        errors.push(`${field.label}: debe ser un número`);
        break;
      }
      const c = field.config as {
        min?: number;
        max?: number;
        warnLow?: number;
        warnHigh?: number;
        critLow?: number;
        critHigh?: number;
        decimals?: number;
      };
      if (typeof c.min === "number" && n < c.min) errors.push(`${field.label}: por debajo del mínimo (${c.min})`);
      if (typeof c.max === "number" && n > c.max) errors.push(`${field.label}: por encima del máximo (${c.max})`);
      if (typeof c.decimals === "number") {
        const factor = 10 ** c.decimals;
        if (Math.round(n * factor) !== n * factor) {
          errors.push(`${field.label}: máximo ${c.decimals} decimal(es)`);
        }
      }
      // Bandas de umbral (advertencia, no bloquean).
      if (typeof c.critLow === "number" && n < c.critLow) warnings.push(`${field.label}: bajo crítico`);
      else if (typeof c.warnLow === "number" && n < c.warnLow) warnings.push(`${field.label}: bajo advertencia`);
      if (typeof c.critHigh === "number" && n > c.critHigh) warnings.push(`${field.label}: alto crítico`);
      else if (typeof c.warnHigh === "number" && n > c.warnHigh) warnings.push(`${field.label}: alto advertencia`);
      break;
    }
    case "TEXT":
    case "TEXTAREA": {
      if (typeof value !== "string") {
        errors.push(`${field.label}: debe ser texto`);
        break;
      }
      const c = field.config as { minLength?: number; maxLength?: number; pattern?: string };
      if (typeof c.minLength === "number" && value.length < c.minLength)
        errors.push(`${field.label}: mínimo ${c.minLength} caracteres`);
      if (typeof c.maxLength === "number" && value.length > c.maxLength)
        errors.push(`${field.label}: máximo ${c.maxLength} caracteres`);
      if (c.pattern) {
        try {
          if (!new RegExp(c.pattern).test(value)) errors.push(`${field.label}: formato inválido`);
        } catch {
          /* patrón inválido en la plantilla: ignora la validación de formato */
        }
      }
      break;
    }
    case "SELECT": {
      if (typeof value !== "string") {
        errors.push(`${field.label}: selección inválida`);
        break;
      }
      if (allowed && !allowed.has(value)) errors.push(`${field.label}: opción fuera del catálogo`);
      break;
    }
    case "MULTISELECT": {
      if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
        errors.push(`${field.label}: selección múltiple inválida`);
        break;
      }
      if (new Set(value as string[]).size !== value.length) errors.push(`${field.label}: opciones repetidas`);
      if (allowed) {
        for (const code of value as string[]) {
          if (!allowed.has(code)) {
            errors.push(`${field.label}: opción fuera del catálogo (${code})`);
            break;
          }
        }
      }
      break;
    }
    case "BOOLEAN": {
      if (typeof value !== "boolean") errors.push(`${field.label}: debe ser verdadero/falso`);
      break;
    }
    case "DATE": {
      if (typeof value !== "string" || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value)))
        errors.push(`${field.label}: fecha inválida (YYYY-MM-DD)`);
      break;
    }
    case "DATETIME": {
      if (typeof value !== "string" || Number.isNaN(Date.parse(value)))
        errors.push(`${field.label}: fecha y hora inválidas`);
      break;
    }
    case "SEVERITY": {
      const n = typeof value === "number" ? value : Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 5) errors.push(`${field.label}: severidad fuera de rango (1–5)`);
      break;
    }
    case "SIGNATURE": {
      // La firma electrónica (Part 11) se captura en la ejecución de flujo (2.5).
      errors.push(`${field.label}: la firma se realiza al ejecutar el flujo`);
      break;
    }
  }
  return { errors, warnings };
}

/**
 * Deriva la fecha efectiva de una versión a partir de sus valores: el valor del
 * campo con `semanticRole = EFFECTIVE_DATE`; si no hay (o está vacío/ inválido),
 * cae a `recordedAt`. Fuente única para el estampado en backend.
 */
export function resolveEffectiveAt(
  sections: Pick<TemplateSectionDto, "fields">[],
  valuesByKey: Record<string, unknown>,
  recordedAt: Date,
): Date {
  for (const section of sections) {
    for (const field of section.fields) {
      if (field.semanticRole !== "EFFECTIVE_DATE") continue;
      const raw = valuesByKey[field.key];
      if (typeof raw === "string" && raw.trim() !== "") {
        const parsed = Date.parse(raw);
        if (!Number.isNaN(parsed)) return new Date(parsed);
      }
      return recordedAt;
    }
  }
  return recordedAt;
}

/** ¿Es la sección editable en el estado de flujo dado? (parte de la editabilidad). */
export function isSectionEditableInState(
  editableInStateKey: string | null,
  currentStateKey: string | null,
): boolean {
  // null = editable siempre (form simple). Con flujo, solo en su estado declarado.
  if (editableInStateKey === null) return true;
  return editableInStateKey === currentStateKey;
}
