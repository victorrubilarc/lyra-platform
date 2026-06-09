/**
 * Datos de referencia para el seed de Listas (SOLO desarrollo).
 *
 * Fuente única consumida por `seed.ts`. Dos listas reales de minería/industria
 * para probar el binding `optionSource.referenceList` end-to-end:
 *  - `failure-modes`: modos de falla alineados a ISO 14224 (con metadata
 *    `isoCategory` para reportes; el valor que se guarda es el `code`, no el label).
 *  - `shifts`: turnos operacionales (caso simple, sin metadata enriquecida).
 *
 * Editable desde la UI (Datos de referencia). Idempotente vía `key`/`code` estables.
 */

export interface SeedReferenceItem {
  code: string;
  label: string;
  sortOrder: number;
  metadata?: Record<string, unknown>;
}

export interface SeedReferenceList {
  key: string;
  name: string;
  description: string;
  sortOrder: number;
  items: SeedReferenceItem[];
}

export const REFERENCE_LISTS: SeedReferenceList[] = [
  {
    key: "failure-modes",
    name: "Modos de falla (ISO 14224)",
    description:
      "Modos de falla típicos de equipos rotativos/estáticos según ISO 14224. La metadata isoCategory permite agrupar en reportes de confiabilidad.",
    sortOrder: 10,
    items: [
      { code: "VIB", label: "Vibración excesiva", sortOrder: 10, metadata: { isoCategory: "ELP", severityDefault: 3 } },
      { code: "LEAK", label: "Fuga externa", sortOrder: 20, metadata: { isoCategory: "ELU", severityDefault: 3 } },
      { code: "OVHT", label: "Sobrecalentamiento", sortOrder: 30, metadata: { isoCategory: "OHE", severityDefault: 4 } },
      { code: "NOISE", label: "Ruido anormal", sortOrder: 40, metadata: { isoCategory: "NOI", severityDefault: 2 } },
      { code: "MISALIGN", label: "Desalineación", sortOrder: 50, metadata: { isoCategory: "STP", severityDefault: 3 } },
      { code: "CORR", label: "Corrosión / desgaste", sortOrder: 60, metadata: { isoCategory: "PDE", severityDefault: 2 } },
      { code: "FTS", label: "Falla al arrancar (FTS)", sortOrder: 70, metadata: { isoCategory: "FTS", severityDefault: 5 } },
      { code: "STP", label: "Paro espurio", sortOrder: 80, metadata: { isoCategory: "UST", severityDefault: 4 } },
    ],
  },
  {
    key: "shifts",
    name: "Turnos",
    description: "Turnos operacionales para registrar la ronda/lectura. Caso simple sin metadata.",
    sortOrder: 20,
    items: [
      { code: "A", label: "Turno A (día)", sortOrder: 10 },
      { code: "B", label: "Turno B (noche)", sortOrder: 20 },
      { code: "C", label: "Turno C (relevo)", sortOrder: 30 },
    ],
  },
];
