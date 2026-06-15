import { Plus, Trash2 } from "lucide-react";
import { Input, Select } from "@lyra/ui";
import type { Expression, ExpressionOperator } from "@lyra/contracts";
import {
  GROUP_LABEL,
  GROUP_ORDER,
  OP_BY,
  OP_META,
  deriveValueSuggest,
  expressionToInfix,
  type RuleFieldRef,
  type ValueSuggest,
} from "./expression-meta.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Editor RECURSIVO de una expresión del motor de reglas (Req-7). Construye el AST
 * seguro (lista blanca de operadores) sin texto libre de código: el diseñador elige
 * tipo de nodo (campo / valor / operación) y operandos. Cuando se compara contra un
 * campo de lista o sí/no, el operando "Valor" se elige de un DESPLEGABLE con las
 * opciones válidas (evita escribir códigos a mano).
 */

type NodeKind = "var" | "lit" | "col" | "op";

function defaultArg(): Expression {
  return { kind: "lit", value: null };
}

/** Editor de UN operando (recursivo). `suggest` = valores sugeridos si aplica. */
function OperandEditor({
  value,
  onChange,
  fields,
  depth,
  suggest,
}: {
  value: Expression | null;
  onChange: (next: Expression) => void;
  fields: RuleFieldRef[];
  depth: number;
  suggest?: ValueSuggest;
}) {
  const kind: NodeKind | "" = value ? value.kind : "";
  // Tablas con columnas numéricas: habilitan el operando "Columna de tabla" (agregados).
  const tableFields = fields.filter((f) => f.columns && f.columns.length > 0);

  function setKind(k: NodeKind) {
    if (k === "var") onChange({ kind: "var", key: fields[0]?.key ?? "" });
    else if (k === "lit") onChange({ kind: "lit", value: suggest?.kind === "boolean" ? true : suggest?.kind === "select" ? (suggest.options[0]?.code ?? "") : 0 });
    else if (k === "col") {
      const tf = tableFields[0];
      onChange({ kind: "col", table: tf?.key ?? "", column: tf?.columns?.[0]?.key ?? "" });
    } else onChange({ kind: "op", op: "gt", args: [defaultArg(), defaultArg()] });
  }

  const colTable = value?.kind === "col" ? tableFields.find((f) => f.key === value.table) : undefined;

  return (
    <div className={styles.exprOperand} style={{ marginLeft: depth > 0 ? 10 : 0 }}>
      <div className={styles.exprRow}>
        <Select aria-label="Tipo de operando" value={kind} onChange={(e) => setKind(e.target.value as NodeKind)} className={styles.exprKindSel}>
          <option value="var">Campo</option>
          <option value="lit">Valor</option>
          {tableFields.length > 0 && <option value="col">Columna de tabla</option>}
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

        {value?.kind === "col" && (
          <>
            <Select
              aria-label="Tabla"
              value={value.table}
              onChange={(e) => {
                const tf = tableFields.find((f) => f.key === e.target.value);
                onChange({ kind: "col", table: e.target.value, column: tf?.columns?.[0]?.key ?? "" });
              }}
            >
              {tableFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
            <Select aria-label="Columna" value={value.column} onChange={(e) => onChange({ kind: "col", table: value.table, column: e.target.value })}>
              {(colTable?.columns ?? []).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </Select>
          </>
        )}

        {value?.kind === "lit" && suggest?.kind === "select" && (
          <Select
            aria-label="Valor"
            value={typeof value.value === "string" ? value.value : ""}
            onChange={(e) => onChange({ kind: "lit", value: e.target.value })}
          >
            {suggest.options.map((o) => (
              <option key={o.code} value={o.code}>
                {o.label}
              </option>
            ))}
          </Select>
        )}
        {value?.kind === "lit" && suggest?.kind === "boolean" && (
          <Select
            aria-label="Valor"
            value={value.value === true ? "true" : value.value === false ? "false" : ""}
            onChange={(e) => onChange({ kind: "lit", value: e.target.value === "true" })}
          >
            <option value="true">Sí / Verdadero</option>
            <option value="false">No / Falso</option>
          </Select>
        )}
        {value?.kind === "lit" && !suggest && (
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
            {GROUP_ORDER.map((g) => (
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
                suggest={deriveValueSuggest(value.op, value.args, i, fields)}
                onChange={(next) => {
                  const args = value.args.slice();
                  args[i] = next;
                  onChange({ ...value, args });
                }}
              />
              {OP_BY.get(value.op)!.variadic && value.args.length > OP_BY.get(value.op)!.min && (
                <button type="button" className={styles.iconBtnDanger} aria-label="Quitar operando" onClick={() => onChange({ ...value, args: value.args.filter((_, j) => j !== i) })}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
          {OP_BY.get(value.op)!.variadic && (
            <button type="button" className={styles.exprAddArg} onClick={() => onChange({ ...value, args: [...value.args, defaultArg()] })}>
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
  fields: RuleFieldRef[];
}) {
  return (
    <div className={styles.exprEditor}>
      <OperandEditor value={value ?? defaultArg()} onChange={onChange} fields={fields} depth={0} />
      <div className={styles.exprPreview} title="Vista previa de la fórmula">
        {expressionToInfix(value ?? null, fields)}
      </div>
    </div>
  );
}
