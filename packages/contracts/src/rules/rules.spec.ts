import { describe, expect, it } from "vitest";
import { evaluateExpression, type Expression } from "./expression.js";
import {
  coerceComputedValue,
  evaluateCrossRules,
  recomputeComputedValues,
  ruleActionKind,
  ruleHasAction,
  topoSortComputed,
  validateRulesDesign,
  type CrossRule,
  type FieldForRules,
} from "./rules.js";

// Helpers para construir AST legibles en los tests.
const lit = (value: number | string | boolean | null): Expression => ({ kind: "lit", value });
const v = (key: string): Expression => ({ kind: "var", key });
const col = (table: string, column: string): Expression => ({ kind: "col", table, column });
const op = (o: string, ...args: Expression[]): Expression => ({ kind: "op", op: o as never, args });

describe("agregados sobre columnas de tabla (Ola 4)", () => {
  const rows = [{ ton: 100, ley: 1.2 }, { ton: 50, ley: null }, { ton: "30", ley: 0.8 }, {}];
  const values = { lecturas: rows };

  it("sum/avg/min/max/count expanden una columna e ignoran vacíos", () => {
    expect(evaluateExpression(op("sum", col("lecturas", "ton")), values)).toBe(180); // 100+50+30
    expect(evaluateExpression(op("count", col("lecturas", "ton")), values)).toBe(3);
    expect(evaluateExpression(op("avg", col("lecturas", "ley")), values)).toBe(1); // (1.2+0.8)/2
    expect(evaluateExpression(op("max", col("lecturas", "ton")), values)).toBe(100);
    expect(evaluateExpression(op("min", col("lecturas", "ton")), values)).toBe(30);
  });

  it("mezcla columna + escalar; columna inexistente o tabla vacía → 0/null", () => {
    expect(evaluateExpression(op("sum", col("lecturas", "ton"), lit(20)), values)).toBe(200);
    expect(evaluateExpression(op("count", col("lecturas", "noexiste")), values)).toBe(0);
    expect(evaluateExpression(op("sum", col("vacia", "x")), {})).toBeNull();
    // `col` fuera de agregación = vacío (no escalar)
    expect(evaluateExpression(op("add", col("lecturas", "ton"), lit(1)), values)).toBeNull();
  });

  it("validateRulesDesign acepta col sobre TABLE y rechaza col sobre no-tabla", () => {
    const fields: FieldForRules[] = [
      { key: "lecturas", dataType: "TABLE" },
      { key: "total", dataType: "NUMBER", computed: { expression: op("sum", col("lecturas", "ton")) } },
      { key: "n", dataType: "NUMBER" },
      { key: "malo", dataType: "NUMBER", computed: { expression: op("sum", col("n", "x")) } },
    ];
    const errs = validateRulesDesign(fields, []);
    expect(errs.some((e) => e.key === "total")).toBe(false);
    expect(errs.some((e) => e.key === "malo" && /no es una tabla/.test(e.message))).toBe(true);
  });
});

describe("acción de regla (Fase 4.1.2)", () => {
  const baseRule = (over: Partial<CrossRule>): CrossRule => ({
    key: "r1",
    when: op("gt", v("a"), lit(10)),
    severity: "WARN",
    message: "supera el tope",
    ...over,
  });

  it("ruleActionKind / ruleHasAction: ausente = none", () => {
    expect(ruleActionKind(baseRule({}))).toBe("none");
    expect(ruleHasAction(baseRule({}))).toBe(false);
    expect(ruleActionKind(baseRule({ action: { kind: "raiseException" } }))).toBe("raiseException");
    expect(ruleHasAction(baseRule({ action: { kind: "raiseException" } }))).toBe(true);
    expect(
      ruleActionKind(baseRule({ action: { kind: "openIncident", incidentTypeId: "t1", severity: 3 } })),
    ).toBe("openIncident");
  });

  it("validateRulesDesign: acción exige severidad WARN", () => {
    const fields: FieldForRules[] = [{ key: "a", dataType: "NUMBER" }];
    const okWarn = validateRulesDesign(fields, [baseRule({ action: { kind: "raiseException" } })]);
    expect(okWarn.some((e) => /Advertencia/.test(e.message))).toBe(false);
    const badError = validateRulesDesign(fields, [
      baseRule({ severity: "ERROR", action: { kind: "raiseException" } }),
    ]);
    expect(badError.some((e) => e.key === "r1" && /Advertencia/.test(e.message))).toBe(true);
    // Sin acción, ERROR sigue siendo válido.
    const errorNoAction = validateRulesDesign(fields, [baseRule({ severity: "ERROR" })]);
    expect(errorNoAction.some((e) => /Advertencia/.test(e.message))).toBe(false);
  });
});

