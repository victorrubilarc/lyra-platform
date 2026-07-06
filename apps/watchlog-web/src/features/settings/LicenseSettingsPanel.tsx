import { useTranslation } from "react-i18next";
import { BadgeCheck, FileText } from "lucide-react";
import { Skeleton } from "@lyra/ui";
import { useLicenseStatus } from "../../auth/use-license.js";
import { formatDate } from "../../lib/format.js";
import { licenseBannerFor } from "../../shell/license-banner.js";
import styles from "./LicenseSettingsPanel.module.css";

/**
 * Detalle de licencia en Configuración (L6) — SOLO LECTURA. Presenta el DTO
 * delgado (estado + motivo humanizado, edición, módulos, vencimiento) y las
 * instrucciones de renovación del runbook en lenguaje de admin de planta. No
 * expone ni sube archivos: la licencia se administra por archivos del
 * despliegue (decisión L6 — un upload por API sería una superficie nueva).
 */
export function LicenseSettingsPanel() {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useLicenseStatus();

  if (isLoading) return <Skeleton height={220} width="100%" />;
  if (isError || !data) return <p className={styles.error}>{t("license.settings.loadError")}</p>;

  const banner = licenseBannerFor(data);
  const tone = banner?.tone ?? "ok";
  const days =
    data.status === "EN_GRACIA" ? data.graceDaysRemaining : data.daysToExpiry;

  return (
    <div className={styles.panel}>
      <div className={styles.statusCard} data-tone={tone}>
        <BadgeCheck size={20} aria-hidden="true" className={styles.statusIcon} />
        <div className={styles.statusBody}>
          <span className={styles.statusName}>
            {t(`license.status.${data.status}`, data.status)}
          </span>
          {data.reason && (
            <span className={styles.statusReason}>
              {t(`license.reason.${data.reason}`, data.reason)}
            </span>
          )}
        </div>
      </div>

      <dl className={styles.facts}>
        <div className={styles.fact}>
          <dt>{t("license.settings.editionLabel")}</dt>
          <dd>{data.edition ?? "—"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>{t("license.settings.expiresLabel")}</dt>
          <dd>{data.expiresAt ? formatDate(data.expiresAt) : "—"}</dd>
        </div>
        <div className={styles.fact}>
          <dt>
            {data.status === "EN_GRACIA"
              ? t("license.settings.graceLabel")
              : t("license.settings.daysLeftLabel")}
          </dt>
          <dd>{days !== undefined && days >= 0 ? days : "—"}</dd>
        </div>
      </dl>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>{t("license.settings.modulesTitle")}</h3>
        {data.modules === null ? (
          <p className={styles.hint}>{t("license.settings.modulesNull")}</p>
        ) : (
          <div className={styles.chips}>
            {data.modules.map((m) => (
              <span key={m} className={styles.chip}>
                {t(`license.modules.${m}`, m)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className={styles.block}>
        <h3 className={styles.blockTitle}>
          <FileText size={15} aria-hidden="true" /> {t("license.settings.renewTitle")}
        </h3>
        <p className={styles.hint}>{t("license.settings.renewIntro")}</p>
        <ol className={styles.steps}>
          <li>{t("license.settings.renewStep1")}</li>
          <li>{t("license.settings.renewStep2")}</li>
          <li>{t("license.settings.renewStep3")}</li>
          <li>{t("license.settings.renewStep4")}</li>
        </ol>
        <p className={styles.note}>{t("license.settings.renewNote")}</p>
      </div>
    </div>
  );
}
