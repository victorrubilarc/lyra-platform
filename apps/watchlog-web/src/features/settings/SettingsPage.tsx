import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Bell, BookOpenCheck, BrainCircuit, Building2, Lock, Mail, Palette, ShieldCheck } from "lucide-react";
import { EmptyState, Select, Skeleton, Toggle, cx, useToast } from "@lyra/ui";
import type { LucideIcon } from "lucide-react";
import type { EditWindowAnchor, SystemSettingsDto, UpdateSystemSettingsRequest } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { ApiError } from "../../lib/api-client.js";
import { EditWindowDurationField } from "./EditWindowDurationField.js";
import { EmailSettingsPanel } from "./EmailSettingsPanel.js";
import { AiSettingsPanel } from "./AiSettingsPanel.js";
import { AppearanceSettingsPanel } from "./AppearanceSettingsPanel.js";
import { IdentitySettingsPanel } from "./IdentitySettingsPanel.js";
import { LicenseSettingsPanel } from "./LicenseSettingsPanel.js";
import { useSystemSettings, useUpdateSystemSettings } from "./settings-queries.js";
import styles from "./SettingsPage.module.css";

/** Las cuatro acciones de gobernanza de período, cada una con su flag MFA. */
const MFA_ACTIONS: { field: keyof UpdateSystemSettingsRequest; labelKey: string }[] = [
  { field: "requireMfaPeriodClose", labelKey: "settings.mfa.close" },
  { field: "requireMfaPeriodReopen", labelKey: "settings.mfa.reopen" },
  { field: "requireMfaPeriodLock", labelKey: "settings.mfa.lock" },
  { field: "requireMfaPeriodUnlock", labelKey: "settings.mfa.unlock" },
];

type Category = "security" | "logbook" | "notifications" | "email" | "ai" | "identity" | "appearance" | "license";

interface CategoryDef {
  id: Category;
  labelKey: string;
  icon: LucideIcon;
  /** Permiso requerido para ver el tab (ausente = siempre, dentro de settings:view). */
  permission?: string;
}

