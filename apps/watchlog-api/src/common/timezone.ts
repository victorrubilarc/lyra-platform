/**
 * Validación de zona horaria IANA contra el runtime (Node ≥ 22 trae
 * `Intl.supportedValuesOf`). Compartida por el wizard de primer arranque y la
 * edición post-setup en /configuracion ▸ Identidad — una sola fuente de verdad.
 */
let timezoneSet: Set<string> | undefined;

export function isValidTimezone(tz: string): boolean {
  timezoneSet ??= new Set(Intl.supportedValuesOf("timeZone"));
  return timezoneSet.has(tz);
}
