import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, Check, Languages, LogOut, Rows3, Search, UserCog } from "lucide-react";
import { Breadcrumb, Menu, MenuItem, MenuLabel, MenuSeparator, Tooltip, type Crumb } from "@lyra/ui";
import { useAuth } from "../auth/use-auth.js";
import { useUIStore } from "./ui-store.js";
import { routeByPath } from "./navigation.js";
import { SUPPORTED_LANGUAGES, setLanguage } from "../i18n/i18n.js";
import styles from "./AppShell.module.css";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

interface TopbarProps {
  onOpenSearch: () => void;
}

/** Barra superior: breadcrumbs · búsqueda (⌘K) · densidad · idioma · notificaciones · perfil. */
export function Topbar({ onOpenSearch }: TopbarProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const density = useUIStore((s) => s.density);
  const toggleDensity = useUIStore((s) => s.toggleDensity);

  const route = routeByPath(pathname);
  const crumbs: Crumb[] = [{ label: t("nav.home"), onClick: () => navigate("/") }];
  if (route && pathname !== "/") crumbs.push({ label: t(route.labelKey) });

  return (
    <header className={styles.topbar}>
      <div className={styles.topLeft}>
        <Breadcrumb items={crumbs} />
      </div>

      <button type="button" className={styles.searchBtn} onClick={onOpenSearch}>
        <Search size={15} aria-hidden="true" />
        <span className={styles.searchBtnText}>{t("topbar.commandHint")}</span>
        <span className={styles.kbd}>⌘K</span>
      </button>

      <div className={styles.topRight}>
        <Tooltip
          side="bottom"
          label={`${t("topbar.density")}: ${t(density === "comfortable" ? "topbar.densityComfortable" : "topbar.densityCompact")}`}
        >
          <button
            type="button"
            className={styles.iconBtn}
            onClick={toggleDensity}
            aria-label={t("topbar.density")}
          >
            <Rows3 size={18} />
          </button>
        </Tooltip>

        <Menu
          ariaLabel={t("topbar.language")}
          trigger={
            <span className={styles.iconBtn}>
              <Languages size={18} aria-hidden="true" />
            </span>
          }
        >
          <MenuLabel>{t("topbar.language")}</MenuLabel>
          {SUPPORTED_LANGUAGES.map((l) => (
            <MenuItem
              key={l.code}
              disabled={!l.ready}
              trailing={
                i18n.language === l.code ? (
                  <Check size={14} />
                ) : !l.ready ? (
                  t("common.comingSoon")
                ) : undefined
              }
              onSelect={() => l.ready && setLanguage(l.code)}
            >
              {t(`languages.${l.code}`)}
            </MenuItem>
          ))}
        </Menu>

        <Menu
          ariaLabel={t("topbar.notifications")}
          minWidth={260}
          trigger={
            <span className={styles.iconBtn}>
              <Bell size={18} aria-hidden="true" />
            </span>
          }
        >
          <MenuLabel>{t("topbar.notifications")}</MenuLabel>
          <div style={{ padding: "8px 12px 10px", fontSize: 13, color: "var(--color-text-muted)" }}>
            {t("topbar.noNotifications")}
          </div>
        </Menu>

        {user && (
          <Menu
            ariaLabel={t("topbar.openProfileMenu")}
            trigger={<span className={styles.avatar}>{initials(user.displayName)}</span>}
          >
            <div className={styles.menuHead}>
              <div className={styles.menuName}>{user.displayName}</div>
              <div className={styles.menuMail}>{user.email}</div>
            </div>
            <MenuSeparator />
            <MenuItem icon={<UserCog size={16} />} onSelect={() => navigate("/perfil/seguridad")}>
              {t("topbar.mySecurity")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger icon={<LogOut size={16} />} onSelect={() => void signOut()}>
              {t("topbar.signOut")}
            </MenuItem>
          </Menu>
        )}
      </div>
    </header>
  );
}
