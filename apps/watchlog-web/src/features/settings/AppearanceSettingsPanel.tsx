import { useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutTemplate, Palette, Plus } from "lucide-react";
import { Button, EmptyState, Skeleton, cx } from "@lyra/ui";
import type { ThemePaletteDto, ThemePreset } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { PaletteEditor, type PaletteSeed } from "./PaletteEditor.js";
import { PaletteSwatch } from "./PaletteSwatch.js";
import { TemplatePicker } from "./TemplatePicker.js";
import { useAllPalettes } from "./theme-queries.js";
import styles from "./AppearanceSettingsPanel.module.css";

// `nonce` fuerza el remontaje del editor al iniciar otro borrador nuevo (plantilla/copia)
// aunque `palette` siga siendo null.
type Selection =
  | { kind: "new"; seed?: PaletteSeed; nonce: number }
  | { kind: "edit"; id: string }
  | null;

/**
 * Pestaña "Apariencia" (EST-TEMAS): lista de paletas + builder. Construir/publicar exige
 * `theme:manage`; sin él, sólo lectura. El builder muestra la vista previa EN VIVO sobre
 * todo el workspace. Fase 2A: empezar desde una PLANTILLA curada o DUPLICAR una paleta.
 */
export function AppearanceSettingsPanel() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canManage = perms.can("theme:manage");

  const { data: palettes, isLoading } = useAllPalettes();
  const [selection, setSelection] = useState<Selection>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [draftNonce, setDraftNonce] = useState(0);

  const startDraft = (seed?: PaletteSeed): void => {
    const nonce = draftNonce + 1;
    setDraftNonce(nonce);
    setSelection({ kind: "new", seed, nonce });
  };

  // Clonar una PLANTILLA de inicio en una paleta nueva (borrador), con su nombre prefijado.
  const startFromPreset = (preset: ThemePreset): void => {
    setPickerOpen(false);
    startDraft({
      name: preset.name,
      description: preset.description,
      tokensDark: preset.tokensDark,
      tokensLight: preset.tokensLight,
    });
  };

  // DUPLICAR una paleta existente en una nueva "… (copia)", editable e independiente.
  const startDuplicate = (palette: ThemePaletteDto): void => {
    startDraft({
      name: t("appearance.duplicateName", { name: palette.name }),
      description: palette.description ?? undefined,
      tokensDark: palette.tokensDark,
      tokensLight: palette.tokensLight,
    });
  };

  const selected =
    selection?.kind === "edit" ? (palettes?.find((p) => p.id === selection.id) ?? null) : null;
  const seed = selection?.kind === "new" ? selection.seed : undefined;
  const editing = selection !== null;

  return (
    <div className={styles.panel}>
      <div className={styles.list}>
        <div className={styles.listHead}>
          <span className={styles.listTitle}>{t("appearance.palettes")}</span>
          {canManage && (
            <div className={styles.listActions}>
              <Button
                variant="secondary"
                leftIcon={<LayoutTemplate size={15} />}
                onClick={() => setPickerOpen(true)}
              >
                {t("appearance.fromTemplate")}
              </Button>
              <Button
                variant={selection?.kind === "new" ? "primary" : "secondary"}
                leftIcon={<Plus size={15} />}
                onClick={() => startDraft()}
              >
                {t("appearance.new")}
              </Button>
            </div>
          )}
        </div>

        {isLoading ? (
          <Skeleton height={160} width="100%" />
        ) : !palettes || palettes.length === 0 ? (
          <p className={styles.empty}>{t("appearance.noPalettes")}</p>
        ) : (
          <ul className={styles.paletteList}>
            {palettes.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className={cx(
                    styles.paletteItem,
                    selection?.kind === "edit" && selection.id === p.id && styles.paletteItemActive,
                  )}
                  onClick={() => setSelection({ kind: "edit", id: p.id })}
                >
                  <PaletteSwatch tokensDark={p.tokensDark} tokensLight={p.tokensLight} />
                  <span className={styles.paletteMeta}>
                    <span className={styles.paletteName}>{p.name}</span>
                    <span className={styles.paletteBadges}>
                      {p.isDefault && <span className={styles.badgeDefault}>{t("appearance.badgeDefault")}</span>}
                      <span className={p.isPublished ? styles.badgePublished : styles.badgeDraft}>
                        {t(p.isPublished ? "appearance.badgePublished" : "appearance.badgeDraft")}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className={styles.editorPane}>
        {editing ? (
          <PaletteEditor
            key={selection?.kind === "edit" ? selection.id : `new-${selection.nonce}`}
            palette={selected}
            seed={seed}
            canManage={canManage}
            onSaved={(id) => setSelection({ kind: "edit", id })}
            onDeleted={() => setSelection(null)}
            onDuplicate={startDuplicate}
          />
        ) : (
          <EmptyState
            icon={<Palette size={34} />}
            title={t("appearance.pickTitle")}
            description={canManage ? t("appearance.pickDesc") : t("appearance.pickDescReadonly")}
          />
        )}
      </div>

      <TemplatePicker open={pickerOpen} onClose={() => setPickerOpen(false)} onPick={startFromPreset} />
    </div>
  );
}
