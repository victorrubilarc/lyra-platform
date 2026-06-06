import { useLocation, useNavigate } from "react-router-dom";
import { Boxes, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, cx } from "@lyra/ui";
import { usePermissions } from "../auth/use-permissions.js";
import { useUIStore } from "./ui-store.js";
import { useFavoritesStore } from "./favorites-store.js";
import { SIDEBAR_ROUTES, routeByPath, type NavRoute } from "./navigation.js";
import styles from "./AppShell.module.css";

/** Menú lateral colapsable (completo ↔ riel de íconos) con favoritos. */
export function Sidebar() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);

  const visible = SIDEBAR_ROUTES.filter((r) => !r.permission || perms.can(r.permission));
  const favRoutes = favorites
    .map(routeByPath)
    .filter((r): r is NavRoute => Boolean(r));

  function renderItem(route: NavRoute) {
    const Icon = route.icon;
    const label = t(route.labelKey);
    const isActive = pathname === route.path;
    const isFav = favorites.includes(route.path);

    const row = (
      <div className={cx(styles.navItem, isActive && styles.navItemActive)}>
        <button type="button" className={styles.navMain} onClick={() => navigate(route.path)}>
          <span className={styles.navIcon}>
            <Icon size={18} aria-hidden="true" />
          </span>
          {!collapsed && (
            <>
              <span className={styles.navText}>{label}</span>
              {route.soon && <span className={styles.soonBadge}>{t("common.comingSoon")}</span>}
            </>
          )}
        </button>
        {!collapsed && (
          <button
            type="button"
            className={cx(styles.favStar, isFav && styles.favStarOn)}
            aria-label={isFav ? t("shell.unpin") : t("shell.pin")}
            onClick={() => toggleFavorite(route.path)}
          >
            <Star size={14} fill={isFav ? "currentColor" : "none"} />
          </button>
        )}
      </div>
    );

    return collapsed ? (
      <Tooltip key={route.path} label={label} side="right">
        {row}
      </Tooltip>
    ) : (
      <div key={route.path}>{row}</div>
    );
  }

  return (
    <aside className={cx(styles.sidebar, collapsed && styles.sidebarCollapsed, collapsed && styles.collapsed)}>
      <div className={styles.brand}>
        <div className={styles.brandLogo}>
          <Boxes size={19} color="#fff" aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className={styles.brandText}>
            <div className={styles.brandWordmark}>
              Lyra <span className={styles.brandProduct}>WatchLog</span>
            </div>
            <div className={styles.brandTagline}>{t("shell.brandTagline")}</div>
          </div>
        )}
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={toggleSidebar}
          aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <div className={styles.sidebarScroll}>
        {!collapsed && <div className={styles.navLabel}>{t("nav.sectionLabel")}</div>}
        {visible.map(renderItem)}

        {favRoutes.length > 0 && (
          <>
            {!collapsed && <div className={styles.navLabel}>{t("shell.favorites")}</div>}
            {favRoutes.map(renderItem)}
          </>
        )}
      </div>
    </aside>
  );
}
