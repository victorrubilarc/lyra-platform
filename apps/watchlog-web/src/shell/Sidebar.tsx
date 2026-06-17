import { Fragment, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { Boxes, ChevronDown, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "@lyra/ui";
import { usePermissions } from "../auth/use-permissions.js";
import { useUIStore } from "./ui-store.js";
import { useFavoritesStore } from "./favorites-store.js";
import { SIDEBAR_ROUTES, buildNavGroups, isRouteActive, type NavRoute } from "./navigation.js";
import styles from "./AppShell.module.css";

/**
 * Ítem del riel colapsado: ícono que se magnifica al pasar el mouse (estilo dock
 * de macOS) + tooltip con el nombre del módulo renderizado por PORTAL. El portal
 * es necesario porque el contenedor del riel tiene scroll (overflow), que
 * recortaría un tooltip CSS posicionado a su derecha.
 */
function RailNavItem({ route, label, isActive }: { route: NavRoute; label: string; isActive: boolean }) {
  const navigate = useNavigate();
  const Icon = route.icon;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setTip({ top: r.top + r.height / 2, left: r.right + 12 });
  }
  function hide() {
    setTip(null);
  }

  return (
    <div className={cx(styles.navItem, styles.navItemRail, isActive && styles.navItemActive)}>
      <button
        ref={btnRef}
        type="button"
        className={styles.navMain}
        onClick={() => {
          hide();
          navigate(route.path);
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        aria-label={label}
      >
        <span className={styles.navIcon}>
          <Icon size={19} aria-hidden="true" />
        </span>
      </button>
      {tip &&
        createPortal(
          <span
            className={styles.railTip}
            style={{ top: tip.top, left: tip.left }}
            role="tooltip"
          >
            {label}
          </span>,
          document.body,
        )}
    </div>
  );
}

/**
 * Menú lateral colapsable (completo ↔ riel de íconos) organizado en grupos con
 * encabezado (Operación · Diseño y datos · Administración). Los grupos pliegan/
 * despliegan con estado persistido; el grupo del ítem activo se muestra SIEMPRE
 * (aunque esté plegado). En el riel de íconos no hay encabezados ni plegado: los
 * grupos se separan con divisores sutiles y cada ícono se magnifica al hover con
 * un tooltip por portal. Los FAVORITOS se fijan aquí (estrella por ítem) pero se
 * ACCEDEN desde el menú de favoritos del topbar (`FavoritesMenu`).
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

  /** Render de ítem para el menú EXPANDIDO (texto + estrella de favorito). */
  function renderItem(route: NavRoute) {
    const Icon = route.icon;
    const label = t(route.labelKey);
    const isActive = isRouteActive(route.path, pathname);
    const isFav = favorites.includes(route.path);

    return (
      <div key={route.path} className={cx(styles.navItem, isActive && styles.navItemActive)}>
        <button type="button" className={styles.navMain} onClick={() => navigate(route.path)}>
          <span className={styles.navIcon}>
            <Icon size={19} aria-hidden="true" />
          </span>
          <span className={styles.navText}>{label}</span>
          {route.soon && <span className={styles.soonBadge}>{t("common.comingSoon")}</span>}
        </button>
        <button
          type="button"
          className={cx(styles.favStar, isFav && styles.favStarOn)}
          aria-label={isFav ? t("shell.unpin") : t("shell.pin")}
          onClick={() => toggleFavorite(route.path)}
        >
          <Star size={14} fill={isFav ? "currentColor" : "none"} />
        </button>
      </div>
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
              {g.routes.map((r) => (
                <RailNavItem
                  key={r.path}
                  route={r}
                  label={t(r.labelKey)}
                  isActive={isRouteActive(r.path, pathname)}
                />
              ))}
            </Fragment>
          ))}
        </div>
      </aside>
    );
  }

  // ----- Sidebar expandido: grupos con encabezado colapsable.
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
