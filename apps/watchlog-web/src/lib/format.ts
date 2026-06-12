import i18n, { DEFAULT_LANGUAGE } from "../i18n/i18n.js";

/**
 * Formato de fechas, números y monedas SIEMPRE según la configuración regional activa
 * (regla del proyecto). Lee el idioma actual del i18n (`es-CL` por defecto) en vez de
 * hardcodear el locale o el formato. Fuente ÚNICA: toda la UI debe usar estos helpers.
 *
 * Moneda por defecto: CLP (peso chileno, sin decimales). Pásala explícita para otras.
 */
function locale(): string {
  return i18n.language || DEFAULT_LANGUAGE;
}

/** Fecha + hora regional (p. ej. es-CL: "12-06-2026, 21:30"). Acepta ISO string o Date. */
export function formatDateTime(value: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", timeStyle: "short", ...opts }).format(d);
}

/** Solo fecha, regional (p. ej. es-CL: "12-06-2026"). Acepta ISO string o Date. */
export function formatDate(value: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", ...opts }).format(d);
}

/**
 * Fecha-solo "YYYY-MM-DD" (sin hora ni TZ, p. ej. un día operacional) formateada
 * regionalmente SIN desfase de zona horaria (se interpreta como fecha civil local).
 */
export function formatLocalDate(isoDate: string, opts?: Intl.DateTimeFormatOptions): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  return new Intl.DateTimeFormat(locale(), { dateStyle: "medium", ...opts }).format(new Date(y, m - 1, d));
}

/** Número regional (separadores de miles/decimales según la región). */
export function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), opts).format(value);
}

/** Moneda regional (CLP por defecto: sin decimales, símbolo y separadores locales). */
export function formatCurrency(value: number, currency = "CLP", opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), { style: "currency", currency, ...opts }).format(value);
}
