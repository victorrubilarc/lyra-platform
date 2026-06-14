import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, Asterisk, Copy, SlidersHorizontal, Trash2 } from "lucide-react";
import styles from "./TemplateBuilder.module.css";

/**
 * Barra flotante contextual del campo seleccionado en el lienzo (Fase 2.1.4→2.1.5,
 * patrón Canva/Notion/Google Forms): la configuración común se hace SOBRE el lienzo.
 * El ANCHO ya NO vive aquí (el usuario no piensa en "columnas"): se define
 * arrastrando el campo al lado de otro / a su propia línea, y el ajuste fino es el
 * divisor del borde. Quedan: obligatorio, mover, duplicar, eliminar, "Más opciones".
 */
export function FieldToolbar({
  required,
  computed,
  canEdit,
  onToggleRequired,
  onDuplicate,
  onDelete,
  onMoreOptions,
  onMoveUp,
  onMoveDown,
}: {
  required: boolean;
  computed: boolean;
  canEdit: boolean;
  onToggleRequired: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoreOptions: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { t } = useTranslation();
  if (!canEdit) return null;
  return (
    <div className={styles.fieldToolbar} onClick={(e) => e.stopPropagation()}>
      {!computed && (
        <button
          type="button"
          className={required ? styles.tbBtnOn : styles.tbBtn}
          onClick={onToggleRequired}
          title={t("templates.builder.required")}
          aria-pressed={required}
        >
          <Asterisk size={14} />
        </button>
      )}
      <button type="button" className={styles.tbBtn} onClick={onMoveUp} title={t("common.moveUp")}>
        <ArrowUp size={14} />
      </button>
      <button type="button" className={styles.tbBtn} onClick={onMoveDown} title={t("common.moveDown")}>
        <ArrowDown size={14} />
      </button>
      <button type="button" className={styles.tbBtn} onClick={onDuplicate} title={t("templates.builder.duplicateField")}>
        <Copy size={14} />
      </button>
      <button type="button" className={styles.tbBtn} onClick={onMoreOptions} title={t("templates.builder.moreOptions")}>
        <SlidersHorizontal size={14} />
      </button>
      <button type="button" className={styles.tbBtnDanger} onClick={onDelete} title={t("common.delete")}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
