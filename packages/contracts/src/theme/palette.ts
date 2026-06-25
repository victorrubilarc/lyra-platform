import { z } from "zod";
import { rateContrast, withAlpha, type ContrastVerdict } from "./contrast.js";

/**
 * Sistema de TEMAS / PALETAS administrable (EST-TEMAS). Un admin construye paletas de
 * color de marca (variante CLARA y OSCURA), las PUBLICA con un flag y marca UNA por
 * defecto; los usuarios eligen entre las publicadas. Se construye SOBRE el sistema de
 * tokens existente (`packages/ui/src/tokens/index.css`): una paleta es un OVERRIDE
 * PARCIAL de un conjunto ACOTADO y curado de tokens "temáticos" (los mismos ~que
 * redefine `[data-theme]`), nunca CSS suelto ni un fork de los tokens.
 *
 * Reglas de la identidad Lyra (CLAUDE.md):
 *  - El gradiente de marca se DERIVA de los acentos de la paleta (coherencia logo/CTA).
 *  - La escala de SEVERIDAD (1–5) es SEMÁNTICA y queda PROTEGIDA: no es editable.
 *  - El login se mantiene SIEMPRE en la identidad oscura de marca; la paleta aplica al
 *    WORKSPACE (override scopeado), no a la entrada.
 */

/** Rol semántico de un token editable (gobierna el emparejamiento de contraste). */
export type ThemeTokenRole = "surface" | "text" | "border" | "accent" | "functional";

/** Definición de un token EDITABLE de la paleta: su variable CSS y sus valores base. */
export interface ThemeTokenDef {
  /** Clave estable en el JSON de la paleta (ej. `bgBase`). */
  readonly key: string;
  /** Variable CSS que sobreescribe (ej. `--color-bg-base`). */
  readonly cssVar: string;
  /** Grupo para agrupar en el builder. */
  readonly group: ThemeTokenRole;
  /** Etiqueta legible (es-CL) para el builder. */
  readonly label: string;
  /** Valor base de marca en tema OSCURO (espejo de `[data-theme="dark"]`). */
  readonly baseDark: string;
  /** Valor base de marca en tema CLARO (espejo de `[data-theme="light"]`). */
  readonly baseLight: string;
}

/**
 * Catálogo CURADO de tokens editables (18). Acotado a propósito: NO los 100+ tokens.
 * Los `base*` son la fuente de verdad de los defaults — espejo EXACTO de
 * `packages/ui/src/tokens/index.css`. Si ese archivo cambia un valor base, actualízalo
 * aquí también (el builder los usa como punto de partida y para el cálculo de contraste
 * cuando un token no se ha sobreescrito).
 */
export const THEME_TOKEN_DEFS = [
  // --- Superficies (escala de profundidad) ---
  { key: "bgBase", cssVar: "--color-bg-base", group: "surface", label: "Fondo base", baseDark: "#06061a", baseLight: "#eef1f7" },
  { key: "surface1", cssVar: "--color-bg-surface-1", group: "surface", label: "Superficie 1 (cards)", baseDark: "#0c1124", baseLight: "#ffffff" },
  { key: "surface2", cssVar: "--color-bg-surface-2", group: "surface", label: "Superficie 2", baseDark: "#111827", baseLight: "#f4f6fb" },
  { key: "surface3", cssVar: "--color-bg-surface-3", group: "surface", label: "Superficie 3", baseDark: "#1a2235", baseLight: "#e9edf5" },
  // --- Texto ---
  { key: "textPrimary", cssVar: "--color-text-primary", group: "text", label: "Texto principal", baseDark: "#e7eaf3", baseLight: "#0c1124" },
  { key: "textSecondary", cssVar: "--color-text-secondary", group: "text", label: "Texto secundario", baseDark: "#9aa3b8", baseLight: "#475569" },
  { key: "textMuted", cssVar: "--color-text-muted", group: "text", label: "Texto atenuado", baseDark: "#6b7280", baseLight: "#8b95a7" },
  // --- Bordes (la paleta puede darles color sólido; sin tocar = bordes translúcidos de marca) ---
  { key: "borderSubtle", cssVar: "--color-border-subtle", group: "border", label: "Borde sutil", baseDark: "rgba(255,255,255,0.08)", baseLight: "rgba(15,23,42,0.08)" },
  { key: "borderDefault", cssVar: "--color-border-default", group: "border", label: "Borde normal", baseDark: "rgba(255,255,255,0.12)", baseLight: "rgba(15,23,42,0.13)" },
  { key: "borderStrong", cssVar: "--color-border-strong", group: "border", label: "Borde fuerte", baseDark: "rgba(255,255,255,0.2)", baseLight: "rgba(15,23,42,0.22)" },
  // --- Acentos de marca (de aquí se DERIVA el gradiente de marca) ---
  { key: "accentPrimary", cssVar: "--color-accent-primary", group: "accent", label: "Acento primario", baseDark: "#6366f1", baseLight: "#6366f1" },
  { key: "accentSecondary", cssVar: "--color-accent-secondary", group: "accent", label: "Acento secundario", baseDark: "#06b6d4", baseLight: "#06b6d4" },
  // --- Colores funcionales (estado) ---
  { key: "success", cssVar: "--color-success", group: "functional", label: "Éxito", baseDark: "#22c55e", baseLight: "#22c55e" },
  { key: "warning", cssVar: "--color-warning", group: "functional", label: "Advertencia", baseDark: "#f59e0b", baseLight: "#f59e0b" },
  { key: "error", cssVar: "--color-error", group: "functional", label: "Error", baseDark: "#ef4444", baseLight: "#ef4444" },
  { key: "info", cssVar: "--color-info", group: "functional", label: "Información", baseDark: "#06b6d4", baseLight: "#06b6d4" },
] as const satisfies readonly ThemeTokenDef[];

