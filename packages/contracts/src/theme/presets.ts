import type { PaletteTokens } from "./palette.js";

/**
 * PLANTILLAS DE INICIO ("starter themes") del sistema de TEMAS (EST-TEMAS, Fase 2A).
 *
 * Un catálogo CURADO de paletas de arranque (como Material/Radix/shadcn) que el admin
 * adopta como PUNTO DE PARTIDA: al elegir una, sus tokens se clonan en una ThemePalette
 * NUEVA y editable (borrador), que luego se ajusta y publica con el flujo ya existente.
 *
 * Reglas de diseño (CLAUDE.md + [[theme-system]]):
 *  - Son CONSTANTES versionadas con el código, NO filas de BD, NO editables, NO publicables.
 *    El usuario final nunca las ve: son solo el arranque del admin. El backend no las conoce
 *    (la creación ya valida tokens/whitelist; clonar es un POST normal desde el cliente).
 *  - Cada plantilla sobreescribe SOLO la whitelist de 18 tokens, y de ella, únicamente
 *    SUPERFICIES + TEXTO + 2 ACENTOS. Los bordes (translúcidos, se adaptan) y los colores
 *    FUNCIONALES/SEVERIDAD se dejan a la marca base: su semántica es constante entre temas.
 *  - TODA plantilla PASA contraste WCAG AA en claro Y oscuro (garantizado por `presets.spec.ts`):
 *    una plantilla nunca puede nacer inaccesible.
 *
 * Nombres: industria chilena + constelación Lyra (cada producto/tema es una "estrella").
 */
export interface ThemePreset {
  /** Slug estable (no se traduce; identifica la plantilla en el picker). */
  readonly id: string;
  /** Nombre de marca de la plantilla (nombre propio; se prefilla al clonar). */
  readonly name: string;
  /** Descripción corta (es-CL) para el picker. */
  readonly description: string;
  /** Override de tokens para la variante OSCURA. */
  readonly tokensDark: PaletteTokens;
  /** Override de tokens para la variante CLARA. */
  readonly tokensLight: PaletteTokens;
}

/**
 * Recetas de TEXTO compartidas por todas las plantillas. Mantenerlas constantes asegura
 * que los pares de contraste de texto pasen AA en cada plantilla (lo único que varía por
 * plantilla son las superficies tintadas y los acentos). Si cambian, el test lo verifica.
 */
const DARK_TEXT = {
  textPrimary: "#eceff7",
  textSecondary: "#b4bcce",
  textMuted: "#97a1b5",
} as const;

const LIGHT_TEXT = {
  textPrimary: "#101726",
  textSecondary: "#44516a",
  textMuted: "#5a6478",
} as const;

/** Bits que varían por plantilla y variante: superficies + 2 acentos. */
interface VariantColors {
  bgBase: string;
  surface1: string;
  surface2: string;
  surface3: string;
  accentPrimary: string;
  accentSecondary: string;
}

function makePreset(p: {
  id: string;
  name: string;
  description: string;
  dark: VariantColors;
  light: VariantColors;
}): ThemePreset {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    tokensDark: { ...DARK_TEXT, ...p.dark },
    tokensLight: { ...LIGHT_TEXT, ...p.light },
  };
}

/**
 * Catálogo de 10 plantillas curadas. En OSCURO el acento primario es vivo (alto contraste
 * sobre superficies oscuras); en CLARO se usa un tono más profundo del mismo acento para
 * pasar el umbral de UI (3:1) sobre superficies casi blancas.
 */
