import { describe, expect, it } from "vitest";
import {
  createReferenceItemRequestSchema,
  createReferenceListRequestSchema,
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
});
