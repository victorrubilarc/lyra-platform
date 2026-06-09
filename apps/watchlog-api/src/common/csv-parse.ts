/**
 * Parser CSV (RFC 4180) sin dependencias, contraparte de `csv.ts`. Maneja
 * celdas entrecomilladas (comillas dobladas, delimitadores y saltos de línea
 * DENTRO de la celda), CRLF/LF, BOM UTF-8 inicial, y AUTO-DETECTA el
 * delimitador (";" de Excel es-CL vs "," RFC) contando ocurrencias fuera de
 * comillas en la línea de cabecera.
 */

export interface ParsedCsv {
  delimiter: "," | ";";
  /** Filas como arreglos de celdas. La fila 0 es la cabecera. */
  rows: string[][];
}

/** Detecta el delimitador contando `;` vs `,` fuera de comillas en la 1.ª línea. */
function detectDelimiter(firstLine: string): "," | ";" {
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ",") commas += 1;
    else if (!inQuotes && ch === ";") semis += 1;
  }
  return semis > commas ? ";" : ",";
}

/** Parsea el contenido CSV completo. Lanza Error con mensaje legible si está malformado. */
export function parseCsv(content: string): ParsedCsv {
  // Tolerar BOM UTF-8 al inicio (lo emite nuestro propio export y Excel).
  let s = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  // Normalizar el final: un único salto final no genera fila vacía.
  s = s.replace(/\r?\n$/, "");
  if (s.trim() === "") return { delimiter: ",", rows: [] };

  const firstLineEnd = s.search(/\r?\n/);
  const delimiter = detectDelimiter(firstLineEnd === -1 ? s : s.slice(0, firstLineEnd));

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < s.length) {
    const ch = s[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }
    if (ch === '"') {
      // Comilla de apertura válida solo al inicio de celda; en medio se toma literal.
      if (cell === "") inQuotes = true;
      else cell += ch;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r" && s[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 2;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  if (inQuotes) {
    throw new Error("CSV malformado: comillas sin cerrar");
  }
  row.push(cell);
  rows.push(row);
  return { delimiter, rows };
}
