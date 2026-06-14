import { z } from "zod";
import {
  collectVarRefs,
  evaluateExpression,
  expressionSchema,
  validateExpressionBounds,
  type EvaluateOptions,
  type Expression,
  type ExprValue,
} from "./expression.js";
import type { FieldDataType } from "../templates/field-types.js";

/**
 * Reglas de negocio por plantilla (Req-7, primer corte) — campos FORMULADOS y
 * validación CRUZADA, sobre el motor de expresión seguro (`./expression.ts`).
 *
 * Ambas piezas viajan en la versión INMUTABLE de la plantilla (GxP: cambiar una
 * fórmula/regla = nueva versión auditada): la fórmula en `TemplateField.computed`
 * y las reglas cruzadas en `TemplateVersion.rules`. Las funciones de este módulo
 * son la FUENTE ÚNICA back↔front: el servidor recomputa/valida como verdad y
 * estampa; el cliente reusa para feedback inmediato.
 */

// === Campo FORMULADO (config en `TemplateField.computed`) ====================

/**
 * Configuración de un campo FORMULADO: el valor se DERIVA de la expresión (no se
 * teclea). El campo conserva su `type`/`dataType` real (NUMBER/DATE…) ⇒ el umbral
 * ISA-18.2 aplica al valor calculado y la grilla/búsqueda/reporte funcionan igual.
 * Presente ⇒ el campo es READ-ONLY y su valor se estampa al guardar (congela al sellar).
 */
export const computedFieldConfigSchema = z
  .object({
    expression: expressionSchema,
  })
  .strict();
export type ComputedFieldConfig = z.infer<typeof computedFieldConfigSchema>;

// === Regla CRUZADA (en `TemplateVersion.rules`) ==============================

/** Severidad de una regla cruzada: ERROR bloquea; WARN informa (como las bandas de umbral). */
export const RULE_SEVERITIES = ["ERROR", "WARN"] as const;
export const ruleSeveritySchema = z.enum(RULE_SEVERITIES);
export type RuleSeverity = z.infer<typeof ruleSeveritySchema>;

/**
 * Regla de validación CRUZADA entre campos. `when` es la CONDICIÓN DE DISPARO
 * (cuando evalúa a `true`, la regla se activa y produce su mensaje). Si a `when`
 * le falta un campo referenciado (vacío), evalúa a null ⇒ la regla se OMITE (no
 * se puede evaluar todavía; no bloquea el guardado de otra sección).
 */
export const crossRuleSchema = z
  .object({
    /** Clave estable de la regla dentro de la versión (para diffs/auditoría). */
    key: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Use letras, números y guión bajo; debe iniciar con letra"),
    /** Condición de disparo (true ⇒ la regla aplica). */
    when: expressionSchema,
    severity: ruleSeveritySchema,
    /** Mensaje mostrado cuando la regla dispara (lo redacta el diseñador). */
    message: z.string().trim().min(1).max(300),
  })
  .strict();
export type CrossRule = z.infer<typeof crossRuleSchema>;

/** Conjunto de reglas cruzadas de una versión (vacío = sin reglas). Tope acotado.
 * Sin `.default` a propósito: el servidor SIEMPRE envía el array, y un default
 * divergiría el tipo input/output del DTO. */
export const templateVersionRulesSchema = z.array(crossRuleSchema).max(100);
export type TemplateVersionRules = z.infer<typeof templateVersionRulesSchema>;

// === Forma mínima de campo para el motor =====================================

/** Subconjunto de un campo necesario para recomputar/validar (independiente del DTO). */
export interface FieldForRules {
  key: string;
  dataType: FieldDataType;
  /** Config de campo formulado; null/ausente = campo tecleado normal. */
  computed?: ComputedFieldConfig | null;
}

/** ¿Es un campo FORMULADO (read-only, valor derivado)? */
export function isComputedField(field: { computed?: ComputedFieldConfig | null }): boolean {
  return !!field.computed;
}

