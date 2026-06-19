import pdfMake from "pdfmake";
import type { TDocumentDefinitions, TFontDictionary } from "pdfmake/interfaces";

/**
 * Runtime de PDF del acta de entrega de turno (Fase 5 — Slice 4).
 *
 * Motor: **pdfmake** (DECISIONS 2026-06-19, fork a). Elegido sobre Puppeteer/headless
 * Chrome para NO arrastrar Chromium (~300 MB + superficie de ataque) a la imagen
 * on-prem: pdfmake es JS puro, determinista y liviano, ideal para un documento
 * estructurado/tabular como el acta. La generación ocurre SIEMPRE en el backend
 * (AC-PDF-3, sin fuga al navegador).
 *
 * Identidad Lyra: se embeben **Sora** (títulos) e **Inter** (cuerpo) como TTF
 * estáticos (OFL, vía `@expo-google-fonts/*`). Las fuentes se referencian por su
 * ruta absoluta resuelta una vez al arrancar; `localAccessPolicy` solo permite leer
 * ESAS rutas (lista blanca), de modo que el documento no puede leer archivos
 * arbitrarios del disco ni descargar recursos externos.
 */

/** TTF por variante (módulo → ruta absoluta resuelta en runtime). Pesos reales de cada familia. */
const FONT_MODULES = {
  interRegular: "@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf",
  interMedium: "@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf",
  interSemiBold: "@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf",
  soraSemiBold: "@expo-google-fonts/sora/600SemiBold/Sora_600SemiBold.ttf",
  soraBold: "@expo-google-fonts/sora/700Bold/Sora_700Bold.ttf",
} as const;

let configured = false;

/** Configura pdfmake una sola vez: fuentes (rutas) + políticas de acceso (on-prem). */
function ensureConfigured(): void {
  if (configured) return;

  const path = (moduleId: string): string => require.resolve(moduleId);
  const p = {
    interRegular: path(FONT_MODULES.interRegular),
    interMedium: path(FONT_MODULES.interMedium),
    interSemiBold: path(FONT_MODULES.interSemiBold),
    soraSemiBold: path(FONT_MODULES.soraSemiBold),
    soraBold: path(FONT_MODULES.soraBold),
  };
  const allowedFontPaths = new Set(Object.values(p));

  const fonts: TFontDictionary = {
    Inter: { normal: p.interRegular, bold: p.interSemiBold, italics: p.interRegular, bolditalics: p.interSemiBold },
    InterMedium: { normal: p.interMedium, bold: p.interSemiBold, italics: p.interMedium, bolditalics: p.interSemiBold },
    Sora: { normal: p.soraSemiBold, bold: p.soraBold, italics: p.soraSemiBold, bolditalics: p.soraBold },
  };
  pdfMake.setFonts(fonts);

  // On-prem / sin fuga (AC-PDF-3): nada de recursos externos; del disco SOLO se leen
  // los TTF de marca embebidos (lista blanca). El SVG de la banda va inline en el doc.
  pdfMake.setUrlAccessPolicy(() => false);
  pdfMake.setLocalAccessPolicy((filePath: string) => allowedFontPaths.has(filePath));

  configured = true;
}

/** Renderiza la definición de documento a un Buffer PDF (server-side, sin Chromium). */
export async function renderActaPdf(doc: TDocumentDefinitions): Promise<Buffer> {
  ensureConfigured();
  const created = pdfMake.createPdf(doc);
  return created.getBuffer();
}
