import { useEffect, useRef, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import { GRID_COLUMNS } from "@lyra/contracts";
import { FieldControl } from "./FieldControl.js";
import { FieldToolbar } from "./FieldToolbar.js";
import { type EditField } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

const clampSpan = (n: number) => Math.min(Math.max(Math.round(n), 1), GRID_COLUMNS);

/** Zona de soltado derivada de la posición del puntero sobre la card. */
export type DropMode = "beside-left" | "beside-right" | "row-before" | "row-after";

interface BuilderFieldCardProps {
  field: EditField;
  active: boolean;
  canEdit: boolean;
  dragging: boolean;
  /** Zona de soltado activa para ESTA card (indicador), o null. */
  dropMode: DropMode | null;
  /** Tiene vecino a la derecha en su fila ⇒ el borde funciona como divisor. */
  resizable: boolean;
  onSelect: () => void;
  onLabel: (label: string) => void;
  onResizeAbs: (absCol: number) => void;
  onNudge: (delta: -1 | 1) => void;
  onToggleRequired: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoreOptions: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropHint: (mode: DropMode) => void;
  onDrop: (mode: DropMode) => void;
}

/** Deriva la zona de soltado de la posición del puntero dentro de la card. */
function zoneFromPointer(e: ReactDragEvent<HTMLDivElement>): DropMode {
  const r = e.currentTarget.getBoundingClientRect();
  const y = (e.clientY - r.top) / r.height;
  if (y < 0.28) return "row-before";
  if (y > 0.72) return "row-after";
  return (e.clientX - r.left) / r.width < 0.5 ? "beside-left" : "beside-right";
}

/**
 * Card de un campo en el LIENZO WYSIWYG (Fase 2.1.5). Muestra el control REAL y se
 * acomoda por ARRASTRE (auto-layout estilo Notion): soltar al lado ⇒ comparte fila
 * (ancho repartido solo), soltar arriba/abajo ⇒ fila propia. El borde derecho es un
 * DIVISOR (transfiere ancho al vecino, manteniendo la fila). El usuario nunca elige
 * "columnas". Builder de escritorio (DnD nativo + pointer-events, sin librería).
 */
export function BuilderFieldCard({
  field,
  active,
  canEdit,
  dragging,
  dropMode,
  resizable,
  onSelect,
  onLabel,
  onResizeAbs,
  onNudge,
  onToggleRequired,
  onDuplicate,
  onDelete,
  onMoreOptions,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDropHint,
  onDrop,
}: BuilderFieldCardProps) {
  const { t } = useTranslation();
  const labelRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [field.label]);

  // Divisor: columna 1..12 bajo el puntero respecto de la grilla de la sección.
  const absColFromPointer = (handle: HTMLElement, clientX: number): number | null => {
    const grid = handle.closest("[data-field-grid]") as HTMLElement | null;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return clampSpan((clientX - rect.left) / (rect.width / GRID_COLUMNS));
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEdit || !resizable) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const abs = absColFromPointer(handle, ev.clientX);
      if (abs !== null) onResizeAbs(abs);
    };
    const up = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  const onHandleKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!canEdit || !resizable) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onNudge(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onNudge(1);
    }
  };

  return (
    <div
      className={`${active ? styles.builderCardActive : styles.builderCard}${dragging ? " " + styles.builderCardDragging : ""}${dropMode ? " " + styles[`drop_${dropMode}`] : ""}`}
      draggable={canEdit}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDragStart={(e) => {
        const tgt = e.target as HTMLElement;
        if (!tgt.dataset.dragHandle) {
          e.preventDefault();
          return;
        }
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (!canEdit) return;
        e.preventDefault();
        onDropHint(zoneFromPointer(e));
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop(zoneFromPointer(e));
      }}
    >
      <span className={styles.cardGrip} data-drag-handle="1" aria-hidden title={t("templates.builder.dragToReorder")}>
        <GripVertical size={15} />
      </span>

      {active && (
        <FieldToolbar
          required={field.required}
          computed={!!field.computed}
          canEdit={canEdit}
          onToggleRequired={onToggleRequired}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onMoreOptions={onMoreOptions}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      )}

      <div className={styles.cardBody}>
        <textarea
          ref={labelRef}
          className={styles.inlineLabel}
          value={field.label}
          rows={1}
          disabled={!canEdit}
          aria-label={t("templates.builder.fieldLabel")}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onLabel(e.target.value)}
        />
        <div className={styles.cardControl} aria-hidden>
          <FieldControl field={field} value={undefined} onChange={() => undefined} />
        </div>
      </div>

      {/* Divisor (borde derecho): solo si comparte fila con un vecino a la derecha. */}
      {resizable && (
        <div
          data-resize-handle="1"
          className={styles.cardResize}
          role="slider"
          tabIndex={canEdit ? 0 : -1}
          aria-label={t("templates.builder.resizeField", { cols: field.colSpan })}
          aria-valuemin={1}
          aria-valuemax={GRID_COLUMNS}
          aria-valuenow={field.colSpan}
          onPointerDown={onHandleDown}
          onKeyDown={onHandleKey}
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
}
