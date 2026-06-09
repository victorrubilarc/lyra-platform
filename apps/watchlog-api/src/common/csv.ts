/**
 * Utilidades CSV (RFC 4180). Genera CSV seguro para Excel/LibreOffice: comillas
 * donde corresponde, comillas dobladas, y BOM UTF-8 para que los acentos se vean
 * bien al abrir en Excel. Sin dependencias.
 */

/** Escapa un valor de celda según RFC 4180. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  // Requiere comillas si contiene separador, comillas o saltos de línea.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** BOM UTF-8 para que Excel detecte la codificación y muestre los acentos. */
export const CSV_BOM = "﻿";

/**
 * Construye un CSV a partir de filas y columnas declaradas. Cada columna tiene
 * una cabecera legible y un selector que extrae el valor de la fila.
 */
export function toCsv<T>(
  rows: readonly T[],
  columns: ReadonlyArray<{ header: string; value: (row: T) => unknown }>,
): string {
  const headerLine = columns.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(","));
  return `${CSV_BOM}${[headerLine, ...lines].join("\r\n")}\r\n`;
}
