import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Bell, Check, Languages, LogOut, Monitor, Moon, Rows3, Search, Sun, UserCog } from "lucide-react";
import { Breadcrumb, Menu, MenuItem, MenuLabel, MenuSeparator, Tooltip, type Crumb } from "@lyra/ui";
import { FavoritesMenu } from "./FavoritesMenu.js";
import { NotificationBell } from "./NotificationBell.js";
import { useAuth } from "../auth/use-auth.js";
import { useUIStore } from "./ui-store.js";
import { useThemeStore, type ThemePreference } from "./theme-store.js";
import { routeForPath } from "./navigation.js";
import { SUPPORTED_LANGUAGES, setLanguage } from "../i18n/i18n.js";
import styles from "./AppShell.module.css";

const THEME_OPTIONS: { value: ThemePreference; icon: typeof Sun }[] = [
  { value: "dark", icon: Moon },
  { value: "light", icon: Sun },
  { value: "auto", icon: Monitor },
];

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
  const themePref = useThemeStore((s) => s.preference);
  const setThemePref = useThemeStore((s) => s.setPreference);
  const ThemeIcon = THEME_OPTIONS.find((o) => o.value === themePref)?.icon ?? Moon;

  const route = routeForPath(pathname);
  const crumbs: Crumb[] = [{ label: t("nav.home"), onClick: () => navigate("/") }];
  if (route && pathname !== "/") {
    const onModuleRoot = pathname === route.path;
    crumbs.push({
      label: t(route.labelKey),
      onClick: onModuleRoot ? undefined : () => navigate(route.path),
    });
  }

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
          ariaLabel={t("topbar.theme")}
          trigger={
            <span className={styles.iconBtn}>
              <ThemeIcon size={18} aria-hidden="true" />
            </span>
          }
        >
          <MenuLabel>{t("topbar.theme")}</MenuLabel>
          {THEME_OPTIONS.map((o) => {
            const Icon = o.icon;
            return (
              <MenuItem
                key={o.value}
                icon={<Icon size={16} />}
                trailing={themePref === o.value ? <Check size={14} /> : undefined}
                onSelect={() => setThemePref(o.value)}
              >
                {t(`theme.${o.value}`)}
              </MenuItem>
            );
          })}
        </Menu>

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

        <FavoritesMenu />

        <NotificationBell />

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
            <MenuItem icon={<Bell size={16} />} onSelect={() => navigate("/mis-notificaciones")}>
              {t("topbar.myNotifications")}
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
