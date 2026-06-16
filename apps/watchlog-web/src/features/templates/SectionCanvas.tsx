import { useEffect, useRef, useState, type CSSProperties, type DragEvent as RDE, type PointerEvent as RPE } from "react";
import { useTranslation } from "react-i18next";
import { FieldControl } from "./FieldControl.js";
import { type EditField, fieldDisplayMeta } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

/** Claves i18n del rótulo de formato de un TEXT (para los chips del panel de hover). */
const TEXT_FORMAT_LABEL_KEY: Record<string, string> = {
  rut: "templates.builder.textFormatRut",
  email: "templates.builder.textFormatEmail",
  phone: "templates.builder.textFormatPhone",
  url: "templates.builder.textFormatUrl",
};

/**
 * "Datos interesantes" CONFIGURADOS en el campo, como chips cortos para el panel de
 * hover del lienzo (ver qué es y cómo está configurado sin pincharlo). El TIPO ya lo
 * muestra la cabecera (`fieldDisplayMeta`), así que aquí NO se repite lo que el nombre
 * del preset implica (entidad/kind/displayAs): solo lo que cambia el comportamiento.
 */
function fieldInfoChips(field: EditField, t: (k: string, opts?: Record<string, unknown>) => string): string[] {
  const c = (field.config ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" ? v : undefined);
  const chips: string[] = [];
  if (field.required && !field.computed) chips.push(t("templates.builder.fieldInfo.required"));
  if (field.computed) chips.push(t("templates.builder.fieldInfo.computed"));
  if (field.visibleWhen) chips.push(t("templates.builder.fieldInfo.conditional"));

  switch (field.type) {
    case "NUMBER": {
      if (c.format === "percent") chips.push("%");
      else if (c.format === "currency") chips.push(String(c.currency ?? "CLP"));
      else if (typeof c.unit === "string" && c.unit) chips.push(c.unit);
      if (typeof c.expected === "number") {
        chips.push(`${t("templates.builder.fieldInfo.target")} ${c.expected}${typeof c.tolerance === "number" ? ` ± ${c.tolerance}` : ""}`);
      }
      if (c.counter === true) chips.push(t("templates.builder.fieldInfo.counter"));
      const lo = num(c.min);
      const hi = num(c.max);
      if (lo !== undefined || hi !== undefined) chips.push(`${lo ?? "−∞"}…${hi ?? "∞"}`);
      if (typeof c.decimals === "number") chips.push(t("templates.builder.fieldInfo.decimals", { n: c.decimals }));
      if (["warnLow", "warnHigh", "critLow", "critHigh"].some((k) => typeof c[k] === "number")) {
        chips.push(t("templates.builder.fieldInfo.thresholds"));
      }
      break;
    }
    case "TEXT":
    case "TEXTAREA": {
      if (typeof c.format === "string" && TEXT_FORMAT_LABEL_KEY[c.format]) chips.push(t(TEXT_FORMAT_LABEL_KEY[c.format]!));
      const lo = num(c.minLength);
      const hi = num(c.maxLength);
      if (lo !== undefined || hi !== undefined) chips.push(t("templates.builder.fieldInfo.chars", { range: `${lo ?? 0}–${hi ?? "∞"}` }));
      if (c.scan === true) chips.push(t("templates.builder.fieldInfo.scan"));
      break;
    }
    case "SELECT":
    case "MULTISELECT": {
      const src = c.optionSource as { kind?: string; items?: unknown[] } | undefined;
      if (src?.kind === "inline" && Array.isArray(src.items)) chips.push(t("templates.builder.fieldInfo.options", { n: src.items.length }));
      else if (src?.kind === "referenceList") chips.push(t("templates.builder.fieldInfo.refList"));
      break;
    }
    case "RATING": {
      chips.push(`1–${num(c.max) ?? 5}`);
      break;
    }
    case "ATTACHMENT": {
      if (c.multiple === true) chips.push(t("templates.builder.fieldInfo.multiple"));
      break;
    }
    case "TABLE": {
      chips.push(t("templates.builder.fieldInfo.columns", { n: Array.isArray(c.columns) ? c.columns.length : 0 }));
      break;
    }
    case "MATRIX": {
      chips.push(`${Array.isArray(c.rows) ? c.rows.length : 0}×${Array.isArray(c.columns) ? c.columns.length : 0}`);
      break;
    }
    case "RISK_MATRIX": {
      chips.push(`${Array.isArray(c.probabilityLabels) ? c.probabilityLabels.length : 0}×${Array.isArray(c.consequenceLabels) ? c.consequenceLabels.length : 0}`);
      break;
    }
  }
  return chips;
}

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
  /** uid del campo recién agregado desde la paleta: el lienzo hace scroll hasta él. */
  scrollToUid?: string | null;
  onSelectField: (fUid: string) => void;
  onLabel: (fUid: string, label: string) => void;
  onGeometryChange: (geom: CanvasGeometry[]) => void;
  onDropNew: (presetId: string, x: number, y: number) => void;
}

