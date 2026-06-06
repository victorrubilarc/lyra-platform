import { useLocation, useNavigate } from "react-router-dom";
import { Pin, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "@lyra/ui";
import { routeByPath } from "./navigation.js";
import { useWorkspaceStore } from "./workspace-store.js";
import styles from "./AppShell.module.css";

/**
 * Tira de pestañas de trabajo (acotada). Cada pestaña es una ruta; el estado de
 * la vista lo preserva la caché de TanStack Query, no este componente. No se
 * renderiza si no hay pestañas abiertas (la Home no genera pestaña).
 */
export function WorkspaceTabs() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tabs = useWorkspaceStore((s) => s.tabs);
  const closeTab = useWorkspaceStore((s) => s.closeTab);
  const togglePin = useWorkspaceStore((s) => s.togglePin);

  if (tabs.length === 0) return null;

  return (
    <div className={styles.tabsBar} role="tablist" aria-label="Pestañas de trabajo">
      {tabs.map((tab) => {
        const route = routeByPath(tab.path);
        const Icon = route?.icon;
        const label = tab.title ?? (route ? t(route.labelKey) : tab.path);
        const active = pathname === tab.path;
        return (
          <div key={tab.path} className={cx(styles.tab, active && styles.tabActive)} role="presentation">
            <button
              type="button"
              role="tab"
              aria-selected={active}
              className={styles.tabMain}
              onClick={() => navigate(tab.path)}
            >
              {Icon && (
                <span className={styles.tabIcon}>
                  <Icon size={14} aria-hidden="true" />
                </span>
              )}
              <span className={styles.tabLabel}>{label}</span>
            </button>
            <span className={styles.tabBtns}>
              <button
                type="button"
                className={cx(styles.tabCtl, tab.pinned && styles.tabPinned)}
                aria-label={tab.pinned ? t("shell.unpinTab") : t("shell.pinTab")}
                onClick={() => togglePin(tab.path)}
              >
                <Pin size={12} fill={tab.pinned ? "currentColor" : "none"} />
              </button>
              <button
                type="button"
                className={styles.tabCtl}
                aria-label={t("shell.closeTab")}
                onClick={() => {
                  const next = closeTab(tab.path);
                  navigate(next ?? "/");
                }}
              >
                <X size={13} />
              </button>
            </span>
          </div>
        );
      })}
    </div>
  );
}
