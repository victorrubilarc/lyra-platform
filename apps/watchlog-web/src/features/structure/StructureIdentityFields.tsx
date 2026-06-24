import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import { cx } from "@lyra/ui";
import type { StructureAccent, StructureIcon } from "@lyra/contracts";
import {
  ACCENT_OPTIONS,
  ICON_OPTIONS,
  STRUCTURE_ICON_COMPONENTS,
  accentOf,
  iconComponentOf,
} from "./structure-identity.js";
import styles from "./StructureIdentityFields.module.css";

export interface StructureIdentityFieldsProps {
  /** Nombre de la estructura (solo para la vista previa del badge). */
  name: string;
  /** Clave efectiva para derivar el acento/ícono automáticos cuando son `null`. */
  previewKey: string;
  color: StructureAccent | null;
  icon: StructureIcon | null;
  onColorChange: (color: StructureAccent | null) => void;
  onIconChange: (icon: StructureIcon | null) => void;
}

/**
 * Editor de IDENTIDAD VISUAL de una estructura (L3): acento de color + ícono, con
 * vista previa del badge «Estás en» tal cual aparece en el topbar y la opción
 * automática (derivada de la clave). Reutilizado por el mantenedor de estructuras
 * (`StructuresDrawer`) y por el asistente «crear área» (`StructureWizard`) — única
 * fuente de verdad de la identidad en la UI, sin duplicar paleta ni lógica.
 */
export function StructureIdentityFields({
  name,
  previewKey,
  color,
  icon,
  onColorChange,
  onIconChange,
}: StructureIdentityFieldsProps) {
  const { t } = useTranslation();
  const previewInput = { key: previewKey || "estructura", color, icon };
  const effectiveAccent = accentOf(previewInput);
  const PreviewIcon = iconComponentOf(previewInput);

  return (
    <div>
      <div className={styles.identityLabel}>{t("structure.structures.appearance")}</div>
      <p className={styles.identityHint}>{t("structure.structures.appearanceHint")}</p>

      {/* Vista previa del badge tal como se verá en el topbar. */}
      <div className={styles.identityPreview} data-accent={effectiveAccent}>
        <span className={styles.identityPreviewIcon}>
          <PreviewIcon size={15} aria-hidden="true" />
        </span>
        <span className={styles.identityPreviewText}>
          <span className={styles.identityPreviewKicker}>{t("structure.selector.youAreIn")}</span>
          <span className={styles.identityPreviewName}>{name.trim() || t("structure.structures.name")}</span>
        </span>
      </div>

      {/* Acentos: "Auto" + paleta curada. */}
      <div className={styles.swatchRow}>
        <button
          type="button"
          className={cx(styles.autoChip, color === null && styles.autoChipOn)}
          onClick={() => onColorChange(null)}
          title={t("structure.structures.appearanceAuto")}
        >
          {t("structure.structures.appearanceAuto")}
        </button>
        {ACCENT_OPTIONS.map((a) => (
          <button
            key={a}
            type="button"
            data-accent={a}
            className={cx(styles.swatch, color === a && styles.swatchOn)}
            onClick={() => onColorChange(a)}
            aria-label={a}
            aria-pressed={color === a}
            title={a}
          >
            {color === a && <Check size={13} />}
          </button>
        ))}
      </div>

      {/* Íconos: "Auto" + lista blanca Lucide. */}
      <div className={styles.iconGrid}>
        <button
          type="button"
          className={cx(styles.iconCell, styles.iconCellAuto, icon === null && styles.iconCellOn)}
          onClick={() => onIconChange(null)}
          title={t("structure.structures.appearanceAuto")}
        >
          {t("structure.structures.appearanceAuto")}
        </button>
        {ICON_OPTIONS.map((ic) => {
          const Icon = STRUCTURE_ICON_COMPONENTS[ic];
          return (
            <button
              key={ic}
              type="button"
              className={cx(styles.iconCell, icon === ic && styles.iconCellOn)}
              onClick={() => onIconChange(ic)}
              aria-label={ic}
              aria-pressed={icon === ic}
              title={ic}
            >
              <Icon size={17} aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
