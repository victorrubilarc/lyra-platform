import { describe, expect, it } from "vitest";
import {
  deriveDataType,
  fieldConfigSchemaFor,
  numberFieldConfigSchema,
  optionsFieldConfigSchema,
  upgradeFieldConfig,
} from "./field-types.js";
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

describe("modelo de campo en 3 capas (2.1.1)", () => {
  it("deriva el dataType desde el type (presentación → almacenamiento)", () => {
    expect(deriveDataType("NUMBER")).toBe("NUMBER");
    expect(deriveDataType("TEXT")).toBe("STRING");
    expect(deriveDataType("SELECT")).toBe("CODE");
    expect(deriveDataType("MULTISELECT")).toBe("CODE_ARRAY");
    expect(deriveDataType("SEVERITY")).toBe("CODE");
    expect(deriveDataType("SIGNATURE")).toBe("REFERENCE");
  });
});

describe("optionSource discriminado (2.1.1)", () => {
  it("acepta inline con code/label", () => {
    const r = optionsFieldConfigSchema.safeParse({
      optionSource: { kind: "inline", items: [{ code: "dia", label: "Día" }] },
    });
    expect(r.success).toBe(true);
  });

  it("acepta referenceList por listKey y external por sourceKey (modelados)", () => {
    expect(optionsFieldConfigSchema.safeParse({ optionSource: { kind: "referenceList", listKey: "fallas" } }).success).toBe(true);
    expect(optionsFieldConfigSchema.safeParse({ optionSource: { kind: "external", sourceKey: "erp.equipos" } }).success).toBe(true);
  });

  it("rechaza un kind desconocido en optionSource", () => {
    const r = optionsFieldConfigSchema.safeParse({ optionSource: { kind: "magic", items: [] } });
    expect(r.success).toBe(false);
  });

  it("sube el shape legacy options[]{value,label} a optionSource.inline (sin migración SQL)", () => {
    const r = optionsFieldConfigSchema.safeParse({ options: [{ value: "dia", label: "Día" }] });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.optionSource).toEqual({ kind: "inline", items: [{ code: "dia", label: "Día" }] });
    }
  });

  it("upgradeFieldConfig normaliza solo SELECT/MULTISELECT y es idempotente", () => {
    const upgraded = upgradeFieldConfig("SELECT", { options: [{ value: "a", label: "A" }] });
    expect(upgraded).toEqual({ optionSource: { kind: "inline", items: [{ code: "a", label: "A" }] } });
    // idempotente: el shape nuevo no se vuelve a tocar
    expect(upgradeFieldConfig("SELECT", upgraded)).toEqual(upgraded);
    // no toca tipos no-opción
    expect(upgradeFieldConfig("NUMBER", { unit: "°C" })).toEqual({ unit: "°C" });
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

  it("rechaza dos campos con rol EFFECTIVE_DATE en la misma versión", () => {
    const r = saveTemplateDraftRequestSchema.safeParse({
      sections: [
        {
          key: "s1",
          title: "A",
          fields: [
            { key: "f1", type: "DATE", label: "Fecha 1", semanticRole: "EFFECTIVE_DATE" },
            { key: "f2", type: "DATETIME", label: "Fecha 2", semanticRole: "EFFECTIVE_DATE" },
          ],
        },
      ],
    });
    expect(r.success).toBe(false);
  });

  it("acepta un único campo con rol EFFECTIVE_DATE", () => {
    const r = saveTemplateDraftRequestSchema.safeParse({
      sections: [
        {
          key: "s1",
          title: "A",
          fields: [{ key: "f1", type: "DATE", label: "Fecha lectura", semanticRole: "EFFECTIVE_DATE" }],
        },
      ],
    });
    expect(r.success).toBe(true);
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
