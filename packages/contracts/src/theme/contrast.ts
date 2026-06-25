/**
 * Color + contraste WCAG — utilidades PURAS (sin dependencias del DOM), por eso
 * viven en `@lyra/contracts` y se reusan en cliente y servidor. Las usa el builder
 * de paletas (EST-TEMAS) para advertir contraste insuficiente, y el helper que
 * deriva el gradiente de marca de los acentos de la paleta.
 *
 * Referencia: WCAG 2.1 — luminancia relativa (1.4.3) y razón de contraste (1.4.11).
 * Umbrales: texto normal 4.5:1, texto grande 3:1, componentes/UI 3:1.
 */

/** Color RGBA normalizado (canales 0–255, alfa 0–1). */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX4 = /^#([0-9a-f])([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const RGB_FN = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * Parsea un color CSS sólido o translúcido (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`,
 * `rgb()/rgba()`) a {@link Rgba}. Devuelve `null` si el formato no se reconoce (p. ej.
 * `linear-gradient(...)` o nombres CSS): el llamador decide si lo ignora o lo marca.
 */
export function parseColor(input: string): Rgba | null {
  const s = input.trim();
  let m: RegExpExecArray | null;

  if ((m = HEX6.exec(s))) {
    return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16), a: 1 };
  }
  if ((m = HEX8.exec(s))) {
    return {
      r: parseInt(m[1]!, 16),
      g: parseInt(m[2]!, 16),
      b: parseInt(m[3]!, 16),
      a: parseInt(m[4]!, 16) / 255,
    };
  }
  if ((m = HEX3.exec(s))) {
    return {
      r: parseInt(m[1]! + m[1]!, 16),
      g: parseInt(m[2]! + m[2]!, 16),
      b: parseInt(m[3]! + m[3]!, 16),
      a: 1,
    };
  }
  if ((m = HEX4.exec(s))) {
    return {
      r: parseInt(m[1]! + m[1]!, 16),
      g: parseInt(m[2]! + m[2]!, 16),
      b: parseInt(m[3]! + m[3]!, 16),
      a: parseInt(m[4]! + m[4]!, 16) / 255,
    };
  }
  if ((m = RGB_FN.exec(s))) {
    return {
      r: clamp(Math.round(parseFloat(m[1]!)), 0, 255),
      g: clamp(Math.round(parseFloat(m[2]!)), 0, 255),
      b: clamp(Math.round(parseFloat(m[3]!)), 0, 255),
      a: m[4] === undefined ? 1 : clamp(parseFloat(m[4]), 0, 1),
    };
  }
  return null;
}

/** Aplana un color (posiblemente translúcido) sobre un fondo OPACO (alpha compositing). */
export function flattenOver(fg: Rgba, bg: Rgba): Rgba {
  if (fg.a >= 1) return { ...fg, a: 1 };
  const a = fg.a;
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  };
}

const channelLuminance = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** Luminancia relativa WCAG (0 = negro, 1 = blanco). Ignora el alfa: aplánalo antes. */
export function relativeLuminance(color: Rgba): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

/** Veredicto de contraste de un par primer-plano / fondo. */
export interface ContrastVerdict {
  /** Razón de contraste 1–21 (redondeada a 2 decimales). `null` si algún color no parsea. */
  ratio: number | null;
  /** ¿Cumple AA para texto normal (≥ 4.5:1)? */
  aaText: boolean;
  /** ¿Cumple AA para texto grande / ≥ 18.66px bold o 24px (≥ 3:1)? */
  aaLargeText: boolean;
  /** ¿Cumple AA para componentes de UI / bordes con significado (≥ 3:1)? */
  aaUi: boolean;
}

/**
 * Razón de contraste WCAG entre un color de primer plano y uno de fondo. Si el primer
 * plano es translúcido, se aplana sobre el fondo. Devuelve `null` si algún color no
 * se puede parsear (el builder lo trata como "no evaluable", no como fallo).
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const bg = parseColor(background);
  const fgRaw = parseColor(foreground);
  if (!bg || !fgRaw) return null;
  const fg = flattenOver(fgRaw, { ...bg, a: 1 });
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance({ ...bg, a: 1 });
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  const ratio = (lighter + 0.05) / (darker + 0.05);
  return Math.round(ratio * 100) / 100;
}

/** Evalúa un par color/fondo contra los umbrales AA de WCAG 2.1. */
export function rateContrast(foreground: string, background: string): ContrastVerdict {
  const ratio = contrastRatio(foreground, background);
  if (ratio === null) {
    return { ratio: null, aaText: false, aaLargeText: false, aaUi: false };
  }
  return {
    ratio,
    aaText: ratio >= 4.5,
    aaLargeText: ratio >= 3,
    aaUi: ratio >= 3,
  };
}

/** Convierte un color a `rgba(r, g, b, alpha)` con el alfa dado (para derivar variantes suaves). */
export function withAlpha(color: string, alpha: number): string | null {
  const c = parseColor(color);
  if (!c) return null;
  const a = clamp(alpha, 0, 1);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`;
}
