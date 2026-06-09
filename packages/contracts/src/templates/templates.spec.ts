import { describe, expect, it } from "vitest";
import { fieldConfigSchemaFor, numberFieldConfigSchema } from "./field-types.js";
import { draftFieldInputSchema, saveTemplateDraftRequestSchema } from "./templates.js";

describe("config de campos por tipo", () => {
  it("acepta un NÚMERO con unidad, rango y bandas de umbral (ISA-18.2)", () => {
    const r = numberFieldConfigSchema.safeParse({
      unit: "°C",
      min: 0,
      max: 100,
      warnHigh: 80,
      critHigh: 95,
    });
    expect(r.success).toBe(true);
  });

  it("rechaza min > max en NÚMERO", () => {
    const r = numberFieldConfigSchema.safeParse({ min: 10, max: 5 });
    expect(r.success).toBe(false);
  });

  it("rechaza claves desconocidas en la config (strict)", () => {
    const r = fieldConfigSchemaFor("TEXT").safeParse({ unknownKey: 1 });
    expect(r.success).toBe(false);
  });

  it("valida la config contra el tipo en el input del campo", () => {
    const ok = draftFieldInputSchema.safeParse({
      key: "temp",
      type: "NUMBER",
      label: "Temperatura",
      config: { unit: "°C", max: 85 },
    });
    expect(ok.success).toBe(true);

    const bad = draftFieldInputSchema.safeParse({
      key: "temp",
      type: "NUMBER",
      label: "Temperatura",
      config: { options: [] }, // opciones no aplican a NÚMERO
    });
    expect(bad.success).toBe(false);
  });
});

describe("save del borrador", () => {
  it("rechaza claves de sección duplicadas", () => {
    const r = saveTemplateDraftRequestSchema.safeParse({
      sections: [
        { key: "s1", title: "A", fields: [] },
        { key: "s1", title: "B", fields: [] },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("rechaza claves de campo duplicadas dentro de una sección", () => {
    const r = saveTemplateDraftRequestSchema.safeParse({
      sections: [
        {
          key: "s1",
          title: "A",
          fields: [
            { key: "f1", type: "TEXT", label: "Uno" },
            { key: "f1", type: "TEXT", label: "Dos" },
          ],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("acepta un borrador válido de una sección con campos núcleo", () => {
    const r = saveTemplateDraftRequestSchema.safeParse({
      name: "Turno Chancado",
      sections: [
        {
          key: "operacion",
          title: "Operación",
          fields: [
            { key: "turno", type: "SELECT", label: "Turno", config: { options: [{ value: "dia", label: "Día" }] } },
            { key: "temp", type: "NUMBER", label: "Temperatura", required: true, config: { unit: "°C", max: 85 } },
          ],
        },
      ],
    });
    expect(r.success).toBe(true);
  });
});
