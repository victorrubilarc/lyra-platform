/**
 * Lista curada de zonas horarias IANA frecuentes (industria latinoamericana +
 * UTC). El backend valida cualquier TZ IANA; esto es solo conveniencia de la UI.
 */
export const COMMON_TIMEZONES = [
  "America/Santiago",
  "America/Lima",
  "America/Bogota",
  "America/La_Paz",
  "America/Argentina/Buenos_Aires",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "America/Caracas",
  "America/Guayaquil",
  "America/Asuncion",
  "America/Montevideo",
  "UTC",
] as const;
