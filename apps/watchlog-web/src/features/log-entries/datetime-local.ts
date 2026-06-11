/**
 * Convierte el valor de un `<input type="datetime-local">` ("YYYY-MM-DDTHH:mm")
 * a ISO 8601 CON el offset local del navegador. Se conserva el offset (y no se
 * normaliza a UTC) para que el backend pueda preservar la fecha CIVIL del
 * operador al escribir un campo EFFECTIVE_DATE de tipo DATE.
 */
export function localInputToIso(value: string): string {
  const d = new Date(value);
  const tz = -d.getTimezoneOffset(); // minutos al este de UTC
  const sign = tz >= 0 ? "+" : "-";
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  return `${value}:00${sign}${pad(Math.trunc(tz / 60))}:${pad(Math.abs(tz) % 60)}`;
}

/** ISO 8601 → valor local para `<input type="datetime-local">`. */
export function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
