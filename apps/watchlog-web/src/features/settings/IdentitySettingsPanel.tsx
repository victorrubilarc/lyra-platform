import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { ImageUp, Trash2 } from "lucide-react";
import { Button, Input, Select, Skeleton, useToast } from "@lyra/ui";
import {
  BRANDING_LOGO_MAX_BYTES,
  type SetupLocale,
  type SetupThemeMode,
  type UpdateSystemSettingsRequest,
} from "@lyra/contracts";
import { BRANDING_KEYS, licenseeInitials, useBranding } from "../../branding.js";
import { ApiError, apiUploadVoid, apiVoid } from "../../lib/api-client.js";
import { useSystemSettings, useUpdateSystemSettings } from "./settings-queries.js";
import styles from "./SettingsPage.module.css";

const LOCALE_OPTIONS: Array<{ value: SetupLocale; label: string }> = [
  { value: "es-CL", label: "Español (Chile)" },
  { value: "en", label: "English" },
];

const THEME_MODE_VALUES: SetupThemeMode[] = ["dark", "light", "auto"];

/** Zonas horarias IANA del runtime (fallback mínimo si el navegador no soporta). */
function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["America/Santiago", "UTC"];
  }
}

/**
 * Identidad de la instalación (OOBE S3): los campos que el wizard de primer
 * arranque captura, editables POST-setup — nombre visible, logo y los defaults
 * de instalación (tema/zona horaria/idioma). Gate: `settings:manage` (misma
 * dueña que el resto de la configuración del sistema). El logo sube por
 * `PUT /api/branding/logo` (magic bytes + ≤512KB en el backend) y se aplica EN
 * VIVO a Topbar/título/login vía la query pública de branding.
 */
