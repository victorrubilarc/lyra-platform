import type { CSSProperties, ReactNode } from "react";
import { GRID_COLUMNS, type FieldType } from "@lyra/contracts";
import styles from "./FieldGrid.module.css";

/**
 * Grilla de campos por sección — FUENTE ÚNICA del layout, compartida por el
 * llenado, el visor y la vista previa del builder (el editor escribe la misma
 * geometría con su lienzo `react-grid-layout`, ver Fase 2.1.7). Coloca cada campo
 * por su geometría EXPLÍCITA `{gridX, gridY}` + ancho `colSpan` (=w); las
 * plantillas legacy (sin geometría) se DERIVAN del orden + colSpan (idéntico a la
 * vista anterior). Presentación pura: no toca validación ni datos.
 *
 * Responsive (regla de terreno): escritorio = grilla de 12 posicionada; tablet =
 * 2 columnas fluidas; celular = 1 columna apilada (orden por fila/columna). El
 * colapso se hace en CSS sobreescribiendo `grid-column/grid-row` a `auto`, por eso
 * la posición viaja como custom properties (no como estilo `grid-*` en duro).
 */

const clampCol = (n: number | null | undefined) =>
  Math.min(Math.max(Math.round(n || GRID_COLUMNS), 1), GRID_COLUMNS);

/** Forma mínima que necesita el layout: ancho + geometría opcional. */
export interface GeometryField {
  key: string;
  type: FieldType;
  colSpan: number;
  gridX?: number | null;
  gridY?: number | null;
  gridH?: number | null;
}

interface Placed<T> {
  field: T;
  x: number; // columna 0..11
  y: number; // fila lógica
  w: number; // ancho en columnas
}

/** Resuelve geometría: usa la explícita o, si falta en alguno, la deriva del orden. */
function resolveGeometry<T extends GeometryField>(fields: T[]): Placed<T>[] {
  const legacy = fields.some((f) => f.gridX == null || f.gridY == null);
  if (legacy) {
    let x = 0;
    let y = 0;
    const out: Placed<T>[] = [];
    for (const field of fields) {
      const w = clampCol(field.colSpan);
      if (x + w > GRID_COLUMNS) {
        x = 0;
        y += 1;
      }
      out.push({ field, x, y, w });
      x += w;
    }
    return out;
  }
  return fields.map((f) => ({ field: f, x: f.gridX!, y: f.gridY!, w: clampCol(f.colSpan) }));
}

/**
 * Coloca los campos de una sección por geometría. `fields` = la lista de la
 * sección (con geometría o legacy); `renderCell` pinta el contenido de cada celda.
 */
export function FieldGrid<T extends GeometryField>({
  fields,
  renderCell,
}: {
  fields: T[];
  renderCell: (field: T) => ReactNode;
}) {
  const placed = resolveGeometry(fields);
  // Índice de fila DENSO: mapea los `y` lógicos únicos a 0..k (evita filas vacías
  // por huecos de posicionamiento libre). El orden del DOM sigue (y, x) para que el
  // apilado en celular sea coherente.
  const uniqueY = Array.from(new Set(placed.map((p) => p.y))).sort((a, b) => a - b);
  const rowOf = new Map(uniqueY.map((y, i) => [y, i]));
  const ordered = [...placed].sort((a, b) => (a.y - b.y) || (a.x - b.x));

  // `gridContainer` declara un contexto de container-query: la grilla colapsa según
  // el ANCHO DE SU CONTENEDOR (no del viewport) ⇒ el preview de tablet/móvil del
  // editor reflowe dentro de su marco, y el llenado real respeta su propio ancho.
  return (
    <div className={styles.gridContainer}>
      <div className={styles.grid} data-field-grid>
        {ordered.map(({ field, x, w, y }) => (
          <div
            key={field.key}
            className={styles.cell}
            style={{ "--gx": x + 1, "--gw": w, "--grow": (rowOf.get(y) ?? 0) + 1 } as CSSProperties}
          >
            {renderCell(field)}
          </div>
        ))}
      </div>
    </div>
  );
}
