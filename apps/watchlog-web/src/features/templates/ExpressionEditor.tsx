import { Plus, Trash2 } from "lucide-react";
import { Input, Select } from "@lyra/ui";
import type { Expression, ExpressionOperator } from "@lyra/contracts";
import styles from "./TemplateBuilder.module.css";

/**
 * Editor RECURSIVO de una expresión del motor de reglas (Req-7). Construye el AST
 * seguro (lista blanca de operadores) sin texto libre: el diseñador elige tipo de
 * nodo (campo / valor / operación) y operandos. Premium pero acotado al primer corte.
 */

interface FieldRef {
  key: string;
  label: string;
}

/** Metadatos de cada operador: símbolo/función + aridad para el editor. */
interface OpMeta {
  op: ExpressionOperator;
  /** Etiqueta en el selector. */
  label: string;
  /** Símbolo infijo (binario) o null si se muestra como función `nombre(...)`. */
  infix: string | null;
  /** Mínimo de operandos. */
  min: number;
  /** Permite agregar más operandos (variádico). */
  variadic: boolean;
  /** Grupo para el optgroup del selector. */
  group: "arith" | "agg" | "compare" | "logic" | "cond" | "nullish" | "date";
}

const OP_META: readonly OpMeta[] = [
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
  { op: "and", label: "Y (todas)", infix: "Y", min: 2, variadic: true, group: "logic" },
  { op: "or", label: "O (alguna)", infix: "O", min: 2, variadic: true, group: "logic" },
  { op: "not", label: "NO (negar)", infix: null, min: 1, variadic: false, group: "logic" },
  { op: "if", label: "si (cond, entonces, si no)", infix: null, min: 3, variadic: false, group: "cond" },
  { op: "coalesce", label: "primer no vacío", infix: null, min: 1, variadic: true, group: "nullish" },
  { op: "isEmpty", label: "está vacío", infix: null, min: 1, variadic: false, group: "nullish" },
  { op: "dateDiff", label: "diferencia de fechas", infix: null, min: 3, variadic: false, group: "date" },
  { op: "now", label: "ahora (fecha/hora)", infix: null, min: 0, variadic: false, group: "date" },
];
const OP_BY = new Map(OP_META.map((m) => [m.op, m]));

const GROUP_LABEL: Record<OpMeta["group"], string> = {
  arith: "Aritmética",
  agg: "Agregación",
  compare: "Comparación",
  logic: "Lógica",
  cond: "Condicional",
  nullish: "Vacíos",
  date: "Fecha",
};

type NodeKind = "var" | "lit" | "op";
function kindOf(expr: Expression | null): NodeKind | "" {
  return expr ? expr.kind : "";
}

/** Render legible (infijo/función) de una expresión, para el preview. */
function expressionToInfix(expr: Expression | null, labelByKey: Map<string, string>): string {
  if (!expr) return "—";
  if (expr.kind === "lit") {
    if (expr.value === null) return "∅";
    if (typeof expr.value === "string") return `"${expr.value}"`;
    if (typeof expr.value === "boolean") return expr.value ? "verdadero" : "falso";
    return String(expr.value);
  }
  if (expr.kind === "var") return labelByKey.get(expr.key) ?? expr.key;
  const meta = OP_BY.get(expr.op);
  const parts = expr.args.map((a) => expressionToInfix(a, labelByKey));
  if (meta?.infix && expr.args.length === 2) return `(${parts[0]} ${meta.infix} ${parts[1]})`;
  return `${expr.op}(${parts.join(", ")})`;
}

function defaultArg(): Expression {
  return { kind: "lit", value: null };
}

