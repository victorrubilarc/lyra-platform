import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, MenuLabel } from "@lyra/ui";
import { useFavoritesStore } from "./favorites-store.js";
import { routeByPath, type NavRoute } from "./navigation.js";
import styles from "./AppShell.module.css";

/**
 * Menú de accesos rápidos (favoritos) en el topbar. Los favoritos se FIJAN
 * desde la estrella de cada ítem del menú lateral; aquí se ACCEDE a ellos
 * (navegar) y se pueden DESFIJAR sin salir del menú. La estrella del topbar
 * se rellena cuando hay al menos un favorito.
 */
export function FavoritesMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const favorites = useFavoritesStore((s) => s.favorites);
  const toggleFavorite = useFavoritesStore((s) => s.toggleFavorite);
  const favRoutes = favorites
    .map(routeByPath)
    .filter((r): r is NavRoute => Boolean(r));

  return (
    <Menu
      ariaLabel={t("shell.favorites")}
      trigger={
        <span className={styles.iconBtn}>
          <Star
            size={18}
            fill={favRoutes.length > 0 ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </span>
      }
    >
      <MenuLabel>{t("shell.favorites")}</MenuLabel>
      {favRoutes.length === 0 ? (
        <div className={styles.menuEmpty}>{t("shell.noFavorites")}</div>
      ) : (
        favRoutes.map((r) => {
          const Icon = r.icon;
          return (
            <MenuItem
              key={r.path}
              icon={<Icon size={16} />}
              trailing={
                <Star
                  size={14}
                  fill="currentColor"
                  className={styles.favMenuUnpin}
                  aria-label={t("shell.unpin")}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(r.path);
                  }}
                />
              }
              onSelect={() => navigate(r.path)}
            >
              {t(r.labelKey)}
            </MenuItem>
          );
        })
      )}
    </Menu>
  );
}
