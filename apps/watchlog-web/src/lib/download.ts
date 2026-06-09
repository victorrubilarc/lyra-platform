/**
 * Utilidades de descarga y CSV en el cliente. Para listados ya cargados en la UI
 * (usuarios, roles) generamos el CSV aquí; para conjuntos paginados grandes
 * (auditoría) el CSV lo arma el backend. RFC 4180 + BOM UTF-8 para Excel.
 */

const CSV_BOM = "﻿";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Construye un CSV a partir de filas + columnas (cabecera legible + selector). */
export function toCsv<T>(
  rows: readonly T[],
  columns: ReadonlyArray<{ header: string; value: (row: T) => unknown }>,
): string {
  const header = columns.map((c) => escapeCell(c.header)).join(",");
  const lines = rows.map((r) => columns.map((c) => escapeCell(c.value(r))).join(","));
  return `${CSV_BOM}${[header, ...lines].join("\r\n")}\r\n`;
}

/** Dispara la descarga de un Blob con el nombre indicado. */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Liberar el object URL tras un tic para no cortar la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Descarga texto como archivo (ej. CSV generado en el cliente). */
export function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

/** Sello de tiempo compacto para nombres de archivo (YYYY-MM-DD-HH-mm-ss). */
export function fileStamp(d = new Date()): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 19).replace(/[:T]/g, "-");
}
