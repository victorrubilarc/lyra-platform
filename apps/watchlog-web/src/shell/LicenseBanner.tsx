import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Info, Lock, X } from "lucide-react";
import { cx } from "@lyra/ui";
import { useLicenseStatus } from "../auth/use-license.js";
import { usePermissions } from "../auth/use-permissions.js";
import { formatDate } from "../lib/format.js";
import { licenseBannerFor } from "./license-banner.js";
import styles from "./LicenseBanner.module.css";

/** El descarte es POR SESIÓN y por estado: si el estado empeora, reaparece. */
const DISMISS_KEY = "wl-license-banner-dismissed";

/**
 * Banner global de estado de licencia (L6). Vive en el shell (bajo el Topbar)
 * alimentado por el DTO delgado de `useLicenseStatus`. Qué se muestra, a quién
 * y si se descarta lo decide la presentación pura `licenseBannerFor` (decisión
 * L6a); aquí solo se filtra la audiencia por permiso (`settings:manage` es un
 * filtro de UI — el DTO es visible para todo autenticado) y se interpola i18n.
 * VALIDA no renderiza nada. El banner INFORMA: el candado real es el backend.
 */
export function LicenseBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useLicenseStatus();
  const perms = usePermissions();
  const [dismissed, setDismissed] = useState<string | null>(() =>
    sessionStorage.getItem(DISMISS_KEY),
  );

  const p = licenseBannerFor(data);
  if (!p) return null;
  if (p.audience === "admins" && !perms.can("settings:manage")) return null;
  const dismissTag = data?.status ?? "";
  if (p.dismissible && dismissed === dismissTag) return null;

  const dismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, dismissTag);
    setDismissed(dismissTag);
  };

  const Icon = p.tone === "error" ? Lock : p.tone === "warning" ? AlertTriangle : Info;
  const canDetail = perms.can("module:settings:view");

  return (
    <div
      className={cx(styles.banner, styles[p.tone])}
      role={p.tone === "error" ? "alert" : "status"}
    >
      <Icon size={16} className={styles.icon} aria-hidden="true" />
      <span className={styles.text}>
        {t(`license.banner.${p.key}`, {
          days: p.days ?? "—",
          date: p.expiresAt ? formatDate(p.expiresAt) : "—",
        })}
      </span>
      {canDetail && (
        <button
          type="button"
          className={styles.detailBtn}
          onClick={() => navigate("/configuracion?tab=license")}
        >
          {t("license.banner.detail")}
        </button>
      )}
      {p.dismissible && (
        <button
          type="button"
          className={styles.closeBtn}
          onClick={dismiss}
          aria-label={t("license.banner.dismiss")}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