/** Clave literal de cada token editable. */
export type ThemeTokenKey = (typeof THEME_TOKEN_DEFS)[number]["key"];

/** Todas las claves editables, como arreglo plano. */
export const THEME_TOKEN_KEYS = THEME_TOKEN_DEFS.map((d) => d.key) as ThemeTokenKey[];

/** Variante de tema a la que aplica un conjunto de tokens. */
export const THEME_VARIANTS = ["dark", "light"] as const;
export const themeVariantSchema = z.enum(THEME_VARIANTS);
export type ThemeVariant = z.infer<typeof themeVariantSchema>;

/** Look-up por clave (para builder/render). */
export function themeTokenDef(key: ThemeTokenKey): ThemeTokenDef {
  const def = THEME_TOKEN_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`Token de tema desconocido: ${key}`);
  return def;
}

/** Valor base de marca de un token, por variante (default del builder y fallback de contraste). */
export function baseTokenValue(key: ThemeTokenKey, variant: ThemeVariant): string {
  const def = themeTokenDef(key);
  return variant === "dark" ? def.baseDark : def.baseLight;
}

/**
 * Formato de color aceptado para un token de paleta: hex (3/4/6/8) o `rgb()/rgba()`.
 * La validación es de FORMATO (no de gama); el chequeo de contraste es aparte y solo
 * ADVIERTE. Se rechazan gradientes, `url()`, nombres CSS y cualquier cosa con `;`/`}`
 * (defensa anti-inyección al construir el `<style>` de override).
 */
