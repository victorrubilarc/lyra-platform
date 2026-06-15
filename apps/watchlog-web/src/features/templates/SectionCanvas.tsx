import { useEffect, useRef, useState, type CSSProperties, type DragEvent as RDE, type PointerEvent as RPE } from "react";
import type { FieldType } from "@lyra/contracts";
import { FieldControl } from "./FieldControl.js";
import { type EditField } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Lienzo de POSICIONAMIENTO LIBRE de una sección (Fase 2.1.7) — motor PROPIO con
 * eventos de puntero (sin librería). Reemplaza a react-grid-layout, que dio
 * problemas en React 19 (process, handles recortados, montaje). Cada campo tiene
 * geometría explícita {x,y,w,h} sobre una grilla de 12 columnas; se ARRASTRA para
 * moverlo (snap a la grilla), se REDIMENSIONA con tiradores en el borde derecho
 * (ancho), inferior (alto) y esquina, y se ARRASTRA DESDE LA PALETA (HTML5 drop).
 * Al soltar se COMPACTA verticalmente (gravedad hacia arriba) preservando los
 * campos lado a lado. Funciona con mouse y touch (pointer events). El commit ocurre
 * al SOLTAR, nunca por píxel.
 */

export const CANVAS_COLS = 12;
export const CANVAS_ROW_H = 84;
const ROW_GAP = 10;
const PITCH = CANVAS_ROW_H + ROW_GAP;
const MIN_W = 2;

export interface CanvasGeometry {
  uid: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);
const overlap = (a: CanvasGeometry, b: CanvasGeometry) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Compactación vertical (gravedad hacia arriba); preserva los campos lado a lado. */
function compact(items: CanvasGeometry[]): CanvasGeometry[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: CanvasGeometry[] = [];
  for (const it of sorted) {
    let y = 0;
    while (placed.some((p) => overlap(p, { ...it, y }))) y += 1;
    placed.push({ ...it, y });
  }
  return placed;
}

type DragType = "move" | "e" | "s" | "se";
interface Active {
  uid: string;
  type: DragType;
  base: CanvasGeometry;
  live: CanvasGeometry;
}

interface SectionCanvasProps {
  fields: EditField[];
  canEdit: boolean;
  showGrid: boolean;
  selectedFUid: string | null;
  onSelectField: (fUid: string) => void;
  onGeometryChange: (geom: CanvasGeometry[]) => void;
  onDropNew: (type: FieldType, x: number, y: number) => void;
}