describe("evaluateExpression — aritmética y nulos", () => {
  it("suma/resta/multiplica/divide", () => {
    expect(evaluateExpression(op("add", lit(2), lit(3)), {})).toBe(5);
    expect(evaluateExpression(op("sub", v("a"), v("b")), { a: 10, b: 4 })).toBe(6);
    expect(evaluateExpression(op("mul", lit(3), lit(4)), {})).toBe(12);
    expect(evaluateExpression(op("div", lit(10), lit(4)), {})).toBe(2.5);
  });

  it("división por cero ⇒ vacío (null)", () => {
    expect(evaluateExpression(op("div", lit(5), lit(0)), {})).toBeNull();
    expect(evaluateExpression(op("div", v("x"), v("y")), { x: 5, y: 0 })).toBeNull();
  });

  it("operando nulo PROPAGA vacío en aritmética binaria", () => {
    expect(evaluateExpression(op("sub", v("a"), v("b")), { a: 10 })).toBeNull();
    expect(evaluateExpression(op("add", v("a"), lit(3)), { a: null })).toBeNull();
    // eficiencia = salida / entrada con entrada vacía ⇒ vacío
    expect(evaluateExpression(op("div", v("salida"), v("entrada")), { salida: 80 })).toBeNull();
  });

  it("coacciona strings numéricos", () => {
    expect(evaluateExpression(op("add", v("a"), v("b")), { a: "2.5", b: "1.5" })).toBe(4);
  });
});

describe("evaluateExpression — agregación (ignora vacíos)", () => {
  it("avg ignora los vacíos; count cuenta no vacíos", () => {
    expect(evaluateExpression(op("avg", v("a"), v("b"), v("c")), { a: 10, b: 20, c: null })).toBe(15);
    expect(evaluateExpression(op("count", v("a"), v("b"), v("c")), { a: 10, b: 20, c: null })).toBe(2);
  });
  it("sum/min/max sobre presentes; lista vacía ⇒ null (count ⇒ 0)", () => {
    expect(evaluateExpression(op("sum", v("a"), v("b")), { a: 3, b: 7 })).toBe(10);
    expect(evaluateExpression(op("min", v("a"), v("b")), { a: 3, b: 7 })).toBe(3);
    expect(evaluateExpression(op("max", v("a"), v("b")), { a: 3, b: 7 })).toBe(7);
    expect(evaluateExpression(op("avg", v("a")), { a: null })).toBeNull();
    expect(evaluateExpression(op("count", v("a")), { a: null })).toBe(0);
  });
});