const COLOR_RE =
  /^(#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/;

export const colorValueSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(COLOR_RE, "Color inválido: usa hex (#rrggbb) o rgb()/rgba().");
export type ColorValue = z.infer<typeof colorValueSchema>;

/**
 * Override PARCIAL de tokens para UNA variante. Toda clave es opcional: lo que no se
 * sobreescribe cae al token base de marca (herencia, no duplicación). `.strict()`
 * rechaza claves fuera de la whitelist — sólo se pueden tocar tokens curados, NUNCA
 * la severidad ni tokens arbitrarios.
 */
export const paletteTokensSchema = z
  .object(
    THEME_TOKEN_KEYS.reduce(
      (shape, key) => {
        shape[key] = colorValueSchema.optional();
        return shape;
      },
      {} as Record<ThemeTokenKey, z.ZodOptional<typeof colorValueSchema>>,
    ),
  )
  .strict();
export type PaletteTokens = z.infer<typeof paletteTokensSchema>;

export const paletteNameSchema = z.string().trim().min(2).max(60);
export const paletteDescriptionSchema = z.string().trim().max(280);

/** DTO de paleta tal como la devuelve la API (admin ve todas; usuario, sólo publicadas). */
export const themePaletteSchema = z.object({
  id: z.string(),
  name: paletteNameSchema,
  description: paletteDescriptionSchema.nullable(),
  tokensDark: paletteTokensSchema,
  tokensLight: paletteTokensSchema,
  isPublished: z.boolean(),
  /** Derivado: ¿es la paleta por defecto de la instalación? (`SystemSettings.defaultPaletteId`). */
  isDefault: z.boolean(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ThemePaletteDto = z.infer<typeof themePaletteSchema>;

/** Item liviano para el SELECTOR del usuario (sólo lo necesario para listar y previsualizar). */
export const palettePublicSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  tokensDark: paletteTokensSchema,
  tokensLight: paletteTokensSchema,
  isDefault: z.boolean(),
});
export type PalettePublicDto = z.infer<typeof palettePublicSchema>;

export const createPaletteRequestSchema = z.object({
  name: paletteNameSchema,
  description: paletteDescriptionSchema.optional(),
  tokensDark: paletteTokensSchema.default({}),
  tokensLight: paletteTokensSchema.default({}),
});
export type CreatePaletteRequest = z.infer<typeof createPaletteRequestSchema>;

export const updatePaletteRequestSchema = z.object({
  name: paletteNameSchema.optional(),
  description: paletteDescriptionSchema.nullable().optional(),
  tokensDark: paletteTokensSchema.optional(),
  tokensLight: paletteTokensSchema.optional(),
});
export type UpdatePaletteRequest = z.infer<typeof updatePaletteRequestSchema>;

export const publishPaletteRequestSchema = z.object({ isPublished: z.boolean() });
export type PublishPaletteRequest = z.infer<typeof publishPaletteRequestSchema>;

/** Selección de paleta del usuario (server-side, portable). `null` = volver a la por defecto. */
export const selectPaletteRequestSchema = z.object({ paletteId: z.string().nullable() });
export type SelectPaletteRequest = z.infer<typeof selectPaletteRequestSchema>;

/** Preferencia de tema efectiva del usuario que entrega la API al arrancar el workspace. */
export const userThemePreferenceSchema = z.object({
  /** Paleta elegida por el usuario, o la por defecto, o `null` si no hay ninguna (marca base). */
  palette: palettePublicSchema.nullable(),
});
export type UserThemePreferenceDto = z.infer<typeof userThemePreferenceSchema>;

/** Valor EFECTIVO de un token: el override de la paleta, o el base de marca. */
export function effectiveToken(
  tokens: PaletteTokens,
  key: ThemeTokenKey,
  variant: ThemeVariant,
): string {
  return tokens[key] ?? baseTokenValue(key, variant);
}

/**
 * Construye el CSS de OVERRIDE de una paleta: dos bloques scopeados a `[data-wl-themed]`
 * (el workspace; el login queda intacto) — uno por variante de tema. Sólo emite las
 * variables que la paleta sobreescribe, MÁS el gradiente de marca DERIVADO de los
 * acentos efectivos (coherencia de identidad). Función PURA y testeable: el shell la
 * inyecta tal cual en un `<style>`. Los valores ya vienen validados por Zod (formato de
 * color y whitelist de claves), de modo que no hay superficie de inyección.
 */
export function buildPaletteOverrideCss(palette: {
  tokensDark: PaletteTokens;
  tokensLight: PaletteTokens;
}): string {
  const block = (tokens: PaletteTokens, variant: ThemeVariant): string => {
    const lines: string[] = [];
    for (const def of THEME_TOKEN_DEFS) {
      const override = tokens[def.key];
      if (override) lines.push(`  ${def.cssVar}: ${override};`);
    }
    // Gradiente de marca derivado de los acentos EFECTIVOS (sólo si la paleta tocó alguno).
    if (tokens.accentPrimary || tokens.accentSecondary) {
      const primary = effectiveToken(tokens, "accentPrimary", variant);
      const secondary = effectiveToken(tokens, "accentSecondary", variant);
      const softP = withAlpha(primary, 0.15);
      const softS = withAlpha(secondary, 0.1);
      lines.push(`  --gradient-brand: linear-gradient(135deg, ${primary}, ${secondary});`);
      if (softP && softS) {
        lines.push(`  --gradient-brand-subtle: linear-gradient(135deg, ${softP}, ${softS});`);
      }
      lines.push(`  --color-border-accent: ${withAlpha(primary, 0.4)};`);
      lines.push(`  --structure-accent: ${primary};`);
    }
    if (lines.length === 0) return "";
    return `[data-wl-themed][data-theme="${variant}"] {\n${lines.join("\n")}\n}`;
  };

  return [block(palette.tokensDark, "dark"), block(palette.tokensLight, "light")]
    .filter(Boolean)
    .join("\n");
}

/** Par de contraste a evaluar en el builder (texto sobre superficie). */
export interface ContrastPair {
  readonly label: string;
  readonly fgKey: ThemeTokenKey;
  readonly bgKey: ThemeTokenKey;
  /** ¿El umbral exigido es de texto (4.5:1) o de UI (3:1)? */
  readonly kind: "text" | "ui";
}

/** Pares clave que el builder evalúa para advertir contraste AA insuficiente. */
export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { label: "Texto principal sobre fondo", fgKey: "textPrimary", bgKey: "bgBase", kind: "text" },
  { label: "Texto principal sobre superficie 1", fgKey: "textPrimary", bgKey: "surface1", kind: "text" },
  { label: "Texto secundario sobre superficie 1", fgKey: "textSecondary", bgKey: "surface1", kind: "text" },
  { label: "Texto atenuado sobre superficie 1", fgKey: "textMuted", bgKey: "surface1", kind: "text" },
  { label: "Acento primario sobre superficie 1", fgKey: "accentPrimary", bgKey: "surface1", kind: "ui" },
];

/** Resultado de evaluar un par de contraste con valores EFECTIVOS de una variante. */
export interface ContrastPairResult extends ContrastPair {
  readonly variant: ThemeVariant;
  readonly verdict: ContrastVerdict;
  /** ¿Pasa el umbral exigido por `kind`? */
  readonly passes: boolean;
}

/** Evalúa todos los pares de contraste de una variante con los valores efectivos de la paleta. */
export function evaluateContrast(
  tokens: PaletteTokens,
  variant: ThemeVariant,
): ContrastPairResult[] {
  return CONTRAST_PAIRS.map((pair) => {
    const fg = effectiveToken(tokens, pair.fgKey, variant);
    const bg = effectiveToken(tokens, pair.bgKey, variant);
    const verdict = rateContrast(fg, bg);
    const passes = pair.kind === "text" ? verdict.aaText : verdict.aaUi;
    return { ...pair, variant, verdict, passes };
  });
}
