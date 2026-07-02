import { describe, expect, it } from "vitest";
import {
  buildFolioSeqKey,
  folioSchemeWarnings,
  normalizeFolioSegment,
  renderFolio,
  resolveFolioSchemeWith,
  scopeRendersSegment,
  type ResolvedFolioScheme,
} from "./folio.js";
import { DEFAULT_LOG_ENTRY_FOLIO_SCHEME, resolveLogEntryFolioScheme } from "../log-entries/log-entries.js";

const LOGENTRY_DEFAULT: ResolvedFolioScheme = DEFAULT_LOG_ENTRY_FOLIO_SCHEME;

describe("resolveFolioSchemeWith (motor genérico, parametrizado por entidad)", () => {
  it("null/undefined caen al default de la ENTIDAD que llama", () => {
    expect(resolveFolioSchemeWith(null, LOGENTRY_DEFAULT)).toEqual(LOGENTRY_DEFAULT);
    expect(resolveFolioSchemeWith(undefined, LOGENTRY_DEFAULT)).toEqual(LOGENTRY_DEFAULT);
  });

  it("overrides parciales se respetan sobre el default de la entidad", () => {
    const r = resolveFolioSchemeWith({ prefix: "RT", padding: 5 }, LOGENTRY_DEFAULT);
    expect(r).toEqual({ ...LOGENTRY_DEFAULT, prefix: "RT", padding: 5 });
  });
});

describe("folio de bitácora (folio-por-plantilla)", () => {
  it("default de bitácora = serie por plantilla (scope=type) anual, prefijo DOC", () => {
    expect(DEFAULT_LOG_ENTRY_FOLIO_SCHEME).toMatchObject({ scope: "type", reset: "annual", prefix: "DOC" });
  });

  it("scope=type mapea la clave a la PLANTILLA (typeId = Template.id)", () => {
    const scheme = resolveLogEntryFolioScheme({ prefix: "RT" });
    const key = buildFolioSeqKey(scheme, { entity: "logentry", typeId: "tmpl-abc", year: 2026 });
    expect(key).toBe("logentry|type:tmpl-abc|2026");
  });

  it("dos plantillas distintas ⇒ claves de secuencia distintas (series independientes)", () => {
    const scheme = resolveLogEntryFolioScheme({ prefix: "RT" });
    const kA = buildFolioSeqKey(scheme, { entity: "logentry", typeId: "A", year: 2026 });
    const kB = buildFolioSeqKey(scheme, { entity: "logentry", typeId: "B", year: 2026 });
    expect(kA).not.toBe(kB);
  });

  it("render con prefijo propio: RT-2026-0001", () => {
    const scheme = resolveLogEntryFolioScheme({ prefix: "RT" });
    expect(renderFolio(scheme, 1, { year: 2026 })).toBe("RT-2026-0001");
  });
});

describe("folioSchemeWarnings", () => {
  it("dominio global + scope=type ⇒ avisa de posible colisión (bug fix/ot-folio-global)", () => {
    const scheme = resolveFolioSchemeWith({ scope: "type" }, LOGENTRY_DEFAULT);
    const w = folioSchemeWarnings(scheme, "global");
    expect(w.some((m) => m.includes("prefijo distinto"))).toBe(true);
  });

  it("dominio global + scope=node ⇒ SIN aviso (el ámbito inyecta su código en el folio)", () => {
    const scheme = resolveFolioSchemeWith({ scope: "node" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "global")).toHaveLength(0);
  });

  it("dominio per-type + scope=type ⇒ sin avisos (cada plantilla es su serie)", () => {
    const scheme = resolveFolioSchemeWith({ scope: "type" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "per-type")).toHaveLength(0);
  });

  it("máscara sin {SEQ} ⇒ avisa (todos los folios iguales)", () => {
    const scheme = resolveFolioSchemeWith({ mask: "{PREFIX}-{YYYY}" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "per-type").some((m) => m.includes("{SEQ}"))).toBe(true);
  });

  it("máscara + scope=node SIN {SCOPE} ⇒ avisa (el nodo no aparece)", () => {
    const scheme = resolveFolioSchemeWith({ scope: "node", mask: "{PREFIX}-{YYYY}-{SEQ}" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "per-type").some((m) => m.includes("{SCOPE}"))).toBe(true);
  });

  it("máscara + scope=node CON {SCOPE} ⇒ sin ese aviso", () => {
    const scheme = resolveFolioSchemeWith({ scope: "node", mask: "{PREFIX}-{SCOPE}-{YYYY}-{SEQ}" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "per-type").some((m) => m.includes("{SCOPE}"))).toBe(false);
  });

  it("reinicio anual con máscara sin {YYYY} ⇒ avisa de repetición entre años", () => {
    const scheme = resolveFolioSchemeWith({ mask: "{PREFIX}-{SEQ}", reset: "annual" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "per-type").some((m) => m.includes("{YYYY}"))).toBe(true);
  });

  it("esquema canónico global + anual ⇒ sin avisos", () => {
    const scheme = resolveFolioSchemeWith({ scope: "global", reset: "annual" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "global")).toHaveLength(0);
  });
});

describe("segmento de ámbito visible (por nodo/estructura)", () => {
  it("scopeRendersSegment: sólo node/structure", () => {
    expect(scopeRendersSegment("node")).toBe(true);
    expect(scopeRendersSegment("structure")).toBe(true);
    expect(scopeRendersSegment("type")).toBe(false);
    expect(scopeRendersSegment("global")).toBe(false);
  });

  it("normalizeFolioSegment: mayúsculas + sólo [A-Z0-9], sin tildes/espacios; vacío ⇒ null", () => {
    expect(normalizeFolioSegment("Planta Norte")).toBe("PLANTANORTE");
    expect(normalizeFolioSegment("N-01")).toBe("N01");
    expect(normalizeFolioSegment("Molienda Á")).toBe("MOLIENDAA");
    expect(normalizeFolioSegment("   ")).toBeNull();
    expect(normalizeFolioSegment(null)).toBeNull();
  });

  it("canónico con scopeCode: PREFIX-SCOPE-YYYY-SEQ; dos nodos distintos NO colisionan", () => {
    const scheme = resolveFolioSchemeWith({ prefix: "RT", scope: "node" }, LOGENTRY_DEFAULT);
    expect(renderFolio(scheme, 1, { year: 2026, scopeCode: "NORTE" })).toBe("RT-NORTE-2026-0001");
    expect(renderFolio(scheme, 1, { year: 2026, scopeCode: "SUR" })).toBe("RT-SUR-2026-0001");
  });

  it("sin scopeCode se comporta como antes (retrocompatible)", () => {
    const scheme = resolveFolioSchemeWith({ prefix: "RT" }, LOGENTRY_DEFAULT);
    expect(renderFolio(scheme, 1, { year: 2026 })).toBe("RT-2026-0001");
  });

  it("máscara con {SCOPE}", () => {
    const scheme = resolveFolioSchemeWith({ prefix: "RT", scope: "node", mask: "{PREFIX}/{SCOPE}/{YYYY}/{SEQ}", padding: 3 }, LOGENTRY_DEFAULT);
    expect(renderFolio(scheme, 7, { year: 2026, scopeCode: "P1" })).toBe("RT/P1/2026/007");
  });
});
