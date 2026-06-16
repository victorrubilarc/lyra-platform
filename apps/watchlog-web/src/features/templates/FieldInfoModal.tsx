import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Modal } from "@lyra/ui";
import { Plus } from "lucide-react";
import { fieldPresetById } from "./builder-model.js";
import { FieldControl } from "./FieldControl.js";
import { FIELD_INFO } from "./field-info.js";
import styles from "./TemplateBuilder.module.css";

/**
 * Modal "Ver más" de un elemento de la paleta (Ola 2 · #5): muestra una DEMO EN VIVO
 * del elemento (el mismo `FieldControl` del llenado, interactivo), su descripción, el
 * caso de uso y un ejemplo (contenido de `field-info.ts`, resumen del FORM_GUIDE), y
 * ofrece **Agregar al formulario** o **Cerrar**. `presetId = null` ⇒ no se muestra.
 */
export function FieldInfoModal({
  presetId,
  canEdit,
  onAdd,
  onClose,
}: {
  presetId: string | null;
  canEdit: boolean;
  onAdd: (presetId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  // Valor de la DEMO (interactiva); se reinicia al cambiar de elemento.
  const [demoValue, setDemoValue] = useState<unknown>(undefined);
  useEffect(() => setDemoValue(undefined), [presetId]);

  const preset = presetId ? fieldPresetById(presetId) : undefined;
  if (!presetId || !preset) return null;
  const info = FIELD_INFO[presetId];
  const Icon = preset.icon;
  const label = t(preset.labelKey);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={
        <span className={styles.infoModalTitle}>
          <Icon size={18} /> {label}
        </span>
      }
      footer={
        <div className={styles.infoModalFooter}>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
          {canEdit && (
            <Button
              variant="primary"
              onClick={() => {
                onAdd(presetId);
                onClose();
              }}
            >
              <Plus size={15} /> {t("templates.builder.fieldInfoAdd")}
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.infoModalBody}>
        <span className={styles.infoModalCat}>{t(`templates.builder.paletteCat.${preset.category}`)}</span>
        {info?.desc && <p className={styles.infoModalDesc}>{info.desc}</p>}

        {/* Demo EN VIVO: el mismo render del llenado (interactivo, sin persistir). */}
        <div className={styles.infoModalDemo}>
          <span className={styles.infoModalSectionLabel}>{t("templates.builder.fieldInfoDemo")}</span>
          <div className={styles.infoModalDemoStage}>
            <FieldControl
              field={{ key: `demo_${preset.id}`, type: preset.type, label, config: preset.config() }}
              value={demoValue}
              onChange={setDemoValue}
            />
          </div>
        </div>

        {info?.useCase && (
          <div className={styles.infoModalSection}>
            <span className={styles.infoModalSectionLabel}>{t("templates.builder.fieldInfoUseCase")}</span>
            <p className={styles.infoModalText}>{info.useCase}</p>
          </div>
        )}

        {info?.example && (
          <div className={styles.infoModalExample}>
            <span className={styles.infoModalSectionLabel}>{t("templates.builder.fieldInfoExample")}</span>
            <span>{info.example}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