// === Dependencias / orden topológico / ciclos ================================

export interface ComputedCycle {
  /** Claves de campos formulados que forman el ciclo (en orden de detección). */
  keys: string[];
}

interface TopoResult {
  /** Orden de evaluación de los campos formulados (dependencias primero). */
  order: string[];
  /** Ciclo detectado (si lo hay). null = grafo acíclico. */
  cycle: ComputedCycle | null;
}

/**
 * Ordena topológicamente los campos FORMULADOS por sus dependencias (un formulado
 * A va DESPUÉS de un formulado B si A referencia a B). Solo se encadenan
 * dependencias entre formulados; los campos tecleados son insumos hoja. Detecta
 * ciclos (Kahn): si quedan nodos sin emitir, hay una referencia circular.
 */
export function topoSortComputed(fields: FieldForRules[]): TopoResult {
  const computed = fields.filter(isComputedField);
  const computedKeys = new Set(computed.map((f) => f.key));

  // deps[A] = formulados de los que A depende (intersección de sus var-refs con formulados).
  const deps = new Map<string, Set<string>>();
  for (const f of computed) {
    const refs = collectVarRefs(f.computed!.expression);
    const computedDeps = new Set<string>();
    for (const r of refs) if (r !== f.key && computedKeys.has(r)) computedDeps.add(r);
    deps.set(f.key, computedDeps);
  }

  // Kahn: emite los que no tienen deps pendientes.
  const order: string[] = [];
  const remaining = new Set(computedKeys);
  let progress = true;
  while (remaining.size > 0 && progress) {
    progress = false;
    for (const key of [...remaining]) {
      const pending = [...(deps.get(key) ?? [])].some((d) => remaining.has(d));
      if (!pending) {
        order.push(key);
        remaining.delete(key);
        progress = true;
      }
    }
  }

  if (remaining.size > 0) {
    return { order, cycle: { keys: [...remaining] } };
  }
  return { order, cycle: null };
}

// === Validación de diseño (al guardar/publicar la versión) ===================

export interface RulesDesignError {
  /** Dónde está el problema, para que el builder lo ubique. */
  scope: "computed" | "rule";
  /** Clave del campo formulado o de la regla. */
  key: string;
  message: string;
}

/**
 * Valida el diseño de reglas de una versión ANTES de guardar/publicar (fallar en
 * diseño, nunca en llenado):
 *  - cotas de tamaño de cada expresión;
 *  - toda `var(...)` referenciada debe existir como campo de la versión;
 *  - sin referencias CIRCULARES entre campos formulados.
 * Devuelve la lista de errores (vacía = diseño válido).
 */
export function validateRulesDesign(fields: FieldForRules[], rules: CrossRule[]): RulesDesignError[] {
  const errors: RulesDesignError[] = [];
  const allKeys = new Set(fields.map((f) => f.key));

  for (const f of fields) {
    if (!f.computed) continue;
    const bound = validateExpressionBounds(f.computed.expression);
    if (bound) errors.push({ scope: "computed", key: f.key, message: bound });
    for (const ref of collectVarRefs(f.computed.expression)) {
      if (ref === f.key) {
        errors.push({ scope: "computed", key: f.key, message: `El campo formulado no puede referenciarse a sí mismo` });
      } else if (!allKeys.has(ref)) {
        errors.push({ scope: "computed", key: f.key, message: `Referencia a un campo inexistente: ${ref}` });
      }
    }
  }

  for (const r of rules) {
    const bound = validateExpressionBounds(r.when);
    if (bound) errors.push({ scope: "rule", key: r.key, message: bound });
    for (const ref of collectVarRefs(r.when)) {
      if (!allKeys.has(ref)) {
        errors.push({ scope: "rule", key: r.key, message: `Referencia a un campo inexistente: ${ref}` });
      }
    }
  }

  const { cycle } = topoSortComputed(fields);
  if (cycle) {
    for (const key of cycle.keys) {
      errors.push({
        scope: "computed",
        key,
        message: `Referencia circular entre campos formulados: ${cycle.keys.join(" → ")}`,
      });
    }
  }

  return errors;
}

