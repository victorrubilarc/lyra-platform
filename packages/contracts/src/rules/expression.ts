import { z } from "zod";

/**
 * Motor de EXPRESIÓN SEGURO del motor de reglas (Req-7, primer corte).
 *
 * Un AST tipo JSONLogic (árbol de operadores serializable a JSON) con una LISTA
 * BLANCA de operadores y un evaluador PURO. NUNCA `eval` ni JS arbitrario: cero
 * superficie de parser, serializa nativo a la versión inmutable (JSONB) y diffea
 * para auditoría GxP. Es la FUENTE ÚNICA: el backend lo evalúa como verdad y el
 * frontend lo reutiliza para feedback inmediato (mismo patrón que `validateFieldValue`).
 *
 * Decisiones (DECISIONS 2026-06-14):
 *  - Lenguaje = AST propio (sin dependencia externa); la legibilidad infija
 *    (`salida > entrada`) es asunto del builder (renderiza), no del almacenamiento.
 *  - Evaluación SÍNCRONA y PURA: sin I/O. Si una regla necesita datos resueltos
 *    (p. ej. metadata de una lista), el llamador los pre-resuelve y los pasa.
 *  - Semántica de NULOS deliberada (ver abajo): la aritmética binaria PROPAGA el
 *    vacío (operando vacío ⇒ resultado vacío; ÷0 ⇒ vacío); las agregaciones
 *    IGNORAN los vacíos (estilo hoja de cálculo). Las condiciones propagan null
 *    para habilitar el "omitir regla cuando falta un campo".
 */

// === Valores ================================================================

/** Valor que circula por el evaluador. `null` = vacío (sin valor / no calculable). */
export type ExprValue = number | string | boolean | null;

// === Operadores (lista blanca) ==============================================

/**
 * Operadores permitidos del PRIMER CORTE (mínimo útil). Cualquier `op` fuera de
 * esta lista es rechazado al validar el diseño. Aridades documentadas abajo.
 */
export const EXPRESSION_OPERATORS = [
  // Aritmética (binaria/unaria; PROPAGAN vacío; ÷0 ⇒ vacío)
  "add", // (a, b) → a + b
  "sub", // (a, b) → a − b
  "mul", // (a, b) → a × b
  "div", // (a, b) → a ÷ b  (b = 0 ⇒ null)
  "neg", // (a)    → −a
  "abs", // (a)    → |a|
  "round", // (a, [decimals]) → redondeo
  "ceil", // (a)
  "floor", // (a)
  // Agregación intra-entrada (variádica; IGNORA vacíos; lista vacía ⇒ null)
  "min", // (…xs)
  "max", // (…xs)
  "sum", // (…xs)
  "avg", // (…xs)
  "count", // (…xs) → nº de operandos NO vacíos
  // Comparación (binaria; vacío/inválido ⇒ null)
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  // Lógica (propaga null)
  "and",
  "or",
  "not",
  // Condicional
  "if", // (cond, then, else)
  // Nulos / vacío
  "coalesce", // (…xs) → primer NO vacío, o null
  "isEmpty", // (a) → boolean
  // Fecha
  "dateDiff", // (unit, a, b) → (b − a) en `unit`  (unit ∈ days|hours|minutes|seconds)
  "now", // () → instante actual (ISO), del reloj pasado en opts
] as const;
export const expressionOperatorSchema = z.enum(EXPRESSION_OPERATORS);
export type ExpressionOperator = z.infer<typeof expressionOperatorSchema>;

// === AST ====================================================================

/** Cota dura contra árboles patológicos (validada al guardar el diseño). */
export const MAX_EXPRESSION_NODES = 200;
export const MAX_EXPRESSION_DEPTH = 24;

const literalValueSchema = z.union([z.number(), z.string().max(500), z.boolean(), z.null()]);

/**
 * Nodo del AST (unión etiquetada por `kind`):
 *  - `lit`: literal (número/string/booleano/null).
 *  - `var`: referencia a un campo de la versión por su `key` estable.
 *  - `op` : operador de la lista blanca aplicado a sub-expresiones.
 */
