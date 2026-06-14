import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { GripVertical } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GRID_COLUMNS } from "@lyra/contracts";
import { FieldControl } from "./FieldControl.js";
import { FieldToolbar } from "./FieldToolbar.js";
import { type EditField } from "./builder-model.js";
import gridStyles from "./FieldGrid.module.css";
import styles from "./TemplateBuilder.module.css";

const clampSpan = (n: number) => Math.min(Math.max(Math.round(n), 1), GRID_COLUMNS);

/** Zona de soltado derivada de la posición del campo arrastrado sobre el destino. */
export type DropMode = "beside-left" | "beside-right" | "row-before" | "row-after";

interface BuilderFieldCardProps {
  field: EditField;
  /** Sección a la que pertenece (para el contexto de arrastre dnd-kit). */
  sUid: string;
  active: boolean;
  canEdit: boolean;
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
}

/**
 * Card de un campo en el LIENZO WYSIWYG (Fase 2.1.6). El arrastre usa **dnd-kit**
 * (pointer/teclado) en vez del DnD nativo: el nodo SORTABLE es la celda de la grilla
 * (para que el reflow de los vecinos se anime), y el área activadora es la tarjeta
 * completa — se agarra en casi cualquier parte (el rótulo y el borde-divisor quedan
 * exentos para poder escribir y redimensionar). El ancho se DERIVA del arrastre
 * (auto-layout estilo Notion/Canva): soltar al lado ⇒ comparte fila (ancho repartido
 * solo), soltar arriba/abajo ⇒ fila propia. El borde derecho es un DIVISOR (transfiere
 * ancho al vecino). El usuario nunca elige "columnas".
 */
export function BuilderFieldCard({
  field,
  sUid,
  active,
  canEdit,
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
}: BuilderFieldCardProps) {
  const { t } = useTranslation();
  const labelRef = useRef<HTMLTextAreaElement>(null);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: field.uid,
    data: { type: "field", sUid, fUid: field.uid },
    disabled: !canEdit,
  });

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
    e.stopPropagation(); // no inicia arrastre de la card
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

  const cols = clampSpan(field.colSpan);
  const cellStyle: CSSProperties = {
    "--col-span": cols,
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 2 : undefined,
  } as CSSProperties;

  const cardCls =
    `${active ? styles.builderCardActive : styles.builderCard}` +
    `${isDragging ? " " + styles.builderCardDragging : ""}` +
    `${dropMode ? " " + styles[`drop_${dropMode}`] : ""}`;

  return (
    // El nodo SORTABLE es la celda de la grilla (posición + reflow animado).
    <div ref={setNodeRef} className={gridStyles.cell} style={cellStyle}>
      {/* La tarjeta completa es el área activadora del arrastre (se agarra donde sea). */}
      <div
        ref={setActivatorNodeRef}
        className={cardCls}
        {...attributes}
        {...listeners}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
      >
        <span className={styles.cardGrip} aria-hidden title={t("templates.builder.dragToReorder")}>
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
            onPointerDown={(e) => e.stopPropagation()} // editar el rótulo, no arrastrar
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
    </div>
  );
}

/**
 * Vista NO interactiva de la tarjeta para el `DragOverlay` de dnd-kit: es la copia
 * que "sigue al cursor" mientras arrastras (sin fantasma gris del navegador).
 */
export function BuilderFieldOverlay({ field }: { field: EditField }) {
  return (
    <div className={`${styles.builderCardActive} ${styles.cardOverlay}`}>
      <span className={styles.cardGrip} aria-hidden>
        <GripVertical size={15} />
      </span>
      <div className={styles.cardBody}>
        <div className={styles.inlineLabel} style={{ whiteSpace: "pre-wrap" }}>
          {field.label}
        </div>
        <div className={styles.cardControl} aria-hidden>
          <FieldControl field={field} value={undefined} onChange={() => undefined} />
        </div>
      </div>
    </div>
  );
}
