import { z } from "zod";

/**
 * Utilidades de fecha PURAS y deterministas (sin dependencias salvo `Intl` donde
 * aplica) compartidas por el eje TURNO (`operational-calendar`) y el eje PERÍODO
 * (`fiscal-calendar`). Centralizar la aritmética de calendario evita duplicar la
 * lógica entre ambos ejes ahora que están desacoplados (ver DECISIONS 2026-06-11).
 *
 * Toda fecha-solo se representa como "YYYY-MM-DD" en UTC para que la aritmética sea
 * estable y no dependa de la TZ del proceso.
 */

/** Fecha-solo "YYYY-MM-DD" (sin hora ni TZ: una fecha de calendario local). */
export const localDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use el formato "YYYY-MM-DD"')
  .refine((s) => {
    const [y, m, d] = s.split("-").map(Number);
    if (m! < 1 || m! > 12 || d! < 1 || d! > 31) return false;
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d;
  }, "Fecha inválida");

/** Suma `days` (puede ser negativo) a una fecha local Y-M-D; devuelve "YYYY-MM-DD". */
export function addDays(year: number, month: number, day: number, days: number): string {
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return dt.toISOString().slice(0, 10);
}

/** Suma `days` a una fecha "YYYY-MM-DD"; devuelve "YYYY-MM-DD". */
export function addDaysToIso(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return addDays(y!, m!, d!, days);
}

/** Día de la semana ISO (1=Lun..7=Dom) de una fecha "YYYY-MM-DD". */
export function isoWeekdayOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0=Dom..6=Sáb
  return dow === 0 ? 7 : dow;
}

/** Días enteros entre dos fechas "YYYY-MM-DD" (b - a), con signo. */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ms = Date.UTC(by!, bm! - 1, bd!) - Date.UTC(ay!, am! - 1, ad!);
  return Math.round(ms / 86_400_000);
}

/** ¿La TZ es una zona IANA válida y soportada por el runtime? */
export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Partes de hora de pared local de un instante en una TZ (vía Intl, sin deps). */
function localPartsInTz(at: Date, tz: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  let hour = get("hour");
  if (hour === 24) hour = 0; // algunos ICU emiten "24" para la medianoche
  return { year: get("year"), month: get("month"), day: get("day"), hour, minute: get("minute"), second: get("second") };
}

/** Fecha local "YYYY-MM-DD" de un instante UTC en una TZ dada. */
export function localDateInTz(at: Date, tz: string): string {
  const p = localPartsInTz(at, tz);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Offset (ms) de la TZ en un instante: (hora de pared interpretada como UTC) − instante. */
function tzOffsetMs(at: Date, tz: string): number {
  const p = localPartsInTz(at, tz);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - at.getTime();
}

/**
 * Convierte una hora de PARED local ("YYYY-MM-DD" + "HH:MM") en una TZ al instante
 * UTC correspondiente. Inverso de `localDateInTz`/`resolveShift`. Resuelve DST con el
 * algoritmo estándar de doble-offset (corrige el salto de hora de los cambios de hora).
 * Sin dependencias salvo `Intl`. En el "agujero" del cambio de hora de primavera el
 * resultado puede caer en la hora siguiente (comportamiento aceptable y determinista).
 */
export function zonedTimeToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const asUtc = Date.UTC(y!, m! - 1, d!, h!, min!);
  const off1 = tzOffsetMs(new Date(asUtc), tz);
  const guess = new Date(asUtc - off1);
  const off2 = tzOffsetMs(guess, tz);
  return off2 === off1 ? guess : new Date(asUtc - off2);
}
