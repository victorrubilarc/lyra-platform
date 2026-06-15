import { useTranslation } from "react-i18next";
import { Copy, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button, Checkbox, Input } from "@lyra/ui";
import { GRID_COLUMNS, isPresentationalType } from "@lyra/contracts";
import { WIDTH_PRESETS, fieldDisplayMeta, type EditField } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Panel DERECHO del diseñador (Fase 2.1.7): propiedades del campo seleccionado.
 * Lo común se edita aquí (rótulo, obligatorio, ancho, alto); lo avanzado (umbral,
 * opciones, condicional, fórmula, permisos) abre el Drawer existente. Los cambios
 * se reflejan de inmediato en el lienzo (estado compartido del builder).
 */
export function FieldPropertiesPanel({
  field,
  canEdit,
  onClose,
  onLabel,
  onRequired,
  onWidth,
  onHeight,
  onAdvanced,
  onDuplicate,
  onDelete,
}: {
  field: EditField | null;
  canEdit: boolean;
  onClose: () => void;
  onLabel: (label: string) => void;
  onRequired: (required: boolean) => void;
  onWidth: (w: number) => void;
  onHeight: (h: number) => void;
  onAdvanced: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  if (!field) {
    return (
      <aside className={styles.props} aria-label={t("templates.builder.fieldProperties")}>
        <div className={styles.propsEmpty}>{t("templates.builder.selectFieldToEdit")}</div>
      </aside>
    );
  }

  const meta = fieldDisplayMeta(field);
  const Icon = meta.icon;

  return (
    <aside className={styles.props} aria-label={t("templates.builder.fieldProperties")}>
      <div className={styles.propsHead}>
        <span className={styles.propsType}>
          <Icon size={15} /> {t(meta.labelKey)}
        </span>
        <button type="button" className={styles.propsClose} onClick={onClose} aria-label={t("common.close")}>
          <X size={15} />
        </button>
      </div>

      <label className={styles.propRow}>
        <span className={styles.propLabel}>{t("templates.builder.fieldLabel")}</span>
        <Input value={field.label} disabled={!canEdit} onChange={(e) => onLabel(e.target.value)} />
      </label>

      {!isPresentationalType(field.type) && (
        <label className={styles.propCheck}>
          <Checkbox checked={field.required} disabled={!canEdit} onChange={(v) => onRequired(v)} />
          <span>{t("templates.builder.required")}</span>
        </label>
      )}

      <div className={styles.propRow}>
        <span className={styles.propLabel}>{t("templates.builder.propWidth")}</span>
        <div className={styles.propPresets}>
          {WIDTH_PRESETS.map((p) => (
            <button
              key={p.span}
              type="button"
              className={field.colSpan === p.span ? styles.propPresetOn : styles.propPreset}
              disabled={!canEdit}
              onClick={() => onWidth(p.span)}
              title={t(p.labelKey)}
            >
              {p.glyph}
            </button>
          ))}
        </div>
        <input
          type="range"
          min={1}
          max={GRID_COLUMNS}
          value={field.colSpan}
          disabled={!canEdit}
          aria-label={t("templates.builder.propWidth")}
          onChange={(e) => onWidth(Number(e.target.value))}
        />
        <span className={styles.propReadout}>
          {field.colSpan} / {GRID_COLUMNS}
        </span>
      </div>

      <div className={styles.propRow}>
        <span className={styles.propLabel}>{t("templates.builder.propHeight")}</span>
        <input
          type="range"
          min={1}
          max={6}
          value={field.gridH}
          disabled={!canEdit}
          aria-label={t("templates.builder.propHeight")}
          onChange={(e) => onHeight(Number(e.target.value))}
        />
        <span className={styles.propReadout}>{field.gridH}</span>
      </div>

      <div className={styles.propPosition}>
        {t("templates.builder.propPosition")}: X {field.gridX} · Y {field.gridY}
      </div>

      {canEdit && (
        <div className={styles.propActions}>
          <Button variant="secondary" onClick={onAdvanced}>
            <SlidersHorizontal size={14} /> {t("templates.builder.advancedOptions")}
          </Button>
          <Button variant="secondary" onClick={onDuplicate}>
            <Copy size={14} /> {t("templates.builder.duplicateField")}
          </Button>
          <Button variant="danger" onClick={onDelete}>
            <Trash2 size={14} /> {t("common.delete")}
          </Button>
        </div>
      )}
    </aside>
  );
}
