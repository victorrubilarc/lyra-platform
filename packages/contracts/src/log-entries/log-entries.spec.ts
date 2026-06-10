import { describe, expect, it } from "vitest";
import {
  createLogEntryRequestSchema,
  isEmptyValue,
  isFieldVisible,
  isSectionEditableInState,
  resolveEffectiveAt,
  saveLogEntrySectionRequestSchema,
  validateFieldValue,
  type FieldForValidation,
} from "./log-entries.js";

const numberField = (config: Record<string, unknown> = {}): FieldForValidation => ({
  key: "temp",
  type: "NUMBER",
  dataType: "NUMBER",
  label: "Temperatura",
  config,
});

describe("log-entries — requests", () => {
  it("acepta crear con templateId y rechaza sin él", () => {
    expect(createLogEntryRequestSchema.safeParse({ templateId: "t1" }).success).toBe(true);
    expect(createLogEntryRequestSchema.safeParse({}).success).toBe(false);
  });

  it("saveSection exige expectedVersion >= 0", () => {
    expect(
      saveLogEntrySectionRequestSchema.safeParse({ expectedVersion: 0, values: [] }).success,
    ).toBe(true);
    expect(
      saveLogEntrySectionRequestSchema.safeParse({ expectedVersion: -1, values: [] }).success,
    ).toBe(false);
  });
});

describe("isEmptyValue", () => {
  it("trata null/vacío/[] como vacío y 0/false como NO vacío", () => {
    expect(isEmptyValue(null)).toBe(true);
    expect(isEmptyValue(undefined)).toBe(true);
    expect(isEmptyValue("  ")).toBe(true);
    expect(isEmptyValue([])).toBe(true);
    expect(isEmptyValue(0)).toBe(false);
    expect(isEmptyValue(false)).toBe(false);
    expect(isEmptyValue(["a"])).toBe(false);
  });
});

describe("validateFieldValue — NUMBER", () => {
  it("vacío es válido (lo obligatorio lo decide el llamador)", () => {
    expect(validateFieldValue(numberField(), null).errors).toHaveLength(0);
  });

  it("rechaza fuera de min/max y no-número", () => {
    expect(validateFieldValue(numberField({ min: 0, max: 100 }), 150).errors).toHaveLength(1);
    expect(validateFieldValue(numberField({ min: 0 }), -5).errors).toHaveLength(1);
    expect(validateFieldValue(numberField(), "abc").errors).toHaveLength(1);
  });

  it("bandas de umbral son ADVERTENCIA, no error", () => {
    const r = validateFieldValue(numberField({ max: 100, warnHigh: 80, critHigh: 95 }), 97);
    expect(r.errors).toHaveLength(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("valida decimales", () => {
    expect(validateFieldValue(numberField({ decimals: 1 }), 3.14).errors).toHaveLength(1);
    expect(validateFieldValue(numberField({ decimals: 2 }), 3.14).errors).toHaveLength(0);
  });
});

describe("validateFieldValue — SELECT/MULTISELECT contra catálogo", () => {
  const select: FieldForValidation = { key: "f", type: "SELECT", dataType: "CODE", label: "Modo", config: {} };
  const multi: FieldForValidation = { key: "g", type: "MULTISELECT", dataType: "CODE_ARRAY", label: "Causas", config: {} };

  it("rechaza un code fuera del catálogo", () => {
    expect(validateFieldValue(select, "X", { allowedCodes: ["A", "B"] }).errors).toHaveLength(1);
    expect(validateFieldValue(select, "A", { allowedCodes: ["A", "B"] }).errors).toHaveLength(0);
  });

  it("multiselect: rechaza repetidos y codes inválidos", () => {
    expect(validateFieldValue(multi, ["A", "A"], { allowedCodes: ["A", "B"] }).errors.length).toBeGreaterThan(0);
    expect(validateFieldValue(multi, ["A", "Z"], { allowedCodes: ["A", "B"] }).errors).toHaveLength(1);
    expect(validateFieldValue(multi, ["A", "B"], { allowedCodes: ["A", "B"] }).errors).toHaveLength(0);
  });
});

describe("validateFieldValue — tipos varios", () => {
  it("DATE exige YYYY-MM-DD válido", () => {
    const f: FieldForValidation = { key: "d", type: "DATE", dataType: "DATE", label: "Fecha", config: {} };
    expect(validateFieldValue(f, "2026-06-09").errors).toHaveLength(0);
    expect(validateFieldValue(f, "09/06/2026").errors).toHaveLength(1);
    expect(validateFieldValue(f, "2026-13-40").errors).toHaveLength(1);
  });

  it("SEVERITY exige 1–5", () => {
    const f: FieldForValidation = { key: "s", type: "SEVERITY", dataType: "CODE", label: "Sev", config: {} };
    expect(validateFieldValue(f, 3).errors).toHaveLength(0);
    expect(validateFieldValue(f, 6).errors).toHaveLength(1);
  });

  it("SIGNATURE no es llenable en 2.4", () => {
    const f: FieldForValidation = { key: "sig", type: "SIGNATURE", dataType: "REFERENCE", label: "Firma", config: {} };
    expect(validateFieldValue(f, "x").errors).toHaveLength(1);
  });
});

describe("isFieldVisible", () => {
  const vw = { fieldKey: "tieneFalla", equals: true };
  it("muestra solo cuando la condición se cumple", () => {
    expect(isFieldVisible(null, {})).toBe(true);
    expect(isFieldVisible(vw, { tieneFalla: true })).toBe(true);
    expect(isFieldVisible(vw, { tieneFalla: false })).toBe(false);
    expect(isFieldVisible(vw, {})).toBe(false);
  });
});

describe("resolveEffectiveAt", () => {
  const recordedAt = new Date("2026-06-09T12:00:00Z");
  const sections = [
    { fields: [{ key: "fecha", semanticRole: "EFFECTIVE_DATE" } as never] },
  ] as Parameters<typeof resolveEffectiveAt>[0];

  it("usa el valor del campo EFFECTIVE_DATE cuando existe", () => {
    const r = resolveEffectiveAt(sections, { fecha: "2026-06-01T08:00:00Z" }, recordedAt);
    expect(r.toISOString()).toBe("2026-06-01T08:00:00.000Z");
  });

  it("cae a recordedAt si el campo está vacío o inválido", () => {
    expect(resolveEffectiveAt(sections, { fecha: "" }, recordedAt)).toEqual(recordedAt);
    expect(resolveEffectiveAt(sections, {}, recordedAt)).toEqual(recordedAt);
  });

  it("cae a recordedAt si no hay campo EFFECTIVE_DATE", () => {
    const none = [{ fields: [{ key: "x", semanticRole: null } as never] }] as Parameters<typeof resolveEffectiveAt>[0];
    expect(resolveEffectiveAt(none, { x: "2026-01-01" }, recordedAt)).toEqual(recordedAt);
  });
});

describe("isSectionEditableInState", () => {
  it("null = editable siempre; con flujo, solo en su estado", () => {
    expect(isSectionEditableInState(null, "open")).toBe(true);
    expect(isSectionEditableInState(null, null)).toBe(true);
    expect(isSectionEditableInState("open", "open")).toBe(true);
    expect(isSectionEditableInState("open", "review")).toBe(false);
    expect(isSectionEditableInState("open", null)).toBe(false);
  });
});