/** Editor de UN operando (recursivo). */
function OperandEditor({
  value,
  onChange,
  fields,
  depth,
}: {
  value: Expression | null;
  onChange: (next: Expression) => void;
  fields: FieldRef[];
  depth: number;
}) {
  const kind = kindOf(value);

  function setKind(k: NodeKind) {
    if (k === "var") onChange({ kind: "var", key: fields[0]?.key ?? "" });
    else if (k === "lit") onChange({ kind: "lit", value: 0 });
    else onChange({ kind: "op", op: "add", args: [defaultArg(), defaultArg()] });
  }

  return (
    <div className={styles.exprOperand} style={{ marginLeft: depth > 0 ? 10 : 0 }}>
      <div className={styles.exprRow}>
        <Select
          aria-label="Tipo"
          value={kind}
          onChange={(e) => setKind(e.target.value as NodeKind)}
          className={styles.exprKindSel}
        >
          <option value="var">Campo</option>
          <option value="lit">Valor</option>
          <option value="op">Operación</option>
        </Select>

        {value?.kind === "var" && (
          <Select aria-label="Campo" value={value.key} onChange={(e) => onChange({ kind: "var", key: e.target.value })}>
            {fields.length === 0 && <option value="">(sin campos)</option>}
            {fields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </Select>
        )}

        {value?.kind === "lit" && (
          <Input
            aria-label="Valor"
            value={value.value === null ? "" : String(value.value)}
            placeholder="número, texto o vacío"
            onChange={(e) => onChange({ kind: "lit", value: coerceLiteral(e.target.value) })}
          />
        )}

        {value?.kind === "op" && (
          <Select
            aria-label="Operación"
            value={value.op}
            onChange={(e) => {
              const op = e.target.value as ExpressionOperator;
              const meta = OP_BY.get(op)!;
              const args = value.args.slice(0, meta.variadic ? undefined : meta.min);
              while (args.length < meta.min) args.push(defaultArg());
              onChange({ kind: "op", op, args });
            }}
          >
            {(["arith", "agg", "compare", "logic", "cond", "nullish", "date"] as const).map((g) => (
              <optgroup key={g} label={GROUP_LABEL[g]}>
                {OP_META.filter((m) => m.group === g).map((m) => (
                  <option key={m.op} value={m.op}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        )}
      </div>

      {value?.kind === "op" && OP_BY.get(value.op)!.min > 0 && (
        <div className={styles.exprArgs}>
          {value.args.map((arg, i) => (
            <div key={i} className={styles.exprArgRow}>
              <OperandEditor
                value={arg}
                fields={fields}
                depth={depth + 1}
                onChange={(next) => {
                  const args = value.args.slice();
                  args[i] = next;
                  onChange({ ...value, args });
                }}
              />
              {OP_BY.get(value.op)!.variadic && value.args.length > OP_BY.get(value.op)!.min && (
                <button
                  type="button"
                  className={styles.iconBtnDanger}
                  aria-label="Quitar operando"
                  onClick={() => onChange({ ...value, args: value.args.filter((_, j) => j !== i) })}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {OP_BY.get(value.op)!.variadic && (
            <button
              type="button"
              className={styles.exprAddArg}
              onClick={() => onChange({ ...value, args: [...value.args, defaultArg()] })}
            >
              <Plus size={12} /> operando
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Convierte el texto de un literal a número / booleano / string / vacío. */
function coerceLiteral(raw: string): number | string | boolean | null {
  const v = raw.trim();
  if (v === "") return null;
  if (v === "true" || v === "verdadero") return true;
  if (v === "false" || v === "falso") return false;
  const n = Number(v);
  if (v !== "" && Number.isFinite(n)) return n;
  return raw;
}

export function ExpressionEditor({
  value,
  onChange,
  fields,
}: {
  value: Expression | null;
  onChange: (next: Expression) => void;
  fields: FieldRef[];
}) {
  const labelByKey = new Map(fields.map((f) => [f.key, f.label]));
  return (
    <div className={styles.exprEditor}>
      <OperandEditor value={value ?? defaultArg()} onChange={onChange} fields={fields} depth={0} />
      <div className={styles.exprPreview} title="Vista previa de la fórmula">
        {expressionToInfix(value ?? null, labelByKey)}
      </div>
    </div>
  );
}
