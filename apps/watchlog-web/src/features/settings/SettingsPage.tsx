import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock, ShieldCheck } from "lucide-react";
import { EmptyState, Skeleton, Toggle, cx, useToast } from "@lyra/ui";
import type { LucideIcon } from "lucide-react";
import type { SystemSettingsDto, UpdateSystemSettingsRequest } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { useSystemSettings, useUpdateSystemSettings } from "./settings-queries.js";
import styles from "./SettingsPage.module.css";

/** Las cuatro acciones de gobernanza de período, cada una con su flag MFA. */
const MFA_ACTIONS: { field: keyof UpdateSystemSettingsRequest; labelKey: string }[] = [
  { field: "requireMfaPeriodClose", labelKey: "settings.mfa.close" },
  { field: "requireMfaPeriodReopen", labelKey: "settings.mfa.reopen" },
  { field: "requireMfaPeriodLock", labelKey: "settings.mfa.lock" },
  { field: "requireMfaPeriodUnlock", labelKey: "settings.mfa.unlock" },
];

type Category = "security";

interface CategoryDef {
  id: Category;
  labelKey: string;
  icon: LucideIcon;
}

const CATEGORIES: CategoryDef[] = [{ id: "security", labelKey: "settings.cat.security", icon: ShieldCheck }];

export function SettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const canManage = perms.can("settings:manage");

  const { data, isLoading } = useSystemSettings();
  const update = useUpdateSystemSettings();

  const [tab, setTab] = useState<Category>("security");

  if (!perms.can("module:settings:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("settings.noAccess")} description={t("settings.noAccessDesc")} />
      </div>
    );
  }

  const toggle = async (field: keyof UpdateSystemSettingsRequest, next: boolean) => {
    try {
      await update.mutateAsync({ [field]: next });
      toast.success(t("settings.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          {t("settings.title")} <span className={styles.accent}>{t("settings.titleAccent")}</span>
        </h1>
        <p className={styles.subtitle}>{t("settings.subtitle")}</p>
      </div>

      <div className={styles.layout}>
        <nav className={styles.tabNav} aria-label={t("settings.tabsAria")}>
          {CATEGORIES.map((c) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                type="button"
                className={cx(styles.tabBtn, tab === c.id && styles.tabBtnActive)}
                onClick={() => setTab(c.id)}
                aria-current={tab === c.id}
              >
                <Icon size={16} /> {t(c.labelKey)}
              </button>
            );
          })}
        </nav>

        <div className={styles.content}>
          {tab === "security" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <ShieldCheck size={18} /> {t("settings.cat.security")}
                </h2>
                <p className={styles.sectionDesc}>{t("settings.securityDesc")}</p>
              </header>

              <div className={styles.settingGroupHead}>
                <span className={styles.settingLabel}>{t("settings.requireMfaPeriods")}</span>
                <p className={styles.settingHint}>{t("settings.requireMfaPeriodsHint")}</p>
              </div>

              {isLoading || !data ? (
                <Skeleton height={120} width="100%" />
              ) : (
                <div className={styles.toggleList}>
                  {MFA_ACTIONS.map(({ field, labelKey }) => (
                    <div key={field} className={styles.settingRow}>
                      <span className={styles.toggleLabel}>{t(labelKey)}</span>
                      <Toggle
                        checked={Boolean((data as SystemSettingsDto)[field as keyof SystemSettingsDto])}
                        disabled={!canManage || update.isPending}
                        onChange={(v) => void toggle(field, v)}
                      />
                    </div>
                  ))}
                </div>
              )}

              {data?.updatedByName && <p className={styles.meta}>{t("settings.updatedBy", { name: data.updatedByName })}</p>}
              {!canManage && <p className={styles.meta}>{t("settings.readOnly")}</p>}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
