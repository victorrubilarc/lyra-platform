import { describe, expect, it } from "vitest";
import {
  createSavedViewRequestSchema,
  isSystemViewId,
  LOGBOOK_SYSTEM_VIEWS,
  savedViewConfigSchema,
  updateSavedViewRequestSchema,
} from "./saved-views.js";

describe("savedViewConfigSchema", () => {
  it("aplica defaults a un config vacío", () => {
    const parsed = savedViewConfigSchema.parse({});
    expect(parsed.filters).toEqual({});
    expect(parsed.sort).toEqual([]);
    expect(parsed.density).toBe("comfortable");
    expect(parsed.columns).toEqual({ order: [], hidden: [], pinnedLeft: [], pinnedRight: [], widths: {} });
  });

  it("acepta un config completo de presentación", () => {
    const parsed = savedViewConfigSchema.safeParse({
      filters: { status: "SUBMITTED", orgNodeIds: ["a", "b"], pendingSignature: true },
      sort: [{ field: "effectiveAt", dir: "asc" }],
      columns: { order: ["folio", "summary"], hidden: ["author"], pinnedLeft: ["folio"], widths: { summary: 320 } },
      density: "compact",
    });
    expect(parsed.success).toBe(true);
  });

  it("rechaza más de 3 claves de orden y anchos fuera de rango", () => {
    expect(
      savedViewConfigSchema.safeParse({
        sort: [
          { field: "a", dir: "asc" },
          { field: "b", dir: "asc" },
          { field: "c", dir: "asc" },
          { field: "d", dir: "asc" },
        ],
      }).success,
    ).toBe(false);
    expect(savedViewConfigSchema.safeParse({ columns: { widths: { x: 5000 } } }).success).toBe(false);
  });
});

describe("createSavedViewRequestSchema", () => {
  it("exige módulo válido y nombre no vacío", () => {
    expect(createSavedViewRequestSchema.safeParse({ module: "LOGBOOK", name: "Mi vista", config: {} }).success).toBe(true);
    expect(createSavedViewRequestSchema.safeParse({ module: "NOPE", name: "x", config: {} }).success).toBe(false);
    expect(createSavedViewRequestSchema.safeParse({ module: "LOGBOOK", name: "   ", config: {} }).success).toBe(false);
  });
});

describe("updateSavedViewRequestSchema", () => {
  it("rechaza un PATCH vacío", () => {
    expect(updateSavedViewRequestSchema.safeParse({}).success).toBe(false);
    expect(updateSavedViewRequestSchema.safeParse({ isDefault: true }).success).toBe(true);
  });
});

describe("vistas de sistema", () => {
  it("tienen ids estables con prefijo sys:", () => {
    for (const v of LOGBOOK_SYSTEM_VIEWS) expect(isSystemViewId(v.id)).toBe(true);
    expect(isSystemViewId("ckxyz123")).toBe(false);
  });
});
