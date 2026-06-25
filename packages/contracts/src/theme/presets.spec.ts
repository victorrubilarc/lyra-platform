import { describe, expect, it } from "vitest";
import { evaluateContrast, paletteTokensSchema, THEME_VARIANTS } from "./palette.js";
import { THEME_PRESETS, themePreset } from "./presets.js";

describe("THEME_PRESETS", () => {
  it("tiene un catálogo curado (8–12 plantillas)", () => {
    expect(THEME_PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(THEME_PRESETS.length).toBeLessThanOrEqual(12);
  });

  it("ids y nombres son únicos", () => {
    const ids = THEME_PRESETS.map((p) => p.id);
    const names = THEME_PRESETS.map((p) => p.name);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("themePreset() resuelve por slug y devuelve undefined si no existe", () => {
    expect(themePreset("grafito")?.name).toBe("Grafito");
    expect(themePreset("no-existe")).toBeUndefined();
  });

  for (const preset of THEME_PRESETS) {
    describe(`plantilla «${preset.name}»`, () => {
      it("solo usa tokens de la whitelist y colores con formato válido", () => {
        // `.strict()` rechaza claves fuera de la whitelist (p. ej. severidad); el schema
        // valida además el formato de cada color. Si algo no calza, esto lanza.
        expect(() => paletteTokensSchema.parse(preset.tokensDark)).not.toThrow();
        expect(() => paletteTokensSchema.parse(preset.tokensLight)).not.toThrow();
      });

      it("NO toca colores funcionales ni de severidad (semántica constante)", () => {
        for (const tokens of [preset.tokensDark, preset.tokensLight]) {
          expect(tokens).not.toHaveProperty("success");
          expect(tokens).not.toHaveProperty("warning");
          expect(tokens).not.toHaveProperty("error");
          expect(tokens).not.toHaveProperty("info");
        }
      });

      for (const variant of THEME_VARIANTS) {
        it(`pasa contraste WCAG AA en variante ${variant}`, () => {
          const tokens = variant === "dark" ? preset.tokensDark : preset.tokensLight;
          const results = evaluateContrast(tokens, variant);
          const failing = results.filter((r) => !r.passes);
          // Mensaje útil si alguna falla: qué par y con qué razón.
          expect(
            failing,
            `Pares que NO pasan AA: ${failing
              .map((f) => `${f.label} (${f.verdict.ratio ?? "—"}:1)`)
              .join(", ")}`,
          ).toEqual([]);
        });
      }
    });
  }
});