describe("evaluateExpression — comparación, lógica, condicional", () => {
  it("comparaciones; con operando vacío ⇒ null (omitible)", () => {
    expect(evaluateExpression(op("gt", v("salida"), v("entrada")), { salida: 5, entrada: 3 })).toBe(true);
    expect(evaluateExpression(op("lte", v("a"), v("b")), { a: 5, b: 5 })).toBe(true);
    expect(evaluateExpression(op("gt", v("salida"), v("entrada")), { salida: 5 })).toBeNull();
  });

  it("and/or propagan null; not", () => {
    expect(evaluateExpression(op("and", lit(true), lit(true)), {})).toBe(true);
    expect(evaluateExpression(op("and", lit(true), lit(false)), {})).toBe(false);
    expect(evaluateExpression(op("and", lit(true), v("x")), { x: null })).toBeNull();
    expect(evaluateExpression(op("or", lit(false), lit(true)), {})).toBe(true);
    expect(evaluateExpression(op("not", lit(false)), {})).toBe(true);
  });

  it("if; coalesce; isEmpty", () => {
    expect(evaluateExpression(op("if", op("gt", v("a"), lit(0)), lit("pos"), lit("neg")), { a: 3 })).toBe("pos");
    expect(evaluateExpression(op("coalesce", v("a"), v("b"), lit("def")), { a: null, b: "" })).toBe("def");
    expect(evaluateExpression(op("isEmpty", v("a")), { a: null })).toBe(true);
    expect(evaluateExpression(op("isEmpty", v("a")), { a: "x" })).toBe(false);
  });
});

describe("evaluateExpression — fecha", () => {
  it("dateDiff en horas/días", () => {
    const a = "2026-06-14T08:00:00.000Z";
    const b = "2026-06-14T20:00:00.000Z";
    expect(evaluateExpression(op("dateDiff", lit("hours"), v("a"), v("b")), { a, b })).toBe(12);
    expect(evaluateExpression(op("dateDiff", lit("days"), v("a"), v("b")), { a, b })).toBe(0.5);
  });
  it("now() usa el reloj inyectado (determinista)", () => {
    const now = new Date("2026-06-14T00:00:00.000Z");
    expect(evaluateExpression(op("now"), {}, { now })).toBe("2026-06-14T00:00:00.000Z");
    // días desde última mantención
    const last = "2026-06-04T00:00:00.000Z";
    expect(evaluateExpression(op("dateDiff", lit("days"), v("last"), op("now")), { last }, { now })).toBe(10);
  });
});

describe("recomputeComputedValues — orden topológico y estampado", () => {
  const fields: FieldForRules[] = [
    { key: "ini", dataType: "NUMBER" },
    { key: "fin", dataType: "NUMBER" },
    // consumo depende de campos tecleados
    { key: "consumo", dataType: "NUMBER", computed: { expression: op("sub", v("fin"), v("ini")) } },
    // costo depende de OTRO formulado (consumo) ⇒ debe recomputar después
    { key: "costo", dataType: "NUMBER", computed: { expression: op("mul", v("consumo"), lit(100)) } },
  ];

  it("recomputa formulados encadenados (consumo→costo) en orden", () => {
    const out = recomputeComputedValues(fields, { ini: 10, fin: 25 });
    expect(out.consumo).toBe(15);
    expect(out.costo).toBe(1500);
  });

  it("ignora lo que el cliente mande para campos formulados (servidor manda)", () => {
    const out = recomputeComputedValues(fields, { ini: 10, fin: 25, consumo: 9999, costo: -1 });
    expect(out.consumo).toBe(15);
    expect(out.costo).toBe(1500);
  });

  it("input vacío ⇒ formulado vacío (null)", () => {
    const out = recomputeComputedValues(fields, { ini: 10 });
    expect(out.consumo).toBeNull();
    expect(out.costo).toBeNull();
  });

  it("topoSort sin ciclo da orden con dependencias primero", () => {
    const { order, cycle } = topoSortComputed(fields);
    expect(cycle).toBeNull();
    expect(order.indexOf("consumo")).toBeLessThan(order.indexOf("costo"));
  });
});

