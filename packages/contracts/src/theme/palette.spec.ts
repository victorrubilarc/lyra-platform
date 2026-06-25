import { describe, expect, it } from "vitest";
import {
  buildPaletteOverrideCss,
  colorValueSchema,
  effectiveToken,
  evaluateContrast,
  paletteTokensSchema,
  THEME_TOKEN_KEYS,
} from "./palette.js";

describe("colorValueSchema", () => {
  it("acepta hex y rgba", () => {
    expect(colorValueSchema.parse("#06061a")).toBe("#06061a");
    expect(colorValueSchema.parse("rgba(255,255,255,0.08)")).toBe("rgba(255,255,255,0.08)");
  });
  it("rechaza gradientes, url() e inyección", () => {
    expect(() => colorValueSchema.parse("linear-gradient(135deg,#fff,#000)")).toThrow();
    expect(() => colorValueSchema.parse("red; } body { display:none")).toThrow();
    expect(() => colorValueSchema.parse("url(x)")).toThrow();
  });
});

describe("paletteTokensSchema", () => {
  it("es parcial: acepta {}", () => {
    expect(paletteTokensSchema.parse({})).toEqual({});
  });
  it("acepta un subconjunto de claves válidas", () => {
    const p = paletteTokensSchema.parse({ accentPrimary: "#ff0000", bgBase: "#101010" });
    expect(p.accentPrimary).toBe("#ff0000");
  });
  it("rechaza claves fuera de la whitelist (strict)", () => {
    expect(() => paletteTokensSchema.parse({ sev1: "#ff0000" })).toThrow();
    expect(() => paletteTokensSchema.parse({ "--color-bg-base": "#000" })).toThrow();
  });
});

describe("effectiveToken", () => {
  it("usa el override si existe", () => {
    expect(effectiveToken({ bgBase: "#123456" }, "bgBase", "dark")).toBe("#123456");
  });
  it("cae al base de marca por variante si no hay override", () => {
    expect(effectiveToken({}, "bgBase", "dark")).toBe("#06061a");
    expect(effectiveToken({}, "bgBase", "light")).toBe("#eef1f7");
  });
});

describe("buildPaletteOverrideCss", () => {
  it("emite bloques scopeados al workspace por variante", () => {
    const css = buildPaletteOverrideCss({
      tokensDark: { bgBase: "#101010" },
      tokensLight: {},
    });
    expect(css).toContain('[data-wl-themed][data-theme="dark"]');
    expect(css).toContain("--color-bg-base: #101010;");
    // La variante clara no aportó nada → no genera bloque.
    expect(css).not.toContain('[data-theme="light"]');
  });

  it("deriva el gradiente de marca de los acentos", () => {
    const css = buildPaletteOverrideCss({
      tokensDark: { accentPrimary: "#ff0000", accentSecondary: "#00ff00" },
      tokensLight: {},
    });
    expect(css).toContain("--gradient-brand: linear-gradient(135deg, #ff0000, #00ff00);");
    expect(css).toContain("--gradient-brand-subtle:");
    expect(css).toContain("--color-border-accent: rgba(255, 0, 0, 0.4);");
  });

  it("paleta vacía produce string vacío (cae a la marca base)", () => {
    expect(buildPaletteOverrideCss({ tokensDark: {}, tokensLight: {} })).toBe("");
  });

  it("nunca toca tokens de severidad", () => {
    const css = buildPaletteOverrideCss({
      tokensDark: Object.fromEntries(THEME_TOKEN_KEYS.map((k) => [k, "#123456"])),
      tokensLight: {},
    });
    expect(css).not.toContain("--color-sev-");
  });
});

describe("evaluateContrast", () => {
  it("los defaults de marca pasan AA en texto principal y secundario", () => {
    // textMuted es tenue POR DISEÑO (~3.9:1): el builder LO advierte a propósito, así
    // que no se exige aquí. Lo esencial (principal/secundario) sí debe pasar.
    const results = evaluateContrast({}, "dark");
    const essential = results.filter(
      (r) => r.kind === "text" && r.fgKey !== "textMuted",
    );
    expect(essential.every((r) => r.passes)).toBe(true);
  });
  it("detecta contraste insuficiente con un texto demasiado tenue", () => {
    const results = evaluateContrast({ textPrimary: "#0d0d1a" }, "dark");
    const onBase = results.find((r) => r.fgKey === "textPrimary" && r.bgKey === "bgBase");
    expect(onBase?.passes).toBe(false);
  });
});
