import { useTranslation } from "react-i18next";
import { Lock, ShieldCheck } from "lucide-react";
import { Card, EmptyState, Skeleton, Toggle, useToast } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { useSystemSettings, useUpdateSystemSettings } from "./settings-queries.js";
import styles from "./SettingsPage.module.css";

export function SettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const canManage = perms.can("settings:manage");

  const { data, isLoading } = useSystemSettings();
  const update = useUpdateSystemSettings();

  if (!perms.can("module:settings:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("settings.noAccess")} description={t("settings.noAccessDesc")} />
      </div>
    );
  }

  const toggle = async (next: boolean) => {
    try {
      await update.mutateAsync({ requireMfaForPeriodGovernance: next });
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

      <Card className={styles.card}>
        <h2 className={styles.cardTitle}>
          <ShieldCheck size={18} /> {t("settings.security")}
        </h2>
        {isLoading || !data ? (
          <Skeleton height={56} width="100%" />
        ) : (
          <div className={styles.row}>
            <div className={styles.rowText}>
              <span className={styles.rowLabel}>{t("settings.requireMfaPeriods")}</span>
              <p className={styles.rowHint}>{t("settings.requireMfaPeriodsHint")}</p>
              {data.updatedByName && (
                <p className={styles.meta}>{t("settings.updatedBy", { name: data.updatedByName })}</p>
              )}
            </div>
            <Toggle
              checked={data.requireMfaForPeriodGovernance}
              disabled={!canManage || update.isPending}
              onChange={(v) => void toggle(v)}
            />
          </div>
        )}
        {!canManage && <p className={styles.meta}>{t("settings.readOnly")}</p>}
      </Card>
    </div>
  );
}
