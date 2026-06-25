import { useTranslation } from "react-i18next";
import { Modal } from "@lyra/ui";
import { THEME_PRESETS, type ThemePreset } from "@lyra/contracts";
import { PaletteSwatch } from "./PaletteSwatch.js";
import styles from "./AppearanceSettingsPanel.module.css";

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  /** Plantilla elegida: el padre la clona en una paleta NUEVA (borrador). */
  onPick: (preset: ThemePreset) => void;
}

/**
 * Selector de PLANTILLAS DE INICIO (EST-TEMAS Fase 2A). Muestra el catálogo curado de
 * `@lyra/contracts` con una miniatura por plantilla; al elegir una, el padre crea una
 * paleta nueva (borrador) con esos tokens, que el admin ajusta y publica con el flujo
 * existente. Las plantillas no son paletas: son solo el punto de arranque.
 */
export function TemplatePicker({ open, onClose, onPick }: TemplatePickerProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={t("appearance.templateTitle")} size="lg">
      <p className={styles.templateDesc}>{t("appearance.templateDesc")}</p>
      <ul className={styles.templateGrid}>
        {THEME_PRESETS.map((preset) => (
          <li key={preset.id}>
            <button
              type="button"
              className={styles.templateCard}
              onClick={() => onPick(preset)}
            >
              <PaletteSwatch tokensDark={preset.tokensDark} tokensLight={preset.tokensLight} />
              <span className={styles.templateMeta}>
                <span className={styles.templateName}>{preset.name}</span>
                <span className={styles.templateCardDesc}>{preset.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