export type Expression =
  | { kind: "lit"; value: number | string | boolean | null }
  | { kind: "var"; key: string }
  | { kind: "op"; op: ExpressionOperator; args: Expression[] };

export const expressionSchema: z.ZodType<Expression> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("lit"), value: literalValueSchema }),
    z.object({ kind: z.literal("var"), key: z.string().trim().min(1).max(64) }),
    z.object({
      kind: z.literal("op"),
      op: expressionOperatorSchema,
      args: z.array(expressionSchema).max(50),
    }),
  ]),
);

// === Análisis estático ======================================================

/** Recolecta TODAS las `key` referenciadas por `var(...)` en una expresión (dependencias). */
export function collectVarRefs(expr: Expression, into: Set<string> = new Set()): Set<string> {
  if (expr.kind === "var") into.add(expr.key);
  else if (expr.kind === "op") for (const a of expr.args) collectVarRefs(a, into);
  return into;
}

/** Nº de nodos del AST (para la cota `MAX_EXPRESSION_NODES`). */
export function countNodes(expr: Expression): number {
  if (expr.kind !== "op") return 1;
  return 1 + expr.args.reduce((acc, a) => acc + countNodes(a), 0);
}

/** Profundidad del AST (para la cota `MAX_EXPRESSION_DEPTH`). */
export function expressionDepth(expr: Expression): number {
  if (expr.kind !== "op" || expr.args.length === 0) return 1;
  return 1 + Math.max(...expr.args.map(expressionDepth));
}

/**
 * Valida que una expresión esté ACOTADA (nodos/profundidad). El operador ya está
 * en la lista blanca por el esquema Zod; aquí se frenan árboles patológicos. La
 * usa el backend al guardar/publicar el diseño. Devuelve mensaje de error o null.
 */
export function validateExpressionBounds(expr: Expression): string | null {
  if (countNodes(expr) > MAX_EXPRESSION_NODES) return `La expresión excede ${MAX_EXPRESSION_NODES} nodos`;
  if (expressionDepth(expr) > MAX_EXPRESSION_DEPTH) return `La expresión excede ${MAX_EXPRESSION_DEPTH} niveles de anidación`;
  return null;
}

// === Evaluación =============================================================

export interface EvaluateOptions {
  /** Reloj para `now()` (el servidor pasa su reloj; el cliente `new Date()`). */
  now?: Date;
}