describe("coerceComputedValue", () => {
  it("coacciona al dataType del campo", () => {
    expect(coerceComputedValue("NUMBER", "12")).toBe(12);
    expect(coerceComputedValue("NUMBER", "x")).toBeNull();
    expect(coerceComputedValue("BOOLEAN", true)).toBe(true);
    expect(coerceComputedValue("BOOLEAN", 1)).toBeNull();
    expect(coerceComputedValue("DATE", "2026-06-14")).toBe("2026-06-14");
    expect(coerceComputedValue("NUMBER", null)).toBeNull();
  });
});

describe("validateRulesDesign — refs y ciclos (fallar en diseño)", () => {
  it("acepta un diseño válido", () => {
    const fields: FieldForRules[] = [
      { key: "a", dataType: "NUMBER" },
      { key: "b", dataType: "NUMBER", computed: { expression: op("add", v("a"), lit(1)) } },
    ];
    expect(validateRulesDesign(fields, [])).toEqual([]);
  });

  it("detecta referencia a un campo inexistente", () => {
    const fields: FieldForRules[] = [{ key: "b", dataType: "NUMBER", computed: { expression: v("noexiste") } }];
    const errs = validateRulesDesign(fields, []);
    expect(errs.some((e) => e.message.includes("inexistente"))).toBe(true);
  });

  it("detecta auto-referencia", () => {
    const fields: FieldForRules[] = [{ key: "b", dataType: "NUMBER", computed: { expression: v("b") } }];
    const errs = validateRulesDesign(fields, []);
    expect(errs.some((e) => e.message.includes("sí mismo"))).toBe(true);
  });

  it("detecta referencia circular entre formulados", () => {
    const fields: FieldForRules[] = [
      { key: "x", dataType: "NUMBER", computed: { expression: op("add", v("y"), lit(1)) } },
      { key: "y", dataType: "NUMBER", computed: { expression: op("add", v("x"), lit(1)) } },
    ];
    const { cycle } = topoSortComputed(fields);
    expect(cycle).not.toBeNull();
    const errs = validateRulesDesign(fields, []);
    expect(errs.some((e) => e.message.includes("circular"))).toBe(true);
  });

  it("valida refs de reglas cruzadas a campos existentes", () => {
    const fields: FieldForRules[] = [{ key: "a", dataType: "NUMBER" }];
    const rules: CrossRule[] = [{ key: "r1", when: op("gt", v("a"), v("ghost")), severity: "ERROR", message: "x" }];
    const errs = validateRulesDesign(fields, rules);
    expect(errs.some((e) => e.scope === "rule" && e.message.includes("inexistente"))).toBe(true);
  });
});

describe("evaluateCrossRules — disparo, omisión, severidad", () => {
  const rules: CrossRule[] = [
    { key: "salida_mayor", when: op("gt", v("salida"), v("entrada")), severity: "ERROR", message: "Salida > entrada" },
    { key: "alto", when: op("gt", v("temp"), lit(90)), severity: "WARN", message: "Temperatura alta" },
  ];

  it("ERROR dispara cuando la condición es verdadera (bloquea)", () => {
    const r = evaluateCrossRules(rules, { salida: 10, entrada: 5, temp: 50 });
    expect(r.errors.map((e) => e.ruleKey)).toContain("salida_mayor");
    expect(r.warnings).toEqual([]);
  });

  it("WARN dispara aparte de los errores", () => {
    const r = evaluateCrossRules(rules, { salida: 1, entrada: 5, temp: 95 });
    expect(r.errors).toEqual([]);
    expect(r.warnings.map((w) => w.ruleKey)).toContain("alto");
  });

  it("OMITE la regla cuando falta un campo referenciado (null ⇒ no dispara)", () => {
    const r = evaluateCrossRules(rules, { salida: 10 }); // sin entrada ni temp
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it("NO evalúa una regla DESACTIVADA (enabled: false)", () => {
    const off: CrossRule[] = [{ ...rules[0]!, enabled: false }];
    const r = evaluateCrossRules(off, { salida: 10, entrada: 5 });
    expect(r.errors).toEqual([]); // dispararía si estuviera activa
  });
});
