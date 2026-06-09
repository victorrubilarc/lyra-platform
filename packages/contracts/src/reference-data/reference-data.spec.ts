import { describe, expect, it } from "vitest";
import {
  createReferenceItemRequestSchema,
  createReferenceListRequestSchema,
  referenceImportReportSchema,
  referenceImportRequestSchema,
  referenceSourceSchema,
} from "./reference-data.js";

describe("contratos de datos de referencia", () => {
  it("acepta una lista válida con key slug", () => {
    const r = createReferenceListRequestSchema.safeParse({
      key: "failure-modes",
      name: "Modos de falla (ISO 14224)",
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un key con mayúsculas o espacios", () => {
    expect(createReferenceListRequestSchema.safeParse({ key: "Failure Modes", name: "x" }).success).toBe(false);
    expect(createReferenceListRequestSchema.safeParse({ key: "FALLAS", name: "x" }).success).toBe(false);
  });

  it("source por defecto es opcional pero debe ser MANUAL o EXTERNAL", () => {
    expect(referenceSourceSchema.safeParse("MANUAL").success).toBe(true);
    expect(referenceSourceSchema.safeParse("EXTERNAL").success).toBe(true);
    expect(referenceSourceSchema.safeParse("OTRA").success).toBe(false);
  });

  it("acepta un ítem con code, label y metadata enriquecida", () => {
    const r = createReferenceItemRequestSchema.safeParse({
      code: "VIB",
      label: "Vibración excesiva",
      metadata: { isoCategory: "FM", severityDefault: 3 },
    });
    expect(r.success).toBe(true);
  });

  it("rechaza un ítem sin code", () => {
    expect(createReferenceItemRequestSchema.safeParse({ label: "x" }).success).toBe(false);
  });

  it("import request exige content y dryRun explícito", () => {
    expect(referenceImportRequestSchema.safeParse({ content: "code;label\nA;Alfa", dryRun: true }).success).toBe(true);
    expect(referenceImportRequestSchema.safeParse({ content: "", dryRun: true }).success).toBe(false);
    expect(referenceImportRequestSchema.safeParse({ content: "x" }).success).toBe(false);
  });

  it("el reporte de import valida summary + filas con estado", () => {
    const r = referenceImportReportSchema.safeParse({
      summary: { creates: 1, updates: 1, unchanged: 0, deactivates: 0, errors: 1 },
      rows: [
        { line: 2, code: "VIB", status: "create" },
        { line: 3, code: "LEAK", status: "update", changes: ["label"] },
        { line: 4, status: "error", message: "code requerido" },
      ],
      applied: false,
    });
    expect(r.success).toBe(true);
    expect(referenceImportReportSchema.safeParse({ summary: {}, rows: [], applied: false }).success).toBe(false);
  });
});
