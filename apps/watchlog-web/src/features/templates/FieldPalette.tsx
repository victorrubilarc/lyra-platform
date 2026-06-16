import { useState, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Info, Search } from "lucide-react";
import { FIELD_PALETTE, PALETTE_CATEGORIES, type FieldPreset } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Paleta de objetos DOCKED (Ola 2 · #4): panel SIEMPRE visible a la izquierda, bajo el
 * riel "Diseño", con buscador y agrupación por categoría. Reemplaza al popover de la
 * barra: clic = agregar al final (y el lienzo hace scroll hasta el campo creado);
 * arrastrar = soltar en una posición exacta (HTML5 drop, igual que antes). El botón ⓘ
 * abre el modal "Ver más" con la ficha del objeto. Transporta el ID DE PRESET (no el
 * tipo): un mismo tipo tiene varios presets (RUT/Correo son TEXT; Radio/Segmentos SELECT).
 */
export function FieldPalette({
  canEdit,
  onPick,
  onShowInfo,
}: {
  canEdit: boolean;
  onPick: (presetId: string) => void;
  onShowInfo: (presetId: string) => void;
}) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  if (!canEdit) return null;

  const query = q.trim().toLowerCase();
  const list = FIELD_PALETTE.filter((m) => t(m.labelKey).toLowerCase().includes(query));
  const onDragStart = (e: DragEvent<HTMLDivElement>, presetId: string) => {
    e.dataTransfer.setData("text/plain", presetId);
    e.dataTransfer.effectAllowed = "copy";
  };

  const item = (m: FieldPreset) => {
    const Icon = m.icon;
    return (
      <div
        key={m.id}
        role="button"
        tabIndex={0}
        className={styles.paletteItem}
        draggable
        onDragStart={(e) => onDragStart(e, m.id)}
        onClick={() => onPick(m.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onPick(m.id);
          }
        }}
        title={t("templates.builder.paletteAddHint")}
      >
        <span className={styles.paletteIcon}>
          <Icon size={16} />
        </span>
        <span className={styles.paletteLabel}>{t(m.labelKey)}</span>
        <button
          type="button"
          className={styles.paletteInfo}
          onClick={(e) => {
            e.stopPropagation();
            onShowInfo(m.id);
          }}
          aria-label={t("templates.builder.fieldInfoMore")}
          title={t("templates.builder.fieldInfoMore")}
        >
          <Info size={14} />
        </button>
      </div>
    );
  };

  return (
    <aside className={styles.palette} aria-label={t("templates.builder.addField")}>
      <div className={styles.paletteHead}>{t("templates.builder.addField")}</div>
      <div className={styles.paletteSearch}>
        <Search size={14} />
        <input
          type="search"
          value={q}
          placeholder={t("templates.builder.designerSearch")}
          aria-label={t("templates.builder.designerSearch")}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className={styles.paletteList}>
        {list.length > 0 ? (
          PALETTE_CATEGORIES.map((cat) => {
            const items = list.filter((m) => m.category === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className={styles.paletteGroup}>
                <div className={styles.paletteGroupLabel}>{t(`templates.builder.paletteCat.${cat}`)}</div>
                {items.map(item)}
              </div>
            );
          })
        ) : (
          <div className={styles.addEmpty}>—</div>
        )}
      </div>
      <p className={styles.paletteFoot}>{t("templates.builder.paletteHint")}</p>
    </aside>
  );
}