export function SectionCanvas({
  fields,
  canEdit,
  showGrid,
  selectedFUid,
  scrollToUid,
  onSelectField,
  onLabel,
  onGeometryChange,
  onDropNew,
}: SectionCanvasProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  // Scroll hasta el campo recién agregado desde la paleta (Ola 2 · #4): solo si ESTA
  // sección lo contiene (cada sección tiene su propio lienzo).
  useEffect(() => {
    if (!scrollToUid || !fields.some((f) => f.uid === scrollToUid)) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-fuid="${scrollToUid}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollToUid]);
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  const [active, setActive] = useState<Active | null>(null);
  // `activeRef` = espejo síncrono de `active`: los listeners de ventana leen de aquí
  // (NO se llaman efectos secundarios dentro del actualizador de setState, que debe
  // ser puro — ese era el motivo de que la selección no abriera el panel).
  const activeRef = useRef<Active | null>(null);
  const [dropAt, setDropAt] = useState<CanvasGeometry | null>(null);
  // Inicio del gesto + bandera de "se movió" (para distinguir clic de arrastre).
  const startRef = useRef({ x: 0, y: 0, colW: 100, moved: false });

  const geomOf = (f: EditField): CanvasGeometry =>
    active && active.uid === f.uid ? active.live : { uid: f.uid, x: f.gridX, y: f.gridY, w: f.colSpan, h: f.gridH };

  const contentRows = Math.max(
    1,
    ...fields.map((f) => geomOf(f).y + geomOf(f).h),
    active ? active.live.y + active.live.h : 0,
    dropAt ? dropAt.y + dropAt.h : 0,
  );
  // Una fila de MARGEN abajo (editando) = zona de drop para crear una fila nueva.
  const rows = contentRows + (canEdit ? 1 : 0);

  // Listeners de puntero a nivel de ventana durante un gesto (se enlazan al EMPEZAR).
  useEffect(() => {
    if (!active) return;
    const onMove = (ev: PointerEvent) => {
      const a = activeRef.current;
      if (!a) return;
      const s = startRef.current;
      if (Math.abs(ev.clientX - s.x) > 3 || Math.abs(ev.clientY - s.y) > 3) s.moved = true;
      const dCol = Math.round((ev.clientX - s.x) / s.colW);
      const dRow = Math.round((ev.clientY - s.y) / PITCH);
      const b = a.base;
      const n: CanvasGeometry = { ...b };
      if (a.type === "move") {
        n.x = clamp(b.x + dCol, 0, CANVAS_COLS - b.w);
        n.y = Math.max(0, b.y + dRow);
      }
      if (a.type === "e" || a.type === "se") n.w = clamp(b.w + dCol, MIN_W, CANVAS_COLS - b.x);
      if (a.type === "s" || a.type === "se") n.h = clamp(b.h + dRow, 1, 16);
      activeRef.current = { ...a, live: n };
      setActive({ ...a, live: n });
    };
    const onUp = () => {
      const a = activeRef.current;
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
      activeRef.current = null;
      setActive(null);
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
    const a = { uid, type, base, live: base };
    activeRef.current = a;
    setActive(a);
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
    const presetId = e.dataTransfer.getData("text/plain");
    const cell = cellFromEvent(e, 6);
    setDropAt(null);
    if (presetId) onDropNew(presetId, cell.x, cell.y);
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
        const meta = fieldDisplayMeta(f);
        const MetaIcon = meta.icon;
        const infoChips = fieldInfoChips(f, t);
        return (
          <div
            key={f.uid}
            data-fuid={f.uid}
            className={`${styles.canvasCell}${dragging ? " " + styles.canvasCellDragging : ""}${sel ? " " + styles.canvasCellSelected : ""}`}
            style={cellStyle(g)}
            onPointerDown={(e) => begin(e, f.uid, "move")}
            // No dejar que el clic burbujee a la sección (que selecciona la sección y
            // borraría la selección del campo) ni al lienzo (que deselecciona).
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`${styles.canvasItem}${sel ? " " + styles.canvasItemActive : ""}`}>
              {/* Título EDITABLE dentro del objeto (no arrastra: stopPropagation). */}
              <input
                className={styles.canvasItemLabel}
                value={f.label}
                disabled={!canEdit}
                aria-label="Etiqueta del campo"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onFocus={() => onSelectField(f.uid)}
                onChange={(e) => onLabel(f.uid, e.target.value)}
              />
              <div className={styles.canvasItemControl} aria-hidden>
                <FieldControl field={f} value={undefined} onChange={() => undefined} />
              </div>
            </div>

            {/* Hover: qué objeto es + datos configurados (se revela en cards NO seleccionadas, vía CSS). */}
            <div className={styles.cardInfo} aria-hidden>
              <span className={styles.cardInfoType}>
                <MetaIcon size={12} /> {t(meta.labelKey)}
              </span>
              {infoChips.length > 0 && (
                <span className={styles.cardInfoChips}>
                  {infoChips.map((ch, i) => (
                    <span key={i} className={styles.cardInfoChip}>
                      {ch}
                    </span>
                  ))}
                </span>
              )}
            </div>

            {canEdit && (
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
