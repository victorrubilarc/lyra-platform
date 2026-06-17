import { Fragment } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Boxes, ChevronDown, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tooltip, cx } from "@lyra/ui";
import { usePermissions } from "../auth/use-permissions.js";
import { useUIStore } from "./ui-store.js";
import { useFavoritesStore } from "./favorites-store.js";
import { SIDEBAR_ROUTES, buildNavGroups, isRouteActive, type NavRoute } from "./navigation.js";
import styles from "./AppShell.module.css";

/**
 * Menú lateral colapsable (completo ↔ riel de íconos) organizado en grupos con
 * encabezado (Operación · Diseño y datos · Administración). Los grupos pliegan/
 * despliegan con estado persistido; el grupo del ítem activo se muestra SIEMPRE
 * (aunque esté plegado). En el riel de íconos no hay encabezados ni plegado: los
 * grupos se separan con divisores sutiles y cada ítem se identifica por tooltip.
 * Los FAVORITOS se fijan aquí (estrella por ítem) pero se ACCEDEN desde el menú
 * de favoritos del topbar (`FavoritesMenu`).
 */
export function Sidebar() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const collapsedNavGroups = useUIStore((s) => s.collapsedNavGroups);
  const toggleNavGroup = useUIStore((s) => s.toggleNavGroup);
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);

  const visible = SIDEBAR_ROUTES.filter((r) => !r.permission || perms.can(r.permission));
  const groups = buildNavGroups(visible);

  function renderItem(route: NavRoute) {
    const Icon = route.icon;
    const label = t(route.labelKey);
    const isActive = isRouteActive(route.path, pathname);
    const isFav = favorites.includes(route.path);

    const row = (
      <div className={cx(styles.navItem, isActive && styles.navItemActive)}>
        <button type="button" className={styles.navMain} onClick={() => navigate(route.path)}>
          <span className={styles.navIcon}>
            <Icon size={19} aria-hidden="true" />
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

  // ----- Riel colapsado: grupos como clústeres de íconos separados por divisores.
  if (collapsed) {
    return (
      <aside className={cx(styles.sidebar, styles.sidebarCollapsed, styles.collapsed)}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <Boxes size={19} color="#fff" aria-hidden="true" />
          </div>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={toggleSidebar}
            aria-label={t("shell.expand")}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <div className={styles.sidebarScroll}>
          {groups.map((g, i) => (
            <Fragment key={g.group.id}>
              {i > 0 && <div className={styles.navDivider} aria-hidden="true" />}
              {g.routes.map(renderItem)}
            </Fragment>
          ))}
        </div>
      </aside>
    );
  }

  // ----- Sidebar expandido: grupos con encabezado colapsable + Favoritos.
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <div className={styles.brandLogo}>
          <Boxes size={19} color="#fff" aria-hidden="true" />
        </div>
        <div className={styles.brandText}>
          <div className={styles.brandWordmark}>
            Lyra <span className={styles.brandProduct}>WatchLog</span>
          </div>
          <div className={styles.brandTagline}>{t("shell.brandTagline")}</div>
        </div>
        <button
          type="button"
          className={styles.collapseBtn}
          onClick={toggleSidebar}
          aria-label={t("shell.collapse")}
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      <div className={styles.sidebarScroll}>
        {groups.map((g) => {
          // El grupo del ítem activo se muestra SIEMPRE, aunque esté plegado.
          const hasActive = g.routes.some((r) => isRouteActive(r.path, pathname));
          const open = !collapsedNavGroups[g.group.id] || hasActive;
          return (
            <div key={g.group.id} className={styles.navGroup}>
              <button
                type="button"
                className={styles.navGroupHeader}
                onClick={() => toggleNavGroup(g.group.id)}
                aria-expanded={open}
              >
                <span className={styles.navGroupLabel}>{t(g.group.labelKey)}</span>
                <ChevronDown
                  size={13}
                  className={cx(styles.navGroupChevron, !open && styles.navGroupChevronClosed)}
                  aria-hidden="true"
                />
              </button>
              {open && g.routes.map(renderItem)}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
