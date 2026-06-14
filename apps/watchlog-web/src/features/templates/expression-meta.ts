import type { Expression, ExpressionOperator, FieldType } from "@lyra/contracts";

/**
 * Metadatos y utilidades PURAS del editor de expresiones (sin componentes, para
 * no romper el fast-refresh). Reutilizado por `ExpressionEditor` y `RulesEditor`.
 */

/** Campo disponible para construir expresiones: incluye tipo y opciones (para el selector de valores). */
export interface RuleFieldRef {
  key: string;
  label: string;
  type: FieldType;
  /** Opciones {code,label} si el campo es un SELECT/MULTISELECT inline. */
  options?: { code: string; label: string }[];
}

export interface OpMeta {
  op: ExpressionOperator;
  label: string;
  /** Símbolo infijo (binario) o null si se muestra como función `nombre(...)`. */
  infix: string | null;
  min: number;
  variadic: boolean;
  group: "arith" | "agg" | "compare" | "logic" | "cond" | "nullish" | "date";
}

export const OP_META: readonly OpMeta[] = [
  { op: "add", label: "+ sumar", infix: "+", min: 2, variadic: false, group: "arith" },
  { op: "sub", label: "− restar", infix: "−", min: 2, variadic: false, group: "arith" },
  { op: "mul", label: "× multiplicar", infix: "×", min: 2, variadic: false, group: "arith" },
  { op: "div", label: "÷ dividir", infix: "÷", min: 2, variadic: false, group: "arith" },
  { op: "neg", label: "negativo (−x)", infix: null, min: 1, variadic: false, group: "arith" },
  { op: "abs", label: "valor absoluto", infix: null, min: 1, variadic: false, group: "arith" },
  { op: "round", label: "redondear", infix: null, min: 1, variadic: true, group: "arith" },
  { op: "ceil", label: "redondear arriba", infix: null, min: 1, variadic: false, group: "arith" },
  { op: "floor", label: "redondear abajo", infix: null, min: 1, variadic: false, group: "arith" },
  { op: "min", label: "mínimo", infix: null, min: 1, variadic: true, group: "agg" },
  { op: "max", label: "máximo", infix: null, min: 1, variadic: true, group: "agg" },
  { op: "sum", label: "suma (total)", infix: null, min: 1, variadic: true, group: "agg" },
  { op: "avg", label: "promedio", infix: null, min: 1, variadic: true, group: "agg" },
  { op: "count", label: "cantidad (no vacíos)", infix: null, min: 1, variadic: true, group: "agg" },
  { op: "eq", label: "= igual a", infix: "=", min: 2, variadic: false, group: "compare" },
  { op: "ne", label: "≠ distinto de", infix: "≠", min: 2, variadic: false, group: "compare" },
  { op: "gt", label: "> mayor que", infix: ">", min: 2, variadic: false, group: "compare" },
  { op: "gte", label: "≥ mayor o igual", infix: "≥", min: 2, variadic: false, group: "compare" },
  { op: "lt", label: "< menor que", infix: "<", min: 2, variadic: false, group: "compare" },
  { op: "lte", label: "≤ menor o igual", infix: "≤", min: 2, variadic: false, group: "compare" },
  { op: "and", label: "Y (se cumplen todas)", infix: "Y", min: 2, variadic: true, group: "logic" },
  { op: "or", label: "O (se cumple alguna)", infix: "O", min: 2, variadic: true, group: "logic" },
  { op: "not", label: "NO (negar)", infix: null, min: 1, variadic: false, group: "logic" },
  { op: "if", label: "si (cond, entonces, si no)", infix: null, min: 3, variadic: false, group: "cond" },
  { op: "coalesce", label: "primer no vacío", infix: null, min: 1, variadic: true, group: "nullish" },
  { op: "isEmpty", label: "está vacío", infix: null, min: 1, variadic: false, group: "nullish" },
  { op: "dateDiff", label: "diferencia de fechas", infix: null, min: 3, variadic: false, group: "date" },
  { op: "now", label: "ahora (fecha/hora)", infix: null, min: 0, variadic: false, group: "date" },
];
export const OP_BY = new Map(OP_META.map((m) => [m.op, m]));

export const GROUP_LABEL: Record<OpMeta["group"], string> = {
  arith: "Aritmética",
  agg: "Agregación",
  compare: "Comparación",
  logic: "Lógica",
  cond: "Condicional",
  nullish: "Vacíos",
  date: "Fecha",
};
export const GROUP_ORDER = ["compare", "logic", "arith", "agg", "cond", "nullish", "date"] as const;

export const COMPARISON_OPS = new Set<ExpressionOperator>(["eq", "ne", "gt", "gte", "lt", "lte"]);

/** Sugerencia de valores para el operando "Valor" (selector según el campo comparado). */
export type ValueSuggest = { kind: "select"; options: { code: string; label: string }[] } | { kind: "boolean" } | undefined;

/**
 * En una comparación, si el OTRO operando es un campo SELECT/BOOLEAN, sugiere sus
 * valores válidos para el operando `i` (así el "Valor" se elige de una lista en vez
 * de escribir códigos a mano — evita errores como comparar contra un código inexistente).
 */
export function deriveValueSuggest(
  op: ExpressionOperator,
  args: Expression[],
  i: number,
  fields: RuleFieldRef[],
): ValueSuggest {
  if (!COMPARISON_OPS.has(op)) return undefined;
  const other = args.find((a, j) => j !== i && a?.kind === "var");
  if (!other || other.kind !== "var") return undefined;
  const f = fields.find((x) => x.key === other.key);
  if (!f) return undefined;
  if (f.type === "BOOLEAN") return { kind: "boolean" };
  if ((f.type === "SELECT" || f.type === "MULTISELECT") && f.options && f.options.length > 0) {
    return { kind: "select", options: f.options };
  }
  return undefined;
}

/** Render legible (infijo/función) de una expresión, para previews y la grilla de reglas. */
export function expressionToInfix(expr: Expression | null, fields: RuleFieldRef[]): string {
  const labelByKey = new Map(fields.map((f) => [f.key, f.label]));
  const optByKey = new Map(fields.map((f) => [f.key, new Map((f.options ?? []).map((o) => [o.code, o.label]))]));
  return render(expr, labelByKey, optByKey);
}

function render(
  expr: Expression | null,
  labelByKey: Map<string, string>,
  optByKey: Map<string, Map<string, string>>,
): string {
  if (!expr) return "—";
  if (expr.kind === "lit") {
    if (expr.value === null) return "∅";
    if (typeof expr.value === "string") return `"${expr.value}"`;
    if (typeof expr.value === "boolean") return expr.value ? "Sí" : "No";
    return String(expr.value);
  }
  if (expr.kind === "var") return labelByKey.get(expr.key) ?? expr.key;
  const meta = OP_BY.get(expr.op);
  const parts = expr.args.map((a) => render(a, labelByKey, optByKey));
  if (meta?.infix && expr.args.length === 2) return `(${parts[0]} ${meta.infix} ${parts[1]})`;
  return `${meta?.label.replace(/^[^a-zA-Z]+/, "").trim() ?? expr.op}(${parts.join(", ")})`;
}
