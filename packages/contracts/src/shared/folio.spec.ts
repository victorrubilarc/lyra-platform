import { describe, expect, it } from "vitest";
import {
  buildFolioSeqKey,
  folioSchemeWarnings,
  renderFolio,
  resolveFolioSchemeWith,
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
  it("dominio global + scope no-global ⇒ avisa de posible colisión (bug fix/ot-folio-global)", () => {
    const scheme = resolveFolioSchemeWith({ scope: "type" }, LOGENTRY_DEFAULT);
    const w = folioSchemeWarnings(scheme, "global");
    expect(w.some((m) => m.includes("prefijo distinto"))).toBe(true);
  });

  it("dominio per-type + scope=type ⇒ sin avisos (cada plantilla es su serie)", () => {
    const scheme = resolveFolioSchemeWith({ scope: "type" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "per-type")).toHaveLength(0);
  });

  it("máscara sin {SEQ} ⇒ avisa (todos los folios iguales)", () => {
    const scheme = resolveFolioSchemeWith({ mask: "{PREFIX}-{YYYY}" }, LOGENTRY_DEFAULT);
    expect(folioSchemeWarnings(scheme, "per-type").some((m) => m.includes("{SEQ}"))).toBe(true);
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
