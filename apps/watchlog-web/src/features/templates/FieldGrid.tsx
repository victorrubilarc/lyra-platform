import type { CSSProperties, ReactNode } from "react";
import { GRID_COLUMNS } from "@lyra/contracts";
import styles from "./FieldGrid.module.css";

/**
 * Grilla responsiva de campos por sección (Fase 2.1.2 → 2.1.3) — FUENTE ÚNICA de
 * render del layout, compartida por la vista previa del builder, el llenado y el
 * visor. El contenedor mantiene 12 columnas; cada celda declara cuántas ocupa
 * (`span` 1..12). Presentación pura: no toca validación ni datos.
 */
export function FieldGrid({ children }: { children: ReactNode }) {
  // `data-field-grid`: ancla para el divisor del builder (mide las 12 columnas).
  return (
    <div className={styles.grid} data-field-grid>
      {children}
    </div>
  );
}

/** Celda de la grilla: ocupa `span` columnas de 12 (default 12 = ancho completo). */
export function FieldGridCell({ span, children }: { span?: number | null; children: ReactNode }) {
  const cols = Math.min(Math.max(Math.round(span ?? GRID_COLUMNS), 1), GRID_COLUMNS);
  // El span viaja como custom property: el CSS lo usa en `grid-column`, pero la
  // media query de celular puede sobreescribir a `auto` (no se podría si fuera
  // un estilo inline directo de `grid-column`).
  return (
    <div className={styles.cell} style={{ "--col-span": cols } as CSSProperties}>
      {children}
    </div>
  );
}
