import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORK_ORDER_FOLIO_SCHEME,
  buildFolioSeqKey,
  folioSchemeSchema,
  renderFolio,
  resolveFolioScheme,
} from "./folio.js";

describe("resolveFolioScheme", () => {
  it("null/undefined caen al default OT (por tipo + anual, OT-####)", () => {
    expect(resolveFolioScheme(null)).toEqual(DEFAULT_WORK_ORDER_FOLIO_SCHEME);
    expect(resolveFolioScheme(undefined)).toEqual(DEFAULT_WORK_ORDER_FOLIO_SCHEME);
  });

  it("{} vale y completa con defaults; overrides parciales se respetan", () => {
    expect(resolveFolioScheme({})).toEqual(DEFAULT_WORK_ORDER_FOLIO_SCHEME);
    const r = resolveFolioScheme({ prefix: "PTW", padding: 6, reset: "never" });
    expect(r).toEqual({ ...DEFAULT_WORK_ORDER_FOLIO_SCHEME, prefix: "PTW", padding: 6, reset: "never" });
  });

  it("rechaza claves desconocidas y valores fuera de rango (strict)", () => {
    expect(() => resolveFolioScheme({ foo: 1 })).toThrow();
    expect(() => resolveFolioScheme({ padding: 0 })).toThrow();
    expect(() => resolveFolioScheme({ scope: "planta" })).toThrow();
    expect(folioSchemeSchema.safeParse({ prefix: "" }).success).toBe(false);
  });
});

describe("buildFolioSeqKey", () => {
  const year = 2026;

  it("scope=type + reset=annual (default OT): entidad|type:id|año", () => {
    const key = buildFolioSeqKey(DEFAULT_WORK_ORDER_FOLIO_SCHEME, { entity: "workorder", typeId: "t1", year });
    expect(key).toBe("workorder|type:t1|2026");
  });

  it("scope=global sin reinicio: sin id ni año", () => {
    const scheme = resolveFolioScheme({ scope: "global", reset: "never" });
    expect(buildFolioSeqKey(scheme, { entity: "workorder", year })).toBe("workorder|global");
  });

  it("scope=node/structure usan su id; falta el id ⇒ lanza", () => {
    const byNode = resolveFolioScheme({ scope: "node" });
    expect(buildFolioSeqKey(byNode, { entity: "workorder", orgNodeId: "n1", year })).toBe("workorder|node:n1|2026");
    expect(() => buildFolioSeqKey(byNode, { entity: "workorder", year })).toThrow(/orgNodeId/);
    const byStructure = resolveFolioScheme({ scope: "structure", reset: "never" });
    expect(buildFolioSeqKey(byStructure, { entity: "workorder", structureId: "s1", year })).toBe("workorder|structure:s1");
    expect(() => buildFolioSeqKey(byStructure, { entity: "workorder", year })).toThrow(/structureId/);
  });

  it("misma entidad, distinto año ⇒ claves distintas (reinicio anual)", () => {
    const k26 = buildFolioSeqKey(DEFAULT_WORK_ORDER_FOLIO_SCHEME, { entity: "workorder", typeId: "t1", year: 2026 });
    const k27 = buildFolioSeqKey(DEFAULT_WORK_ORDER_FOLIO_SCHEME, { entity: "workorder", typeId: "t1", year: 2027 });
    expect(k26).not.toBe(k27);
  });
});

describe("renderFolio", () => {
  it("canónico anual: OT-2026-0001", () => {
    expect(renderFolio(DEFAULT_WORK_ORDER_FOLIO_SCHEME, 1, { year: 2026 })).toBe("OT-2026-0001");
    expect(renderFolio(DEFAULT_WORK_ORDER_FOLIO_SCHEME, 137, { year: 2026 })).toBe("OT-2026-0137");
  });

  it("canónico sin reinicio: PREFIX-SEQ (sin año)", () => {
    const scheme = resolveFolioScheme({ reset: "never", padding: 6 });
    expect(renderFolio(scheme, 42, { year: 2026 })).toBe("OT-000042");
  });

  it("máscara con tokens {PREFIX}/{YYYY}/{SEQ}", () => {
    const scheme = resolveFolioScheme({ mask: "{PREFIX}/{YYYY}/{SEQ}", prefix: "REQ", padding: 3 });
    expect(renderFolio(scheme, 7, { year: 2026 })).toBe("REQ/2026/007");
  });

  it("el padding no trunca correlativos largos", () => {
    expect(renderFolio(DEFAULT_WORK_ORDER_FOLIO_SCHEME, 123456, { year: 2026 })).toBe("OT-2026-123456");
  });
});
