import type { SummaryGrounding } from "./types.js";

/**
 * Scrubber de PII (AC-IA-7). Redacta identificadores personales de los textos LIBRES del
 * grounding ANTES de enviarlos a un proveedor de IA EXTERNO (nube). El grounding solo lleva
 * texto operacional (títulos de incidencias, detalles de excepción, pendientes), pero un
 * operador podría tipear un correo, RUT o teléfono — esto evita que salga de la planta.
 *
 * Conservador a propósito: NO toca cifras operacionales (temperaturas, umbrales, severidades,
 * folios tipo INC-0007), solo patrones inequívocos de PII chilena. La redacción NO afecta al
 * resumen determinista (crudo) ni a lo que se persiste/firma: solo a lo que ve el modelo.
 */

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
// RUT chileno: 12.345.678-9 / 12345678-9 / 1.234.567-K (dígito verificador 0-9 o K).
const RUT_RE = /\b\d{1,2}(?:\.\d{3}){2}-[\dkK]\b|\b\d{7,8}-[\dkK]\b/g;
// Móvil chileno: +56 9 XXXX XXXX / 09 XXXX XXXX / 9 XXXX XXXX (con o sin separadores).
const PHONE_RE = /(?:\+?56[\s-]?)?(?:0?9)[\s-]?\d{4}[\s-]?\d{4}\b/g;

/** Redacta PII de UN string. Orden: RUT y teléfono antes de cifras sueltas; correo aparte. */
export function scrubText(text: string): string {
  return text
    .replace(EMAIL_RE, "[correo]")
    .replace(RUT_RE, "[rut]")
    .replace(PHONE_RE, "[teléfono]");
}

function scrubMaybe(text: string | null): string | null {
  return text == null ? text : scrubText(text);
}

/**
 * Devuelve una copia del grounding con los textos libres redactados. Inmutable (no muta el
 * original). Solo redacta campos donde un humano escribe texto libre; deja intactas las cifras
 * estructuradas (counts, severidades, flags) que son la fuente rastreable del resumen.
 */
export function scrubGrounding(g: SummaryGrounding): SummaryGrounding {
  return {
    ...g,
    incidents: g.incidents.map((i) => ({ ...i, title: scrubText(i.title) })),
    exceptions: g.exceptions.map((e) => ({
      ...e,
      detail: scrubText(e.detail),
      fieldLabel: scrubMaybe(e.fieldLabel),
    })),
    followups: g.followups.map((f) => ({ ...f, title: scrubText(f.title) })),
    openItems: g.openItems.map(scrubText),
  };
}