/** ¿El valor cuenta como VACÍO? (null/undefined, string en blanco, arreglo vacío). */
function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Coerción numérica robusta. Vacío/no finito ⇒ null. */
function toNum(v: ExprValue): number | null {
  if (isEmpty(v)) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Coerción a condición. null si el valor es vacío (propaga "no calculable"). */
function toCond(v: ExprValue): boolean | null {
  if (isEmpty(v)) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return true; // string no vacío
}

const MS_PER_UNIT: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

function toTime(v: ExprValue): number | null {
  if (isEmpty(v) || typeof v !== "string") return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/**
 * Evalúa una expresión contra la foto de valores por `key`. PURO y SÍNCRONO.
 * Devuelve `ExprValue` (null = vacío / no calculable). No lanza por datos de
 * llenado: ante operandos inválidos devuelve null (la responsabilidad de "qué
 * significa null" la pone el llamador: campo formulado ⇒ vacío; condición ⇒ omitir).
 */
export function evaluateExpression(
  expr: Expression,
  valuesByKey: Record<string, unknown>,
  opts: EvaluateOptions = {},
): ExprValue {
  switch (expr.kind) {
    case "lit":
      return expr.value;
    case "var": {
      const raw = valuesByKey[expr.key];
      // Normaliza a ExprValue: arreglos/objetos no son escalares ⇒ se tratan vacíos aquí.
      if (raw === undefined) return null;
      if (raw === null || typeof raw === "number" || typeof raw === "string" || typeof raw === "boolean") {
        return raw;
      }
      return null;
    }
    case "op":
      return evalOp(expr.op, expr.args, valuesByKey, opts);
  }
}

function evalOp(
  op: ExpressionOperator,
  args: Expression[],
  values: Record<string, unknown>,
  opts: EvaluateOptions,
): ExprValue {
  // Tolera operandos faltantes (aridad incompleta ⇒ ese operando es vacío/null).
  const ev = (e: Expression | undefined): ExprValue => (e === undefined ? null : evaluateExpression(e, values, opts));

  switch (op) {
    // --- Aritmética binaria/unaria: PROPAGA vacío ---------------------------
    case "add":
    case "sub":
    case "mul":
    case "div": {
      const a = toNum(ev(args[0]));
      const b = toNum(ev(args[1]));
      if (a === null || b === null) return null;
      if (op === "add") return a + b;
      if (op === "sub") return a - b;
      if (op === "mul") return a * b;
      return b === 0 ? null : a / b; // ÷0 ⇒ vacío
    }
    case "neg": {
      const a = toNum(ev(args[0]));
      return a === null ? null : -a;
    }
    case "abs": {
      const a = toNum(ev(args[0]));
      return a === null ? null : Math.abs(a);
    }
    case "round": {
      const a = toNum(ev(args[0]));
      if (a === null) return null;
      const d = args.length > 1 ? toNum(ev(args[1])) : 0;
      const factor = 10 ** (d ?? 0);
      return Math.round(a * factor) / factor;
    }
    case "ceil": {
      const a = toNum(ev(args[0]));
      return a === null ? null : Math.ceil(a);
    }
    case "floor": {
      const a = toNum(ev(args[0]));
      return a === null ? null : Math.floor(a);
    }
    // --- Agregación: IGNORA vacíos (estilo hoja de cálculo) -----------------
    case "min":
    case "max":
    case "sum":
    case "avg":
    case "count": {
      const nums = args.map((a) => toNum(ev(a))).filter((n): n is number => n !== null);
      if (op === "count") return nums.length;
      if (nums.length === 0) return null;
      if (op === "min") return Math.min(...nums);
      if (op === "max") return Math.max(...nums);
      const total = nums.reduce((acc, n) => acc + n, 0);
      return op === "sum" ? total : total / nums.length;
    }
    // --- Comparación: vacío/inválido ⇒ null ---------------------------------
    case "eq":
    case "ne": {
      const a = ev(args[0]);
      const b = ev(args[1]);
      const equal = isEmpty(a) && isEmpty(b) ? true : a === b;
      return op === "eq" ? equal : !equal;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = toNum(ev(args[0]));
      const b = toNum(ev(args[1]));
      if (a === null || b === null) return null;
      if (op === "gt") return a > b;
      if (op === "gte") return a >= b;
      if (op === "lt") return a < b;
      return a <= b;
    }
    // --- Lógica: propaga null ------------------------------------------------
    case "and": {
      let sawNull = false;
      for (const a of args) {
        const c = toCond(ev(a));
        if (c === false) return false;
        if (c === null) sawNull = true;
      }
      return sawNull ? null : true;
    }
    case "or": {
      let sawNull = false;
      for (const a of args) {
        const c = toCond(ev(a));
        if (c === true) return true;
        if (c === null) sawNull = true;
      }
      return sawNull ? null : false;
    }
    case "not": {
      const c = toCond(ev(args[0]));
      return c === null ? null : !c;
    }
    // --- Condicional ---------------------------------------------------------
    case "if": {
      const c = toCond(ev(args[0]));
      if (c === null) return null;
      return c ? ev(args[1]) : (args.length > 2 ? ev(args[2]) : null);
    }
    // --- Nulos ---------------------------------------------------------------
    case "coalesce": {
      for (const a of args) {
        const v = ev(a);
        if (!isEmpty(v)) return v;
      }
      return null;
    }
    case "isEmpty":
      return isEmpty(ev(args[0]));
    // --- Fecha ---------------------------------------------------------------
    case "dateDiff": {
      const unitRaw = ev(args[0]);
      const unit = typeof unitRaw === "string" ? unitRaw : "days";
      const ms = MS_PER_UNIT[unit];
      if (!ms) return null;
      const a = toTime(ev(args[1]));
      const b = toTime(ev(args[2]));
      if (a === null || b === null) return null;
      return (b - a) / ms;
    }
    case "now":
      return (opts.now ?? new Date()).toISOString();
  }
}