export function SectionCanvas({
  fields,
  canEdit,
  showGrid,
  selectedFUid,
  onSelectField,
  onGeometryChange,
  onDropNew,
}: SectionCanvasProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const [active, setActive] = useState<Active | null>(null);
  const [dropAt, setDropAt] = useState<CanvasGeometry | null>(null);
  // Inicio del gesto + bandera de "se movió" (para distinguir clic de arrastre).
  const startRef = useRef({ x: 0, y: 0, colW: 100, moved: false });

  const geomOf = (f: EditField): CanvasGeometry =>
    active && active.uid === f.uid ? active.live : { uid: f.uid, x: f.gridX, y: f.gridY, w: f.colSpan, h: f.gridH };

  const rows = Math.max(
    2,
    ...fields.map((f) => geomOf(f).y + geomOf(f).h),
    active ? active.live.y + active.live.h : 0,
    dropAt ? dropAt.y + dropAt.h : 0,
  );

  // Listeners de puntero a nivel de ventana mientras dura un gesto (se enlazan al
  // EMPEZAR: las deps son uid+type, estables durante el gesto).
  useEffect(() => {
    if (!active) return;
    const onMove = (ev: PointerEvent) => {
      const s = startRef.current;
      if (Math.abs(ev.clientX - s.x) > 3 || Math.abs(ev.clientY - s.y) > 3) s.moved = true;
      const dCol = Math.round((ev.clientX - s.x) / s.colW);
      const dRow = Math.round((ev.clientY - s.y) / PITCH);
      setActive((a) => {
        if (!a) return a;
        const b = a.base;
        const n: CanvasGeometry = { ...b };
        if (a.type === "move") {
          n.x = clamp(b.x + dCol, 0, CANVAS_COLS - b.w);
          n.y = Math.max(0, b.y + dRow);
        }
        if (a.type === "e" || a.type === "se") n.w = clamp(b.w + dCol, MIN_W, CANVAS_COLS - b.x);
        if (a.type === "s" || a.type === "se") n.h = clamp(b.h + dRow, 1, 16);
        return { ...a, live: n };
      });
    };
    const onUp = () => {
      setActive((a) => {
        if (a) {
          if (a.type === "move" && !startRef.current.moved) {
            onSelectField(a.uid); // fue un clic, no un arrastre ⇒ seleccionar
          } else {
            const others = fieldsRef.current
              .filter((f) => f.uid !== a.uid)
              .map((f) => ({ uid: f.uid, x: f.gridX, y: f.gridY, w: f.colSpan, h: f.gridH }));
            onGeometryChange(compact([...others, a.live]));
          }
        }
        return null;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.uid, active?.type]);

  function begin(e: RPE<HTMLDivElement>, uid: string, type: DragType) {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const f = fieldsRef.current.find((x) => x.uid === uid);
    if (!f) return;
    const base = { uid, x: f.gridX, y: f.gridY, w: f.colSpan, h: f.gridH };
    startRef.current = {
      x: e.clientX,
      y: e.clientY,
      colW: (ref.current?.clientWidth ?? 1200) / CANVAS_COLS,
      moved: false,
    };
    setActive({ uid, type, base, live: base });
  }

  // ── Arrastrar desde la paleta (HTML5 drop) ──────────────────────────────────
  function cellFromEvent(e: RDE<HTMLDivElement>, w: number): CanvasGeometry {
    const rect = ref.current!.getBoundingClientRect();
    const colW = rect.width / CANVAS_COLS;
    const x = clamp(Math.round((e.clientX - rect.left) / colW), 0, CANVAS_COLS - w);
    const y = Math.max(0, Math.floor((e.clientY - rect.top) / PITCH));
    return { uid: "__drop__", x, y, w, h: 1 };
  }
  function onDragOver(e: RDE<HTMLDivElement>) {
    if (!canEdit || !ref.current) return;
    e.preventDefault();
    setDropAt(cellFromEvent(e, 6));
  }
  function onDrop(e: RDE<HTMLDivElement>) {
    if (!canEdit || !ref.current) return;
    e.preventDefault();
    const type = e.dataTransfer.getData("text/plain");
    const cell = cellFromEvent(e, 6);
    setDropAt(null);
    if (type) onDropNew(type as FieldType, cell.x, cell.y);
  }

  const cellStyle = (g: CanvasGeometry): CSSProperties => ({
    left: `${(g.x / CANVAS_COLS) * 100}%`,
    width: `${(g.w / CANVAS_COLS) * 100}%`,
    top: g.y * PITCH,
    height: g.h * CANVAS_ROW_H + (g.h - 1) * ROW_GAP,
  });

  return (
    <div
      ref={ref}
      className={`${styles.canvasSurface}${showGrid ? " " + styles.canvasSurfaceGrid : ""}`}
      style={{ height: rows * PITCH }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={() => setDropAt(null)}
    >
      {dropAt && <div className={styles.canvasDropGhost} style={cellStyle(dropAt)} aria-hidden />}

      {fields.map((f) => {
        const g = geomOf(f);
        const sel = selectedFUid === f.uid;
        const dragging = active?.uid === f.uid;
        return (
          <div
            key={f.uid}
            className={`${styles.canvasCell}${dragging ? " " + styles.canvasCellDragging : ""}`}
            style={cellStyle(g)}
            onPointerDown={(e) => begin(e, f.uid, "move")}
          >
            <div className={`${styles.canvasItem}${sel ? " " + styles.canvasItemActive : ""}`}>
              <div className={styles.canvasItemLabel}>
                {f.label}
                {f.required && <span className={styles.canvasReq}>*</span>}
              </div>
              <div className={styles.canvasItemControl} aria-hidden>
                <FieldControl field={f} value={undefined} onChange={() => undefined} />
              </div>
            </div>

            {canEdit && sel && (
              <>
                <div className={styles.cvHandleE} onPointerDown={(e) => begin(e, f.uid, "e")} aria-hidden />
                <div className={styles.cvHandleS} onPointerDown={(e) => begin(e, f.uid, "s")} aria-hidden />
                <div className={styles.cvHandleSE} onPointerDown={(e) => begin(e, f.uid, "se")} aria-hidden />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
