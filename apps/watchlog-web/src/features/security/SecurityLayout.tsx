import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { EmptyState, cx } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { isRouteActive } from "../../shell/navigation.js";
import { SECURITY_TABS } from "./security-tabs.js";
import styles from "./SecurityLayout.module.css";

/**
 * Marco del módulo de Seguridad: cabecera + barra de sub-tabs (gateadas por
 * permiso) + `Outlet` de la sub-sección activa. La autorización real la aplica
 * el backend; aquí solo ocultamos las pestañas sin permiso.
 */
export function SecurityLayout() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const allowedTabs = SECURITY_TABS.filter((tab) => perms.can(tab.permission));

  if (allowedTabs.length === 0) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon={<Lock size={36} />}
          title={t("security.noAccess")}
          description={t("security.noAccessDesc")}
        />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("security.title")}</h1>
        <p className={styles.subtitle}>{t("security.subtitle")}</p>
      </div>

      <nav className={styles.tabs} role="tablist" aria-label={t("security.title")}>
        {allowedTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isRouteActive(tab.path, pathname);
          return (
            <button
              key={tab.path}
              type="button"
              role="tab"
              aria-selected={active}
              className={cx(styles.tab, active && styles.tabActive)}
              onClick={() => navigate(tab.path)}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{t(tab.labelKey)}</span>
            </button>
          );
        })}
      </nav>

      <div className={styles.body}>
        <Outlet />
      </div>
    </div>
  );
}
