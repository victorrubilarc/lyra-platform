import { useTranslation } from "react-i18next";
import { ArrowUp, ArrowDown, Asterisk, Columns3, Copy, SlidersHorizontal, Trash2 } from "lucide-react";
import { Menu, MenuItem, MenuLabel } from "@lyra/ui";
import { WIDTH_PRESETS } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Barra flotante contextual del campo seleccionado en el lienzo (Fase 2.1.4,
 * patrón Canva/Notion/Google Forms): la configuración común se hace SOBRE el
 * lienzo, no en un panel lejano. Ancho (presets + el ajuste fino es el handle de
 * la card), obligatorio, duplicar, eliminar, y "Más opciones" (abre el Drawer con
 * lo avanzado: umbral, opciones, condicional, fórmula, roles).
 */
export function FieldToolbar({
  colSpan,
  required,
  computed,
  canEdit,
  onWidth,
  onToggleRequired,
  onDuplicate,
  onDelete,
  onMoreOptions,
  onMoveUp,
  onMoveDown,
}: {
  colSpan: number;
  required: boolean;
  computed: boolean;
  canEdit: boolean;
  onWidth: (span: number) => void;
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
      {/* Ancho: presets en un popover (el ajuste fino 1..12 es el handle del borde). */}
      <Menu
        ariaLabel={t("templates.builder.layoutWidth")}
        align="end"
        minWidth={170}
        trigger={
          <button type="button" className={styles.tbBtn} title={t("templates.builder.layoutWidth")}>
            <Columns3 size={14} /> <span className={styles.tbWidth}>{colSpan}/12</span>
          </button>
        }
      >
        <MenuLabel>{t("templates.builder.layoutWidth")}</MenuLabel>
        {WIDTH_PRESETS.map((p) => (
          <MenuItem key={p.span} icon={<span className={styles.tbGlyph}>{p.glyph}</span>} onSelect={() => onWidth(p.span)}>
            {t(p.labelKey)}
          </MenuItem>
        ))}
      </Menu>

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
