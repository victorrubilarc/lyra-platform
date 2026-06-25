import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, Copy, RotateCcw, Star, Trash2 } from "lucide-react";
import { Button, Input, Textarea, Toggle, cx, useToast } from "@lyra/ui";
import {
  THEME_TOKEN_DEFS,
  THEME_VARIANTS,
  baseTokenValue,
  effectiveToken,
  evaluateContrast,
  parseColor,
  type PaletteTokens,
  type ThemePaletteDto,
  type ThemeTokenKey,
  type ThemeTokenRole,
  type ThemeVariant,
} from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { usePaletteStore } from "../../shell/palette-store.js";
import {
  useClearDefaultPalette,
  useCreatePalette,
  useDeletePalette,
  usePublishPalette,
  useSetDefaultPalette,
  useUpdatePalette,
} from "./theme-queries.js";
import styles from "./AppearanceSettingsPanel.module.css";

const GROUP_ORDER: ThemeTokenRole[] = ["surface", "text", "border", "accent", "functional"];

/** Convierte cualquier color soportado a `#rrggbb` para el input `type=color` (sin alfa). */
function toPickerHex(value: string): string {
  const c = parseColor(value);
  if (!c) return "#000000";
  const h = (n: number): string => n.toString(16).padStart(2, "0");
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** Variables CSS efectivas de una variante, para el recuadro de vista previa contenida. */
function previewVars(tokens: PaletteTokens, variant: ThemeVariant): CSSProperties {
  const style: Record<string, string> = {};
  for (const def of THEME_TOKEN_DEFS) style[def.cssVar] = effectiveToken(tokens, def.key, variant);
  const primary = effectiveToken(tokens, "accentPrimary", variant);
  const secondary = effectiveToken(tokens, "accentSecondary", variant);
  style["--gradient-brand"] = `linear-gradient(135deg, ${primary}, ${secondary})`;
  return style as CSSProperties;
}

interface Draft {
  name: string;
  description: string;
  tokensDark: PaletteTokens;
  tokensLight: PaletteTokens;
}

/**
 * Borrador inicial para crear una paleta NUEVA a partir de tokens dados (clonar una
 * plantilla de inicio o duplicar una paleta existente). El admin lo ajusta y pulsa Crear.
 */
export interface PaletteSeed {
  name: string;
  description?: string;
  tokensDark: PaletteTokens;
  tokensLight: PaletteTokens;
}

function draftFrom(palette: ThemePaletteDto | null, seed?: PaletteSeed): Draft {
  if (palette) {
    return {
      name: palette.name,
      description: palette.description ?? "",
      tokensDark: { ...palette.tokensDark },
      tokensLight: { ...palette.tokensLight },
    };
  }
  if (seed) {
    return {
      name: seed.name,
      description: seed.description ?? "",
      tokensDark: { ...seed.tokensDark },
      tokensLight: { ...seed.tokensLight },
    };
  }
  return { name: "", description: "", tokensDark: {}, tokensLight: {} };
}

interface PaletteEditorProps {
  /** Paleta existente a editar, o `null` para crear una nueva. */
  palette: ThemePaletteDto | null;
  /** Tokens de arranque para una paleta nueva (clonar plantilla/duplicar). Solo si `palette` es null. */
  seed?: PaletteSeed;
  canManage: boolean;
  onSaved: (id: string) => void;
  onDeleted: () => void;
  /** Clonar la paleta GUARDADA en una nueva (borrador "… (copia)"), editable e independiente. */
  onDuplicate: (palette: ThemePaletteDto) => void;
}

/**
 * Builder de una paleta (EST-TEMAS): nombre + identidad, edición de tokens por variante
 * clara/oscura, VISTA PREVIA en vivo (todo el workspace + un recuadro contenido para ver
 * la otra variante), aviso de CONTRASTE WCAG AA, y acciones de publicación/por-defecto.
 */
export function PaletteEditor({
  palette,
  seed,
  canManage,
  onSaved,
  onDeleted,
  onDuplicate,
}: PaletteEditorProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const setPreview = usePaletteStore((s) => s.setPreview);
  const clearPreview = usePaletteStore((s) => s.clearPreview);

  const create = useCreatePalette();
  const update = useUpdatePalette();
  const publish = usePublishPalette();
  const setDefault = useSetDefaultPalette();
  const clearDefault = useClearDefaultPalette();
  const remove = useDeletePalette();

  const [draft, setDraft] = useState<Draft>(() => draftFrom(palette, seed));
  const [variant, setVariant] = useState<ThemeVariant>("dark");

  // Reinicia el borrador al cambiar de paleta/seed seleccionado.
  useEffect(() => {
    setDraft(draftFrom(palette, seed));
  }, [palette, seed]);

  // Vista previa EN VIVO: el workspace entero adopta el borrador mientras se edita.
  useEffect(() => {
    setPreview({ tokensDark: draft.tokensDark, tokensLight: draft.tokensLight });
    return () => clearPreview();
  }, [draft.tokensDark, draft.tokensLight, setPreview, clearPreview]);

  const tokens = variant === "dark" ? draft.tokensDark : draft.tokensLight;

  const setToken = (key: ThemeTokenKey, value: string | undefined): void => {
    setDraft((d) => {
      const next = { ...(variant === "dark" ? d.tokensDark : d.tokensLight) };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return variant === "dark" ? { ...d, tokensDark: next } : { ...d, tokensLight: next };
    });
  };

  const contrast = useMemo(() => evaluateContrast(tokens, variant), [tokens, variant]);
  const failing = contrast.filter((c) => !c.passes);

  const isNew = palette === null;
  const nameValid = draft.name.trim().length >= 2;
  const busy = create.isPending || update.isPending;

  const handleSave = async (): Promise<void> => {
    try {
      if (isNew) {
        const created = await create.mutateAsync({
          name: draft.name.trim(),
          description: draft.description.trim() || undefined,
          tokensDark: draft.tokensDark,
          tokensLight: draft.tokensLight,
        });
        toast.success(t("appearance.created"));
        onSaved(created.id);
      } else {
        await update.mutateAsync({
          id: palette.id,
          dto: {
            name: draft.name.trim(),
            description: draft.description.trim() || null,
            tokensDark: draft.tokensDark,
            tokensLight: draft.tokensLight,
          },
        });
        toast.success(t("appearance.saved"));
        onSaved(palette.id);
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const run = async (fn: () => Promise<unknown>, okKey: string): Promise<void> => {
    try {
      await fn();
      toast.success(t(okKey));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  return (
    <div className={styles.editor}>
      {/* Identidad */}
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="palette-name">
          {t("appearance.name")}
        </label>
        <Input
          id="palette-name"
          value={draft.name}
          maxLength={60}
          disabled={!canManage}
          placeholder={t("appearance.namePlaceholder")}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </div>
      <div className={styles.field}>
        <label className={styles.fieldLabel} htmlFor="palette-desc">
          {t("appearance.description")}
        </label>
        <Textarea
          id="palette-desc"
          rows={2}
          value={draft.description}
          maxLength={280}
          disabled={!canManage}
          placeholder={t("appearance.descriptionPlaceholder")}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
        />
      </div>

      {/* Selector de variante */}
      <div className={styles.variantTabs} role="tablist" aria-label={t("appearance.variantLabel")}>
        {THEME_VARIANTS.map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={variant === v}
            className={cx(styles.variantTab, variant === v && styles.variantTabActive)}
            onClick={() => setVariant(v)}
          >
            {t(`appearance.variant.${v}`)}
          </button>
        ))}
      </div>

      <div className={styles.editorGrid}>
        {/* Editores de token agrupados */}
        <div className={styles.tokenGroups}>
          {GROUP_ORDER.map((group) => (
            <fieldset key={group} className={styles.tokenGroup}>
              <legend className={styles.tokenGroupLegend}>{t(`appearance.group.${group}`)}</legend>
              {THEME_TOKEN_DEFS.filter((d) => d.group === group).map((def) => {
                const overridden = tokens[def.key] !== undefined;
                const value = effectiveToken(tokens, def.key as ThemeTokenKey, variant);
                return (
                  <div key={def.key} className={styles.tokenRow}>
                    <span className={styles.tokenLabel}>{def.label}</span>
                    <div className={styles.tokenControls}>
                      <input
                        type="color"
                        className={styles.colorInput}
                        value={toPickerHex(value)}
                        disabled={!canManage}
                        aria-label={def.label}
                        onChange={(e) => setToken(def.key as ThemeTokenKey, e.target.value)}
                      />
                      <input
                        type="text"
                        className={cx(styles.hexInput, overridden && styles.hexInputOverridden)}
                        value={value}
                        disabled={!canManage}
                        spellCheck={false}
                        onChange={(e) => setToken(def.key as ThemeTokenKey, e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.resetBtn}
                        disabled={!canManage || !overridden}
                        title={t("appearance.resetToken")}
                        aria-label={t("appearance.resetToken")}
                        onClick={() => setToken(def.key as ThemeTokenKey, undefined)}
                      >
                        <RotateCcw size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>

        {/* Vista previa contenida + contraste */}
        <div className={styles.previewColumn}>
          <div className={styles.previewCard} style={previewVars(tokens, variant)}>
            <div className={styles.previewInner}>
              <div className={styles.previewBrandRow}>
                <span className={styles.previewLogo} />
                <strong className={styles.previewTitle}>{draft.name || t("appearance.previewTitle")}</strong>
              </div>
              <p className={styles.previewBody}>{t("appearance.previewBody")}</p>
              <p className={styles.previewMuted}>{t("appearance.previewMuted")}</p>
              <div className={styles.previewBtns}>
                <span className={styles.previewBtnPrimary}>{t("appearance.previewPrimary")}</span>
                <span className={styles.previewBtnGhost}>{t("appearance.previewGhost")}</span>
              </div>
              <div className={styles.previewChips}>
                <span className={styles.previewChip} data-tone="success">
                  {t("appearance.previewSuccess")}
                </span>
                <span className={styles.previewChip} data-tone="warning">
                  {t("appearance.previewWarning")}
                </span>
                <span className={styles.previewChip} data-tone="error">
                  {t("appearance.previewError")}
                </span>
              </div>
            </div>
          </div>

          {/* Contraste WCAG */}
          <div className={styles.contrastBox}>
            <span className={styles.contrastTitle}>{t("appearance.contrast")}</span>
            {failing.length === 0 ? (
              <p className={styles.contrastOk}>
                <Check size={14} /> {t("appearance.contrastOk")}
              </p>
            ) : (
              <ul className={styles.contrastList}>
                {failing.map((c) => (
                  <li key={`${c.fgKey}-${c.bgKey}`} className={styles.contrastWarn}>
                    <AlertTriangle size={13} />
                    <span>
                      {c.label} — {c.verdict.ratio?.toFixed(2) ?? "—"}:1{" "}
                      <span className={styles.contrastNeed}>
                        ({t(c.kind === "text" ? "appearance.contrastNeedText" : "appearance.contrastNeedUi")})
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Acciones */}
      {canManage && (
        <div className={styles.actions}>
          <Button variant="primary" disabled={!nameValid || busy} onClick={() => void handleSave()}>
            {isNew ? t("appearance.create") : t("appearance.save")}
          </Button>

          {!isNew && (
            <>
              <div className={styles.actionToggle}>
                <span>{t("appearance.published")}</span>
                <Toggle
                  checked={palette.isPublished}
                  disabled={publish.isPending}
                  onChange={(v) => void run(() => publish.mutateAsync({ id: palette.id, isPublished: v }), v ? "appearance.publishedOn" : "appearance.publishedOff")}
                />
              </div>

              <Button
                variant="secondary"
                leftIcon={<Star size={15} className={palette.isDefault ? styles.starOn : undefined} />}
                disabled={!palette.isPublished || setDefault.isPending || clearDefault.isPending}
                title={!palette.isPublished ? t("appearance.defaultNeedsPublish") : undefined}
                onClick={() =>
                  void run(
                    () => (palette.isDefault ? clearDefault.mutateAsync() : setDefault.mutateAsync(palette.id)),
                    "appearance.defaultChanged",
                  )
                }
              >
                {palette.isDefault ? t("appearance.isDefault") : t("appearance.makeDefault")}
              </Button>

              <Button
                variant="secondary"
                leftIcon={<Copy size={15} />}
                onClick={() => onDuplicate(palette)}
              >
                {t("appearance.duplicate")}
              </Button>

              <Button
                variant="danger"
                className={styles.deleteBtn}
                leftIcon={<Trash2 size={15} />}
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(t("appearance.deleteConfirm", { name: palette.name }))) {
                    void run(async () => {
                      await remove.mutateAsync(palette.id);
                      clearPreview();
                      onDeleted();
                    }, "appearance.deleted");
                  }
                }}
              >
                {t("appearance.delete")}
              </Button>
            </>
          )}
        </div>
      )}

      {!canManage && <p className={styles.readonly}>{t("appearance.readOnly")}</p>}

      {/* Hint del valor base para el token actual (ayuda a "volver a la marca"). */}
      <p className={styles.baseHint}>
        {t("appearance.baseHint", {
          variant: t(`appearance.variant.${variant}`).toLowerCase(),
          value: baseTokenValue("bgBase", variant),
        })}
      </p>
    </div>
  );
}