export const THEME_PRESETS: readonly ThemePreset[] = [
  makePreset({
    id: "grafito",
    name: "Grafito",
    description: "Grafito neutro y frío. La base más sobria, sin distraer de los datos.",
    dark: {
      bgBase: "#0b0e14",
      surface1: "#11151d",
      surface2: "#171c26",
      surface3: "#1f2530",
      accentPrimary: "#8d9ac0",
      accentSecondary: "#aab4cc",
    },
    light: {
      bgBase: "#eef0f4",
      surface1: "#ffffff",
      surface2: "#f4f6f9",
      surface3: "#e8ebf1",
      accentPrimary: "#4b5878",
      accentSecondary: "#5d6b8a",
    },
  }),
  makePreset({
    id: "cobre",
    name: "Cobre",
    description: "Cobre cálido sobre carbón. Un guiño al metal insignia de la minería chilena.",
    dark: {
      bgBase: "#100b09",
      surface1: "#17110c",
      surface2: "#1e1711",
      surface3: "#271d15",
      accentPrimary: "#e8915a",
      accentSecondary: "#f2b98a",
    },
    light: {
      bgBase: "#f6f0ea",
      surface1: "#ffffff",
      surface2: "#faf3ec",
      surface3: "#f0e6db",
      accentPrimary: "#b45309",
      accentSecondary: "#c2410c",
    },
  }),
  makePreset({
    id: "acero",
    name: "Acero",
    description: "Azul acero industrial. Frío, técnico y de alto contraste.",
    dark: {
      bgBase: "#080b10",
      surface1: "#0e131b",
      surface2: "#141b26",
      surface3: "#1c2533",
      accentPrimary: "#4f9bd9",
      accentSecondary: "#7fb8e6",
    },
    light: {
      bgBase: "#eef1f6",
      surface1: "#ffffff",
      surface2: "#f3f6fb",
      surface3: "#e7edf4",
      accentPrimary: "#1f6fb2",
      accentSecondary: "#2c7fc2",
    },
  }),
  makePreset({
    id: "medianoche",
    name: "Medianoche",
    description: "Azul medianoche profundo. La identidad Lyra en su tono más nocturno.",
    dark: {
      bgBase: "#06081a",
      surface1: "#0c1024",
      surface2: "#11162e",
      surface3: "#1a1f3d",
      accentPrimary: "#5b6cf0",
      accentSecondary: "#8b9bff",
    },
    light: {
      bgBase: "#edeef7",
      surface1: "#ffffff",
      surface2: "#f3f4fb",
      surface3: "#e6e8f5",
      accentPrimary: "#4f46e5",
      accentSecondary: "#6366f1",
    },
  }),
  makePreset({
    id: "bosque",
    name: "Bosque",
    description: "Verde bosque sereno. Inspirado en el sur de Chile, fácil para jornadas largas.",
    dark: {
      bgBase: "#060f0a",
      surface1: "#0b1610",
      surface2: "#111e16",
      surface3: "#18291e",
      accentPrimary: "#34c77f",
      accentSecondary: "#6fe0a6",
    },
    light: {
      bgBase: "#ecf3ee",
      surface1: "#ffffff",
      surface2: "#f1f8f3",
      surface3: "#e3efe8",
      accentPrimary: "#15803d",
      accentSecondary: "#16a34a",
    },
  }),
  makePreset({
    id: "solar",
    name: "Solar",
    description: "Ámbar y oro del desierto. Cálido y luminoso, evoca el sol de Atacama.",
    dark: {
      bgBase: "#100c05",
      surface1: "#17120a",
      surface2: "#1f1810",
      surface3: "#2a2016",
      accentPrimary: "#f5b73c",
      accentSecondary: "#fcd34d",
    },
    light: {
      bgBase: "#f6f1e7",
      surface1: "#ffffff",
      surface2: "#faf4e9",
      surface3: "#f1e8d6",
      accentPrimary: "#b45309",
      accentSecondary: "#d97706",
    },
  }),
  makePreset({
    id: "indigo",
    name: "Índigo",
    description: "Índigo y cian de marca, refinados. El look Lyra por excelencia.",
    dark: {
      bgBase: "#0a0a1c",
      surface1: "#101028",
      surface2: "#161634",
      surface3: "#20204a",
      accentPrimary: "#6366f1",
      accentSecondary: "#06b6d4",
    },
    light: {
      bgBase: "#eeeef8",
      surface1: "#ffffff",
      surface2: "#f4f4fc",
      surface3: "#e7e7f6",
      accentPrimary: "#4f46e5",
      accentSecondary: "#0e7490",
    },
  }),
  makePreset({
    id: "cobalto",
    name: "Cobalto",
    description: "Cobalto y cian eléctrico. Azul vibrante para tableros de control.",
    dark: {
      bgBase: "#060b14",
      surface1: "#0b1220",
      surface2: "#101a2e",
      surface3: "#17263f",
      accentPrimary: "#2e6be6",
      accentSecondary: "#22d3ee",
    },
    light: {
      bgBase: "#eceff7",
      surface1: "#ffffff",
      surface2: "#f2f5fc",
      surface3: "#e5ebf6",
      accentPrimary: "#1d4ed8",
      accentSecondary: "#0891b2",
    },
  }),
  makePreset({
    id: "magma",
    name: "Magma",
    description: "Rojo-naranja volcánico sobre roca. Energía andina para resaltar lo crítico.",
    dark: {
      bgBase: "#120708",
      surface1: "#1a0c0d",
      surface2: "#221113",
      surface3: "#2e181a",
      accentPrimary: "#f4623e",
      accentSecondary: "#fb923c",
    },
    light: {
      bgBase: "#f6ece9",
      surface1: "#ffffff",
      surface2: "#fbf0ed",
      surface3: "#f1ddd8",
      accentPrimary: "#c2410c",
      accentSecondary: "#dc2626",
    },
  }),
  makePreset({
    id: "salitre",
    name: "Salitre",
    description: "Teal mineral y arena. Sobrio y fresco, con aire de pampa salitrera.",
    dark: {
      bgBase: "#0a0e0e",
      surface1: "#101616",
      surface2: "#161e1e",
      surface3: "#1f2a2a",
      accentPrimary: "#2db5b0",
      accentSecondary: "#5ad1c4",
    },
    light: {
      bgBase: "#eef3f2",
      surface1: "#ffffff",
      surface2: "#f2f8f7",
      surface3: "#e4efed",
      accentPrimary: "#0f766e",
      accentSecondary: "#0d9488",
    },
  }),
];

/** Look-up por slug. */
export function themePreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id);
}
