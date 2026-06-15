import { useMemo } from "react";
import GridLayout, { WidthProvider, type Layout } from "react-grid-layout";
import type { FieldType } from "@lyra/contracts";
import { FieldControl } from "./FieldControl.js";
import { type EditField } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const RGL = WidthProvider(GridLayout);
export const CANVAS_COLS = 12;
export const CANVAS_ROW_H = 78;

/** Geometría que el lienzo devuelve al soltar/redimensionar (commit, no por píxel). */
export interface CanvasGeometry {
  uid: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SectionCanvasProps {
  fields: EditField[];
  canEdit: boolean;
  showGrid: boolean;
  selectedFUid: string | null;
  onSelectField: (fUid: string) => void;
  /** Commit de geometría tras arrastrar/redimensionar (RGL onDragStop/onResizeStop). */
  onGeometryChange: (geom: CanvasGeometry[]) => void;
  /** Soltar un objeto NUEVO desde la paleta en (x, y). */
  onDropNew: (type: FieldType, x: number, y: number) => void;
}

/**
 * Lienzo de POSICIONAMIENTO LIBRE de una sección (Fase 2.1.7) con react-grid-layout.
 * Cada campo se arrastra y redimensiona libremente sobre una grilla responsiva de 12
 * columnas; la geometría {x,y,w,h} es explícita y se persiste (no vive en CSS). Sin
 * solapamiento ni z-index (en un formulario los campos no se montan). El commit ocurre
 * al SOLTAR (onDragStop/onResizeStop), no por píxel (rendimiento + historial limpio).
 */
export function SectionCanvas({
  fields,
  canEdit,
  showGrid,
  selectedFUid,
  onSelectField,
  onGeometryChange,
  onDropNew,
}: SectionCanvasProps) {
  const layout: Layout[] = useMemo(
    () =>
      fields.map((f) => ({
        i: f.uid,
        x: f.gridX,
        y: f.gridY,
        w: f.colSpan,
        h: f.gridH,
        minW: 2,
        minH: 1,
        maxW: CANVAS_COLS,
      })),
    [fields],
  );

  // Commit solo si la geometría realmente cambió (RGL también dispara al montar).
  const commit = (next: Layout[]) => {
    let changed = false;
    const geom = next.map((l) => {
      const cur = fields.find((f) => f.uid === l.i);
      if (!cur || cur.gridX !== l.x || cur.gridY !== l.y || cur.colSpan !== l.w || cur.gridH !== l.h) changed = true;
      return { uid: l.i, x: l.x, y: l.y, w: l.w, h: l.h };
    });
    if (changed) onGeometryChange(geom);
  };

  const handleDrop = (_layout: Layout[], item: Layout, e: Event) => {
    const type = (e as DragEvent).dataTransfer?.getData("text/plain");
    if (type) onDropNew(type as FieldType, item.x, item.y);
  };

  return (
    <RGL
      className={`${styles.rgl}${showGrid ? " " + styles.rglShowGrid : ""}`}
      cols={CANVAS_COLS}
      rowHeight={CANVAS_ROW_H}
      margin={[12, 12]}
      containerPadding={[0, 0]}
      layout={layout}
      compactType={null}
      preventCollision
      isBounded
      isDraggable={canEdit}
      isResizable={canEdit}
      resizeHandles={["e", "w", "s", "se"]}
      draggableCancel=".rglNoDrag"
      isDroppable={canEdit}
      droppingItem={{ i: "__dropping__", w: 6, h: 1 }}
      onDrop={handleDrop}
      onDragStop={(l) => commit(l)}
      onResizeStop={(l) => commit(l)}
    >
      {fields.map((f) => (
        <div
          key={f.uid}
          className={`${styles.canvasItem}${selectedFUid === f.uid ? " " + styles.canvasItemActive : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelectField(f.uid);
          }}
        >
          <div className={styles.canvasItemLabel}>
            {f.label}
            {f.required && <span className={styles.canvasReq}>*</span>}
          </div>
          <div className={styles.canvasItemControl} aria-hidden>
            <FieldControl field={f} value={undefined} onChange={() => undefined} />
          </div>
        </div>
      ))}
    </RGL>
  );
}
