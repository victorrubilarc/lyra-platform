import { useRef, useState, type CSSProperties, type DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";
import type { FieldType } from "@lyra/contracts";
import { FIELD_TYPE_META, type FieldTypeMeta } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Agregar campo de forma MINIMALISTA (Fase 2.1.7): un botón "＋ Agregar campo" abre
 * un menú compacto y BUSCABLE (estilo Notion "/"), sin paleta lateral fija ⇒ el
 * lienzo usa todo el ancho. Cada objeto se puede agregar con clic (al final de la
 * sección) o ARRASTRAR a una posición exacta del lienzo (HTML5 drop). Los ítems son
 * `div` (no `button`): Chrome no inicia drag HTML5 confiable sobre botones.
 */
export function AddFieldPopover({
  onPick,
  canEdit,
  variant = "section",
}: {
  onPick: (type: FieldType) => void;
  canEdit: boolean;
  variant?: "bar" | "section";
}) {
  const { t } = useTranslation();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<CSSProperties>({});
  const [q, setQ] = useState("");
  if (!canEdit) return null;

  const query = q.trim().toLowerCase();
  const list = FIELD_TYPE_META.filter((m) => t(m.labelKey).toLowerCase().includes(query));
  const POP_W = 280;
  const POP_H = 380;
  const toggle = () => {
    if (open) {
      close();
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.max(12, Math.min(r.left, window.innerWidth - POP_W - 12));
      const spaceBelow = window.innerHeight - r.bottom;
      // Abrir hacia ABAJO si cabe; si no, hacia ARRIBA. El alto se limita al espacio
      // disponible (queda PEGADO al botón y scrollea adentro, sin invadir otra UI).
      const openDown = spaceBelow >= POP_H || spaceBelow >= r.top;
      const maxHeight = Math.min(POP_H, (openDown ? spaceBelow : r.top) - 12);
      setPos(
        openDown
          ? { left, top: r.bottom + 6, maxHeight }
          : { left, bottom: window.innerHeight - r.top + 6, maxHeight },
      );
    }
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setQ("");
  };
  const pick = (type: FieldType) => {
    onPick(type);
    close();
  };
  const onDragStart = (e: DragEvent<HTMLDivElement>, type: FieldType) => {
    e.dataTransfer.setData("text/plain", type);
    e.dataTransfer.effectAllowed = "copy";
  };

  const item = (m: FieldTypeMeta) => {
    const Icon = m.icon;
    return (
      <div
        key={m.type}
        role="button"
        tabIndex={0}
        className={styles.paletteItem}
        draggable
        onDragStart={(e) => onDragStart(e, m.type)}
        onDragEnd={close}
        onClick={() => pick(m.type)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pick(m.type);
          }
        }}
      >
        <span className={styles.paletteIcon}>
          <Icon size={16} />
        </span>
        {t(m.labelKey)}
      </div>
    );
  };

  return (
    <div className={styles.addWrap}>
      <button
        ref={btnRef}
        type="button"
        className={variant === "bar" ? styles.addSectionBtn : styles.addFieldBtn}
        onClick={toggle}
        aria-expanded={open}
      >
        <Plus size={15} /> {t("templates.builder.addField")}
      </button>
      {open && (
        <>
          <div className={styles.addBackdrop} onClick={close} aria-hidden />
          <div className={styles.addPopover} style={pos} role="dialog" aria-label={t("templates.builder.addField")}>
            <div className={styles.paletteSearch}>
              <Search size={14} />
              <input
                autoFocus
                type="search"
                value={q}
                placeholder={t("templates.builder.designerSearch")}
                aria-label={t("templates.builder.designerSearch")}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className={styles.addList}>
              {list.length > 0 ? list.map(item) : <div className={styles.addEmpty}>—</div>}
            </div>
            <p className={styles.paletteFoot}>{t("templates.builder.paletteHint")}</p>
          </div>
        </>
      )}
    </div>
  );
}
