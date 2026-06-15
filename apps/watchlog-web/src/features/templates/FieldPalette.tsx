import { useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { FieldType } from "@lyra/contracts";
import { FIELD_TYPE_META, type FieldTypeMeta } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Panel IZQUIERDO del diseñador (Fase 2.1.7): biblioteca de componentes con buscador
 * y categorías plegables. Cada objeto se ARRASTRA al lienzo (HTML5 drag → react-grid-
 * layout lo recibe en onDrop) o se agrega con un clic (al final de la sección activa).
 */
export function FieldPalette({ canEdit, onAdd }: { canEdit: boolean; onAdd: (type: FieldType) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [openCore, setOpenCore] = useState(true);
  const [openSpecial, setOpenSpecial] = useState(true);

  const q = query.trim().toLowerCase();
  const matches = (m: FieldTypeMeta) => t(m.labelKey).toLowerCase().includes(q);
  const core = FIELD_TYPE_META.filter((m) => m.core && matches(m));
  const special = FIELD_TYPE_META.filter((m) => !m.core && matches(m));

  const onDragStart = (e: DragEvent<HTMLDivElement>, type: FieldType) => {
    e.dataTransfer.setData("text/plain", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  const item = (m: FieldTypeMeta) => {
    const Icon = m.icon;
    // DIV (no <button>): Chrome no inicia drag HTML5 confiable sobre botones.
    return (
      <div
        key={m.type}
        role="button"
        tabIndex={canEdit ? 0 : -1}
        aria-disabled={!canEdit}
        className={`${styles.paletteItem}${canEdit ? "" : " " + styles.paletteItemDisabled}`}
        draggable={canEdit}
        onDragStart={(e) => canEdit && onDragStart(e, m.type)}
        onClick={() => canEdit && onAdd(m.type)}
        onKeyDown={(e) => {
          if (canEdit && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            onAdd(m.type);
          }
        }}
        title={t("templates.builder.paletteHint")}
      >
        <span className={styles.paletteIcon}>
          <Icon size={16} />
        </span>
        {t(m.labelKey)}
      </div>
    );
  };

  return (
    <aside className={styles.palette} aria-label={t("templates.builder.paletteTitle")}>
      <div className={styles.paletteSearch}>
        <Search size={14} />
        <input
          type="search"
          value={query}
          placeholder={t("templates.builder.designerSearch")}
          aria-label={t("templates.builder.designerSearch")}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {core.length > 0 && (
        <div className={styles.paletteGroup}>
          <button type="button" className={styles.paletteGroupHead} onClick={() => setOpenCore((v) => !v)}>
            {openCore ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t("templates.builder.fieldTypesCore")}
          </button>
          {openCore && <div className={styles.paletteItems}>{core.map(item)}</div>}
        </div>
      )}

      {special.length > 0 && (
        <div className={styles.paletteGroup}>
          <button type="button" className={styles.paletteGroupHead} onClick={() => setOpenSpecial((v) => !v)}>
            {openSpecial ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {t("templates.builder.fieldTypesSpecial")}
          </button>
          {openSpecial && <div className={styles.paletteItems}>{special.map(item)}</div>}
        </div>
      )}

      <p className={styles.paletteFoot}>{t("templates.builder.paletteHint")}</p>
    </aside>
  );
}