const CATEGORIES: CategoryDef[] = [
  { id: "security", labelKey: "settings.cat.security", icon: ShieldCheck },
  { id: "logbook", labelKey: "settings.cat.logbook", icon: BookOpenCheck },
  { id: "notifications", labelKey: "settings.cat.notifications", icon: Bell },
  { id: "email", labelKey: "settings.cat.email", icon: Mail, permission: "notification:config" },
  { id: "ai", labelKey: "settings.cat.ai", icon: BrainCircuit, permission: "ai:config" },
  // Identidad (OOBE S3): nombre/logo/defaults de la instalación. Se REUSA
  // settings:manage (decisión (d) 2026-07-06: identidad = config de sistema,
  // misma dueña que SMTP/política; theme:manage es el eje del diseñador de paletas).
  { id: "identity", labelKey: "settings.cat.identity", icon: Building2, permission: "settings:manage" },
  { id: "appearance", labelKey: "settings.cat.appearance", icon: Palette, permission: "theme:manage" },
  // Licencia (L6): SOLO LECTURA, sin permiso propio — el DTO delgado ya es
  // visible para todo autenticado (decisión L6b); `module:settings:view` gatea la página.
  { id: "license", labelKey: "settings.cat.license", icon: BadgeCheck },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const toast = useToast();
  const perms = usePermissions();
  const canManage = perms.can("settings:manage");

  const { data, isLoading } = useSystemSettings();
  const update = useUpdateSystemSettings();

  // Deep link `?tab=<categoría>` (banner de licencia / campanita → Licencia).
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const [tab, setTab] = useState<Category>(
    CATEGORIES.some((c) => c.id === requested) ? (requested as Category) : "security",
  );

  if (!perms.can("module:settings:view")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("settings.noAccess")} description={t("settings.noAccessDesc")} />
      </div>
    );
  }

  const patch = async (dto: UpdateSystemSettingsRequest) => {
    try {
      await update.mutateAsync(dto);
      toast.success(t("settings.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };
  const toggle = (field: keyof UpdateSystemSettingsRequest, next: boolean) => patch({ [field]: next });

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
          {CATEGORIES.filter((c) => !c.permission || perms.can(c.permission)).map((c) => {
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

          {tab === "logbook" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <BookOpenCheck size={18} /> {t("settings.cat.logbook")}
                </h2>
                <p className={styles.sectionDesc}>{t("settings.logbookDesc")}</p>
              </header>

              <div className={styles.settingGroupHead}>
                <span className={styles.settingLabel}>{t("settings.editWindow")}</span>
                <p className={styles.settingHint}>{t("settings.editWindowHint")}</p>
              </div>

              {isLoading || !data ? (
                <Skeleton height={140} width="100%" />
              ) : (
                <div className={styles.toggleList}>
                  <div className={styles.settingRow}>
                    <span className={styles.toggleLabel}>{t("settings.editWindowDuration")}</span>
                    <EditWindowDurationField
                      minutes={data.editWindowMinutes}
                      disabled={!canManage || update.isPending}
                      placeholder={t("settings.editWindowNoLimit")}
                      commitOnBlur
                      onChange={(minutes) => {
                        if (minutes !== data.editWindowMinutes) void patch({ editWindowMinutes: minutes });
                      }}
                    />
                  </div>
                  <div className={styles.settingRow}>
                    <span className={styles.toggleLabel}>{t("settings.editWindowAnchor")}</span>
                    <Select
                      value={data.editWindowAnchor}
                      disabled={!canManage || update.isPending}
                      aria-label={t("settings.editWindowAnchor")}
                      onChange={(e) => void patch({ editWindowAnchor: e.target.value as EditWindowAnchor })}
                    >
                      <option value="RECORDED">{t("settings.editWindowAnchorRecorded")}</option>
                      <option value="EFFECTIVE">{t("settings.editWindowAnchorEffective")}</option>
                    </Select>
                  </div>
                  <div className={styles.settingRow}>
                    <span className={styles.toggleLabel}>{t("settings.editWindowMfa")}</span>
                    <Toggle
                      checked={Boolean((data as SystemSettingsDto).requireMfaEditWindowOverride)}
                      disabled={!canManage || update.isPending}
                      onChange={(v) => void toggle("requireMfaEditWindowOverride", v)}
                    />
                  </div>
                </div>
              )}

              {!canManage && <p className={styles.meta}>{t("settings.readOnly")}</p>}
            </section>
          )}

          {tab === "notifications" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <Bell size={18} /> {t("settings.cat.notifications")}
                </h2>
                <p className={styles.sectionDesc}>{t("settings.notifDesc")}</p>
              </header>

              <div className={styles.settingGroupHead}>
                <span className={styles.settingLabel}>{t("settings.notifDefaults")}</span>
                <p className={styles.settingHint}>{t("settings.notifDefaultsHint")}</p>
              </div>

              {isLoading || !data ? (
                <Skeleton height={80} width="100%" />
              ) : (
                <div className={styles.toggleList}>
                  <div className={styles.settingRow}>
                    <span className={styles.toggleLabel}>{t("settings.notifTransitionDefault")}</span>
                    <Toggle
                      checked={Boolean((data as SystemSettingsDto).notifyTransitionDefaultDestinationRoles)}
                      disabled={!canManage || update.isPending}
                      onChange={(v) => void toggle("notifyTransitionDefaultDestinationRoles", v)}
                    />
                  </div>
                </div>
              )}

              {!canManage && <p className={styles.meta}>{t("settings.readOnly")}</p>}
            </section>
          )}

          {tab === "email" && perms.can("notification:config") && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <Mail size={18} /> {t("settings.cat.email")}
                </h2>
                <p className={styles.sectionDesc}>{t("settings.emailDesc")}</p>
              </header>
              <EmailSettingsPanel />
            </section>
          )}

          {tab === "ai" && perms.can("ai:config") && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <BrainCircuit size={18} /> {t("settings.cat.ai")}
                </h2>
                <p className={styles.sectionDesc}>{t("settings.aiDesc")}</p>
              </header>
              <AiSettingsPanel />
            </section>
          )}

          {tab === "identity" && canManage && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <Building2 size={18} /> {t("settings.cat.identity")}
                </h2>
                <p className={styles.sectionDesc}>{t("settings.identityDesc")}</p>
              </header>
              <IdentitySettingsPanel canManage={canManage} />
            </section>
          )}

          {tab === "appearance" && perms.can("theme:manage") && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <Palette size={18} /> {t("settings.cat.appearance")}
                </h2>
                <p className={styles.sectionDesc}>{t("settings.appearanceDesc")}</p>
              </header>
              <AppearanceSettingsPanel />
            </section>
          )}

          {tab === "license" && (
            <section className={styles.section}>
              <header className={styles.sectionHead}>
                <h2 className={styles.sectionTitle}>
                  <BadgeCheck size={18} /> {t("settings.cat.license")}
                </h2>
                <p className={styles.sectionDesc}>{t("license.settings.desc")}</p>
              </header>
              <LicenseSettingsPanel />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