export function IdentitySettingsPanel({ canManage }: { canManage: boolean }) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { data, isLoading } = useSystemSettings();
  const update = useUpdateSystemSettings();
  const branding = useBranding();
  const fileRef = useRef<HTMLInputElement>(null);
  // null = sin edición local (muestra lo persistido).
  const [draftName, setDraftName] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);

  if (isLoading || !data) return <Skeleton height={220} width="100%" />;

  const currentName = draftName ?? data.companyDisplayName ?? "";
  const nameDirty = draftName !== null && draftName.trim() !== (data.companyDisplayName ?? "");

  const patch = async (dto: UpdateSystemSettingsRequest) => {
    try {
      await update.mutateAsync(dto);
      toast.success(t("settings.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  const saveName = async () => {
    const trimmed = currentName.trim();
    await patch({ companyDisplayName: trimmed === "" ? null : trimmed });
    setDraftName(null);
  };

  const refreshBranding = () => qc.invalidateQueries({ queryKey: BRANDING_KEYS.branding });

  const uploadLogo = async (file: File) => {
    if (file.size > BRANDING_LOGO_MAX_BYTES) {
      toast.error(t("settings.identity.logoTooLarge"));
      return;
    }
    const form = new FormData();
    form.append("file", file);
    setLogoBusy(true);
    try {
      await apiUploadVoid("/branding/logo", form, { method: "PUT" });
      await refreshBranding();
      toast.success(t("settings.identity.logoSaved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setLogoBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = async () => {
    setLogoBusy(true);
    try {
      await apiVoid("/branding/logo", { method: "DELETE" });
      await refreshBranding();
      toast.success(t("settings.identity.logoRemoved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setLogoBusy(false);
    }
  };

  return (
    <>
      {/* Nombre visible de la empresa */}
      <div className={styles.settingGroupHead}>
        <span className={styles.settingLabel}>{t("settings.identity.name")}</span>
        <p className={styles.settingHint}>{t("settings.identity.nameHint")}</p>
      </div>
      <div className={styles.toggleList}>
        <div className={styles.settingRow}>
          <Input
            value={currentName}
            disabled={!canManage || update.isPending}
            maxLength={120}
            placeholder={t("settings.identity.namePlaceholder")}
            aria-label={t("settings.identity.name")}
            onChange={(e) => setDraftName(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <Button
            variant="primary"
            disabled={!canManage || !nameDirty || update.isPending}
            onClick={() => void saveName()}
          >
            {t("common.save")}
          </Button>
        </div>
      </div>

      {/* Logo */}
      <div className={styles.settingGroupHead}>
        <span className={styles.settingLabel}>{t("settings.identity.logo")}</span>
        <p className={styles.settingHint}>{t("settings.identity.logoHint")}</p>
      </div>
      <div className={styles.toggleList}>
        <div className={styles.settingRow}>
          {branding.logoUrl ? (
            <img
              src={branding.logoUrl}
              alt={t("settings.identity.logo")}
              style={{
                height: 44,
                maxWidth: 200,
                objectFit: "contain",
                background: "rgba(255,255,255,0.92)",
                borderRadius: 8,
                padding: "4px 8px",
              }}
            />
          ) : (
            <span className={styles.settingHint}>
              {currentName.trim()
                ? t("settings.identity.logoNoneMonogram", {
                    initials: licenseeInitials(currentName),
                  })
                : t("settings.identity.logoNone")}
            </span>
          )}
          <span style={{ display: "inline-flex", gap: 8 }}>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadLogo(file);
              }}
            />
            <Button
              variant="secondary"
              loading={logoBusy}
              disabled={!canManage}
              leftIcon={<ImageUp size={15} />}
              onClick={() => fileRef.current?.click()}
            >
              {t("settings.identity.logoUpload")}
            </Button>
            {branding.logoUrl && (
              <Button
                variant="secondary"
                disabled={!canManage || logoBusy}
                leftIcon={<Trash2 size={15} />}
                onClick={() => void removeLogo()}
              >
                {t("settings.identity.logoRemove")}
              </Button>
            )}
          </span>
        </div>
        <p className={styles.settingHint}>{t("settings.identity.logoRequirements")}</p>
      </div>

      {/* Defaults de la instalación */}
      <div className={styles.settingGroupHead}>
        <span className={styles.settingLabel}>{t("settings.identity.defaults")}</span>
        <p className={styles.settingHint}>{t("settings.identity.defaultsHint")}</p>
      </div>
      <div className={styles.toggleList}>
        <div className={styles.settingRow}>
          <span className={styles.toggleLabel}>{t("settings.identity.defaultTheme")}</span>
          <Select
            value={data.defaultThemeMode ?? ""}
            disabled={!canManage || update.isPending}
            aria-label={t("settings.identity.defaultTheme")}
            onChange={(e) =>
              void patch({
                defaultThemeMode:
                  e.target.value === "" ? null : (e.target.value as SetupThemeMode),
              })
            }
          >
            <option value="">{t("settings.identity.defaultThemeBrand")}</option>
            {THEME_MODE_VALUES.map((v) => (
              <option key={v} value={v}>
                {t(`theme.${v}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.settingRow}>
          <span className={styles.toggleLabel}>{t("settings.identity.timezone")}</span>
          <Select
            value={data.defaultTimezone ?? ""}
            disabled={!canManage || update.isPending}
            aria-label={t("settings.identity.timezone")}
            onChange={(e) =>
              void patch({ defaultTimezone: e.target.value === "" ? null : e.target.value })
            }
          >
            <option value="">{t("settings.identity.notSet")}</option>
            {timezoneOptions().map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        </div>
        <div className={styles.settingRow}>
          <span className={styles.toggleLabel}>{t("settings.identity.locale")}</span>
          <Select
            value={data.defaultLocale ?? ""}
            disabled={!canManage || update.isPending}
            aria-label={t("settings.identity.locale")}
            onChange={(e) =>
              void patch({
                defaultLocale: e.target.value === "" ? null : (e.target.value as SetupLocale),
              })
            }
          >
            <option value="">{t("settings.identity.notSet")}</option>
            {LOCALE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!canManage && <p className={styles.meta}>{t("settings.readOnly")}</p>}
    </>
  );
}