// === Recálculo (fuente única back↔front) =====================================

/**
 * Coerce el resultado de una expresión al `dataType` del campo formulado para
 * estamparlo limpio. NUMBER ⇒ número o null; BOOLEAN ⇒ booleano o null;
 * DATE/DATETIME ⇒ string ISO o null; el resto ⇒ string o null. Un resultado
 * incompatible se estampa como null (vacío) en vez de un valor basura.
 */
export function coerceComputedValue(dataType: FieldDataType, value: ExprValue): ExprValue {
  if (value === null) return null;
  switch (dataType) {
    case "NUMBER": {
      const n = typeof value === "number" ? value : Number(value);
      return Number.isFinite(n) ? n : null;
    }
    case "BOOLEAN":
      return typeof value === "boolean" ? value : null;
    case "DATE":
    case "DATETIME":
      return typeof value === "string" && value.trim() !== "" ? value : null;
    default:
      return typeof value === "string" ? value : String(value);
  }
}

/**
 * Recomputa TODOS los campos formulados a partir de la foto de valores, en orden
 * topológico (dependencias primero, para que un formulado vea a otro ya calculado).
 * Devuelve un NUEVO mapa con los formulados estampados (coercidos a su dataType);
 * los campos tecleados pasan intactos. Si hay un ciclo, recomputa lo que pueda en
 * el orden parcial y deja el resto en null (el diseño ya debió rechazar el ciclo).
 *
 * Servidor (autoritativo): se ejecuta al guardar/sellar e IGNORA lo que el cliente
 * mande para campos formulados. Cliente: para feedback inmediato.
 */
export function recomputeComputedValues(
  fields: FieldForRules[],
  valuesByKey: Record<string, unknown>,
  opts: EvaluateOptions = {},
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...valuesByKey };
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const { order } = topoSortComputed(fields);
  for (const key of order) {
    const field = byKey.get(key);
    if (!field?.computed) continue;
    const raw = evaluateExpression(field.computed.expression, out, opts);
    out[key] = coerceComputedValue(field.dataType, raw);
  }
  return out;
}

// === Evaluación de reglas cruzadas (fuente única back↔front) =================

/** Un disparo de regla cruzada con su severidad y mensaje. */
export interface CrossRuleHit {
  ruleKey: string;
  severity: RuleSeverity;
  message: string;
}

/** Resultado de evaluar todas las reglas cruzadas: errores (bloquean) y advertencias. */
export interface CrossRulesResult {
  errors: CrossRuleHit[];
  warnings: CrossRuleHit[];
}

/**
 * Evalúa las reglas cruzadas contra la foto de valores. Una regla DISPARA si su
 * condición `when` evalúa a `true`; si evalúa a `false` o a `null` (falta un campo
 * referenciado ⇒ no calculable) se OMITE. Los disparos ERROR bloquean; los WARN
 * informan. El llamador debe recomputar los formulados ANTES (una regla puede
 * referenciar un valor calculado). FUENTE ÚNICA: el backend bloquea con esto, el
 * cliente refleja.
 */
export function evaluateCrossRules(
  rules: CrossRule[],
  valuesByKey: Record<string, unknown>,
  opts: EvaluateOptions = {},
): CrossRulesResult {
  const errors: CrossRuleHit[] = [];
  const warnings: CrossRuleHit[] = [];
  for (const rule of rules) {
    const triggered = evaluateExpression(rule.when, valuesByKey, opts) === true;
    if (!triggered) continue;
    const hit: CrossRuleHit = { ruleKey: rule.key, severity: rule.severity, message: rule.message };
    if (rule.severity === "ERROR") errors.push(hit);
    else warnings.push(hit);
  }
  return { errors, warnings };
}
