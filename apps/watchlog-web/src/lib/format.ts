import { normalizeRut } from "@lyra/contracts";
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

/** Solo hora regional (p. ej. es-CL: "21:30"). Acepta ISO string o Date. */
export function formatTime(value: string | Date, opts?: Intl.DateTimeFormatOptions): string {
  const d = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale(), { timeStyle: "short", ...opts }).format(d);
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

/**
 * Tiempo relativo regional ("hace 5 min", "hace 2 h", "ayer"…). Para timestamps
 * recientes (campanita/feeds); cae a fecha+hora absoluta si supera ~30 días.
 */
export function formatRelativeTime(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  const diffMs = d.getTime() - Date.now();
  const absSec = Math.abs(diffMs) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [3600, "minute"],
    [86400, "hour"],
    [2592000, "day"],
  ];
  if (absSec < 30) return rtf.format(0, "second");
  for (let i = 0; i < steps.length; i++) {
    const [limit, unit] = steps[i]!;
    if (absSec < limit) {
      const divisor = i === 0 ? 1 : steps[i - 1]![0];
      return rtf.format(Math.round(diffMs / 1000 / divisor), unit);
    }
  }
  return formatDateTime(d);
}

/** Número regional (separadores de miles/decimales según la región). */
export function formatNumber(value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), opts).format(value);
}

/** Moneda regional (CLP por defecto: sin decimales, símbolo y separadores locales). */
export function formatCurrency(value: number, currency = "CLP", opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), { style: "currency", currency, ...opts }).format(value);
}

/** Tamaño de archivo legible (B/KB/MB/GB) con número regional (adjuntos, Ola 3). */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let u = 0;
  while (n >= 1024 && u < units.length - 1) {
    n /= 1024;
    u += 1;
  }
  const digits = u === 0 ? 0 : n < 10 ? 1 : 0;
  return `${formatNumber(n, { maximumFractionDigits: digits })} ${units[u]}`;
}

/**
 * Duración COMPACTA en la UNIDAD dominante (días / horas / minutos), formateada con la
 * configuración regional activa (`Intl.NumberFormat` style:unit). Para señales como el
 * SLA/atraso: "3 d", "2 h", "5 min". <1 min ⇒ "0 min". Fuente única de duraciones.
 */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const fmt = (value: number, unit: "day" | "hour" | "minute") =>
    new Intl.NumberFormat(locale(), { style: "unit", unit, unitDisplay: "narrow" }).format(value);
  if (totalMin >= 1440) return fmt(Math.floor(totalMin / 1440), "day");
  if (totalMin >= 60) return fmt(Math.floor(totalMin / 60), "hour");
  return fmt(totalMin, "minute");
}

// === Objetos del Form Builder (Ola 1) ========================================

/**
 * Duración en MINUTOS → "HH:MM" (objeto DURATION; los minutos son la unidad
 * canónica de almacenamiento). 90 ⇒ "01:30". Negativos se acotan a 0.
 */
export function formatDurationHm(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Convierte "HH:MM" a minutos (objeto DURATION). null si no parsea. */
export function durationHmToMinutes(hhmm: string): number | null {
  const m = /^(\d{1,3}):([0-5]\d)$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/**
 * RUT formateado para display (puntos de miles + guion del DV), p. ej.
 * "12.345.678-5". Devuelve la entrada tal cual si no parsea (feedback honesto).
 */
export function formatRut(value: string): string {
  const norm = normalizeRut(value);
  if (!norm) return value;
  const [body, dv] = norm.split("-");
  const grouped = body!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped}-${dv}`;
}

/** Porcentaje regional (el valor ya está en escala 0..100). 42 ⇒ "42%". */
export function formatPercent(value: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(locale(), { style: "unit", unit: "percent", unitDisplay: "narrow", ...opts }).format(value);
}

/**
 * RUT formateado MIENTRAS se teclea (puntos de miles + guion del DV) de forma
 * incremental: "123456785" ⇒ "12.345.678-5", "12" ⇒ "1-2". Solo conserva dígitos
 * y K; el último caracter es el dígito verificador. Pensado para `onChange` (el
 * caret queda al final, que es como se teclea un RUT). Validez = `isValidRut`.
 */
export function formatRutLive(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const grouped = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${grouped}-${dv}`;
}

/**
 * Aplica una MÁSCARA de entrada a un texto. Tokens: `#` = dígito, `A` = letra,
 * `*` = alfanumérico; cualquier otro caracter del patrón es un LITERAL que se
 * inserta automáticamente (p. ej. el guion de "OT-#####"). Se detiene cuando se
 * acaban los caracteres tecleados; los que no calzan con el token se ignoran.
 * Ej.: applyMask("OT-#####", "04934") ⇒ "OT-04934".
 */
export function applyMask(mask: string, raw: string): string {
  let out = "";
  let mi = 0;
  for (const c of raw) {
    // Inserta los literales del patrón hasta el próximo token de entrada.
    while (mi < mask.length && !"#A*".includes(mask[mi]!)) {
      out += mask[mi]!;
      mi++;
    }
    if (mi >= mask.length) break;
    const tok = mask[mi]!;
    const ok = tok === "#" ? /\d/.test(c) : tok === "A" ? /[a-zA-Z]/.test(c) : /[a-zA-Z0-9]/.test(c);
    if (ok) {
      out += c;
      mi++;
    }
    // si el caracter no calza el token (p. ej. tecleó un literal ya insertado), se ignora
  }
  return out;
}
