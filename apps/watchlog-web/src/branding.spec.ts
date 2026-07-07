import { describe, expect, it } from "vitest";
import { documentTitleFor, licenseeInitials, type Branding } from "./branding.js";

function branding(over: Partial<Branding>): Branding {
  return {
    loaded: true,
    companyName: null,
    logoUrl: null,
    defaultThemeMode: null,
    whiteLabel: false,
    mode: "lyra",
    ...over,
  };
}

/** Matriz de marca (decisión (b) 2026-07-06): título del documento por modo. */
describe("documentTitleFor", () => {
  it("sin nombre configurado: marca base", () => {
    expect(documentTitleFor(branding({}))).toBe("Lyra WatchLog");
  });

  it("co-branding: empresa · producto", () => {
    expect(documentTitleFor(branding({ companyName: "Minera Demo", mode: "cobrand" }))).toBe(
      "Minera Demo · Lyra WatchLog",
    );
  });

  it("marca blanca (L6d): SOLO la empresa", () => {
    expect(
      documentTitleFor(branding({ companyName: "Minera Demo", whiteLabel: true, mode: "whitelabel" })),
    ).toBe("Minera Demo");
  });
});

describe("licenseeInitials", () => {
  it("1–2 letras según las palabras del nombre", () => {
    expect(licenseeInitials("Minera Los Andes")).toBe("MA");
    expect(licenseeInitials("Codelco")).toBe("CO");
    expect(licenseeInitials("  ")).toBe("·");
  });
});
