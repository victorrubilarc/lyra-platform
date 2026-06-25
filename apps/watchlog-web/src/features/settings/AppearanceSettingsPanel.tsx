import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Palette, Plus } from "lucide-react";
import { Button, EmptyState, Skeleton, cx } from "@lyra/ui";
import { effectiveToken, type ThemePaletteDto } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { PaletteEditor } from "./PaletteEditor.js";
import { useAllPalettes } from "./theme-queries.js";
import styles from "./AppearanceSettingsPanel.module.css";

type Selection = { kind: "new" } | { kind: "edit"; id: string } | null;

/** Mini muestra de la paleta (fondo oscuro + acento), para la lista. */
function Swatch({ palette }: { palette: ThemePaletteDto }) {
  return (
    <span
      className={styles.swatch}
      style={{
        background: effectiveToken(palette.tokensDark, "bgBase", "dark"),
        borderColor: effectiveToken(palette.tokensDark, "accentPrimary", "dark"),
      }}
    >
      <span style={{ background: effectiveToken(palette.tokensDark, "accentPrimary", "dark") }} />
      <span style={{ background: effectiveToken(palette.tokensDark, "accentSecondary", "dark") }} />
      <span style={{ background: effectiveToken(palette.tokensLight, "bgBase", "light") }} />
    </span>
  );
}

/**
 * Pestaña "Apariencia" (EST-TEMAS): lista de paletas + builder. Construir/publicar exige
 * `theme:manage`; sin él, sólo lectura. El builder muestra la vista previa EN VIVO sobre
 * todo el workspace.
 */
export function AppearanceSettingsPanel() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const canManage = perms.can("theme:manage");

  const { data: palettes, isLoading } = useAllPalettes();
  const [selection, setSelection] = useState<Selection>(null);

  const selected =
    selection?.kind === "edit" ? (palettes?.find((p) => p.id === selection.id) ?? null) : null;
  const editing = selection !== null;

  return (
    <div className={styles.panel}>
      <div className={styles.list}>
        <div className={styles.listHead}>
          <span className={styles.listTitle}>{t("appearance.palettes")}</span>
          {canManage && (
            <Button
              variant={selection?.kind === "new" ? "primary" : "secondary"}
              leftIcon={<Plus size={15} />}
              onClick={() => setSelection({ kind: "new" })}
            >
              {t("appearance.new")}
            </Button>
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
                  <Swatch palette={p} />
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
            key={selection?.kind === "edit" ? selection.id : "new"}
            palette={selected}
            canManage={canManage}
            onSaved={(id) => setSelection({ kind: "edit", id })}
            onDeleted={() => setSelection(null)}
          />
        ) : (
          <EmptyState
            icon={<Palette size={34} />}
            title={t("appearance.pickTitle")}
            description={canManage ? t("appearance.pickDesc") : t("appearance.pickDescReadonly")}
          />
        )}
      </div>
    </div>
  );
}
