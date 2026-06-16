/**
 * Render de plantillas de notificación — sustitución de placeholders `{{var}}`
 * SIN `eval` ni motor de plantillas Turing-completo (misma postura segura que el
 * AST del motor de reglas). Solo se reemplazan nombres planos `[a-zA-Z0-9_.]`
 * contra un contexto `Record<string,string>`; no hay lógica, bucles ni acceso a
 * propiedades arbitrarias. Fuente única back↔front.
 */

/** Placeholder: `{{ entry.folio }}` (espacios opcionales). */
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

/** Devuelve los nombres de placeholder ÚNICOS referenciados en un texto. */
export function extractPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(PLACEHOLDER_RE)) {
    if (m[1]) found.add(m[1]);
  }
  return [...found];
}

/**
 * Reemplaza los placeholders por su valor del contexto. Un placeholder sin valor
 * en el contexto se reemplaza por cadena vacía (degradación elegante: nunca se
 * filtra `{{...}}` crudo al correo, ni se rompe el render por un dato ausente).
 */
export function renderTemplate(text: string, context: Record<string, string>): string {
  return text.replace(PLACEHOLDER_RE, (_full, key: string) => context[key] ?? "");
}

/**
 * Valida que todos los placeholders usados en los textos pertenezcan al conjunto
 * permitido del evento. Devuelve los nombres NO permitidos (vacío = válido). Se usa
 * al GUARDAR una plantilla: impide referenciar variables que el evento no expone.
 */
export function unknownPlaceholders(texts: readonly string[], allowed: ReadonlySet<string>): string[] {
  const bad = new Set<string>();
  for (const text of texts) {
    for (const name of extractPlaceholders(text)) {
      if (!allowed.has(name)) bad.add(name);
    }
  }
  return [...bad];
}
