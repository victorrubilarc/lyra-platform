import type { ReactNode } from "react";
import type { LayoutWidth } from "@lyra/contracts";
import styles from "./FieldGrid.module.css";

/**
 * Grilla responsiva de campos por sección (Fase 2.1.2) — FUENTE ÚNICA de render
 * del layout, compartida por la vista previa del builder, el llenado y el visor.
 * El contenedor mantiene 12 columnas; cada celda declara su span vía `width`
 * (FULL/HALF/THIRD). Presentación pura: no toca validación ni datos.
 */
export function FieldGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}

/** Celda de la grilla: ocupa el ancho del campo (default FULL). */
export function FieldGridCell({ width, children }: { width?: LayoutWidth | null; children: ReactNode }) {
  return (
    <div className={styles.cell} data-span={width ?? "FULL"}>
      {children}
    </div>
  );
}
