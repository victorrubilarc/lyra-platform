import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import { GRID_COLUMNS } from "@lyra/contracts";
import { FieldControl } from "./FieldControl.js";
import { FieldToolbar } from "./FieldToolbar.js";
import { type EditField } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

const clampSpan = (n: number) => Math.min(Math.max(Math.round(n), 1), GRID_COLUMNS);

interface BuilderFieldCardProps {
  field: EditField;
  active: boolean;
  canEdit: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onLabel: (label: string) => void;
  onResize: (span: number) => void;
  onToggleRequired: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoreOptions: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

/**
 * Card de un campo en el LIENZO WYSIWYG del builder (Fase 2.1.4). Muestra el
 * **control REAL** (no interactivo) tal cual saldrá en el formulario, con el rótulo
 * editable EN EL LUGAR y una **barra flotante** de configuración (estilo Canva/
 * Google Forms). Se reordena arrastrando (DnD nativo) y se redimensiona arrastrando
 * el borde derecho (pointer-events; `role="slider"` con ← →). El builder lo usa el
 * Configurador en escritorio.
 */
export function BuilderFieldCard({
  field,
  active,
  canEdit,
  dragging,
  dropTarget,
  onSelect,
  onLabel,
  onResize,
  onToggleRequired,
  onDuplicate,
  onDelete,
  onMoreOptions,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: BuilderFieldCardProps) {
  const { t } = useTranslation();
  const labelRef = useRef<HTMLTextAreaElement>(null);

  // El rótulo inline se auto-ajusta a su contenido (sin scroll).
  useEffect(() => {
    const el = labelRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [field.label]);

  // Redimensionar: deriva el span de la posición del puntero respecto de la grilla
  // de la sección (`[data-field-grid]`). Snap por columna (ancho de la grilla / 12).
  const spanFromPointer = (handle: HTMLElement, clientX: number): number | null => {
    const grid = handle.closest("[data-field-grid]") as HTMLElement | null;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    if (rect.width <= 0) return null;
    return clampSpan((clientX - rect.left) / (rect.width / GRID_COLUMNS));
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const next = spanFromPointer(handle, ev.clientX);
      if (next !== null && next !== field.colSpan) onResize(next);
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
    if (!canEdit) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      onResize(clampSpan(field.colSpan - 1));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onResize(clampSpan(field.colSpan + 1));
    }
  };

  return (
    <div
      className={`${active ? styles.builderCardActive : styles.builderCard}${dragging ? " " + styles.builderCardDragging : ""}${dropTarget ? " " + styles.builderCardDrop : ""}`}
      draggable={canEdit}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onDragStart={(e) => {
        const tgt = e.target as HTMLElement;
        // El arrastre solo inicia desde el asa; no desde el rótulo, el handle ni la barra.
        if (!tgt.dataset.dragHandle) {
          e.preventDefault();
          return;
        }
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        if (canEdit) {
          e.preventDefault();
          onDragOver();
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      {/* Asa de arrastre (única zona "draggable" de la card). */}
      <span className={styles.cardGrip} data-drag-handle="1" aria-hidden title={t("templates.builder.dragToReorder")}>
        <GripVertical size={15} />
      </span>

      {/* Barra flotante contextual (solo cuando la card está activa). */}
      {active && (
        <FieldToolbar
          colSpan={field.colSpan}
          required={field.required}
          computed={!!field.computed}
          canEdit={canEdit}
          onWidth={onResize}
          onToggleRequired={onToggleRequired}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onMoreOptions={onMoreOptions}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      )}

      <div className={styles.cardBody}>
        {/* Rótulo editable EN EL LUGAR. */}
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
        {/* Control REAL (widgets vacíos, no interactivos vía CSS): lo que se ve es lo
            que es. Se oculta el rótulo interno del control (el inline de arriba manda). */}
        <div className={styles.cardControl} aria-hidden>
          <FieldControl field={field} value={undefined} onChange={() => undefined} />
        </div>
      </div>

      {/* Handle de redimensionar (borde derecho). Pointer = arrastrar; teclado = ← →. */}
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
    </div>
  );
}
