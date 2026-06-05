/** Une nombres de clase, descartando valores vacíos/falsos. Sin dependencias. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
