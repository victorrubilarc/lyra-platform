import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, FunctionSquare, GripVertical, Trash2 } from "lucide-react";
import { GRID_COLUMNS } from "@lyra/contracts";
import { fieldTypeMeta, type EditField } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

const clampSpan = (n: number) => Math.min(Math.max(Math.round(n), 1), GRID_COLUMNS);

interface BuilderFieldCardProps {
  field: EditField;
  index: number;
  count: number;
  active: boolean;
  canEdit: boolean;
  dragging: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  onResize: (span: number) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: () => void;
  onDrop: () => void;
}

/**
 * Card de un campo en el LIENZO WYSIWYG del builder (Fase 2.1.3). Se ve en su ancho
 * real dentro de la grilla de la sección. Se REORDENA arrastrando (DnD nativo, patrón
 * `ColumnsDrawer`; las flechas ↑↓ quedan como vía de teclado) y se REDIMENSIONA
 * arrastrando el borde derecho (pointer-events, patrón `ResizableSplit`) — el handle
 * es `role="slider"`, operable con ← →. El builder lo usa el Configurador en escritorio.
 */
export function BuilderFieldCard({
  field,
  index,
  count,
  active,
  canEdit,
  dragging,
  dropTarget,
  onSelect,
  onDelete,
  onMove,
  onResize,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: BuilderFieldCardProps) {
  const { t } = useTranslation();
  const meta = fieldTypeMeta(field.type);
  const Icon = meta.icon;
  const c = field.config as Record<string, unknown>;

  // Redimensionar: deriva el span de la posición del puntero respecto de la grilla
  // de la sección (`[data-field-grid]`). Snap por columna (ancho de la grilla / 12).
  const spanFromPointer = (handle: HTMLElement, clientX: number): number | null => {
    const grid = handle.closest("[data-field-grid]") as HTMLElement | null;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    if (rect.width <= 0) return null;
    const col = rect.width / GRID_COLUMNS;
    return clampSpan((clientX - rect.left) / col);
  };

  const onHandleDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    const onMoveEv = (ev: PointerEvent) => {
      const next = spanFromPointer(handle, ev.clientX);
      if (next !== null && next !== field.colSpan) onResize(next);
    };
    const onUp = (ev: PointerEvent) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMoveEv);
      handle.removeEventListener("pointerup", onUp);
    };
    handle.addEventListener("pointermove", onMoveEv);
    handle.addEventListener("pointerup", onUp);
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
        // Evita que el arrastre se inicie desde el handle de redimensionar.
        if ((e.target as HTMLElement).dataset.resizeHandle) {
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
      <span className={styles.cardGrip} aria-hidden>
        <GripVertical size={15} />
      </span>
      <Icon size={16} className={styles.fieldIcon} />
      <div className={styles.fieldInfo}>
        <div className={styles.fieldLabel}>
          {field.label}
          {field.required && !field.computed && <span className={styles.req}> *</span>}
          {field.computed && (
            <span className={styles.computedBadge}>
              <FunctionSquare size={11} /> {t("templates.builder.computedTag")}
            </span>
          )}
        </div>
        <div className={styles.fieldSub}>
          {t(meta.labelKey)}
          {c.unit ? ` · ${c.unit as string}` : ""}
          {c.min !== undefined || c.max !== undefined ? ` · ${c.min ?? "—"}–${c.max ?? "—"}` : ""}
          {field.visibleWhen ? ` · ${t("templates.builder.conditionalTag")}` : ""}
          {` · ${field.colSpan}/${GRID_COLUMNS}`}
        </div>
      </div>
      <div className={styles.rowActions} onClick={(e) => e.stopPropagation()}>
        <button type="button" className={styles.iconBtn} onClick={() => onMove(-1)} disabled={!canEdit || index === 0} aria-label={t("common.moveUp")}>
          <ArrowUp size={13} />
        </button>
        <button type="button" className={styles.iconBtn} onClick={() => onMove(1)} disabled={!canEdit || index === count - 1} aria-label={t("common.moveDown")}>
          <ArrowDown size={13} />
        </button>
        <button type="button" className={styles.iconBtnDanger} onClick={onDelete} disabled={!canEdit} aria-label={t("common.delete")}>
          <Trash2 size={13} />
        </button>
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
