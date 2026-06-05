import { NavLink, Outlet } from "react-router-dom";
import {
  Boxes,
  LayoutDashboard,
  LogOut,
  Network,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Button, cx } from "@lyra/ui";
import type { Permission } from "@lyra/permissions";
import { useAuth } from "../auth/use-auth.js";
import { usePermissions } from "../auth/use-permissions.js";
import styles from "./AppLayout.module.css";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Permiso de módulo que habilita la sección (la UI solo oculta). */
  permission?: Permission;
  /** Módulo aún no construido: se muestra deshabilitado con badge "Pronto". */
  soon?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Inicio", icon: LayoutDashboard },
  {
    to: "/estructura",
    label: "Estructura",
    icon: Network,
    permission: "module:structure:view",
    soon: true,
  },
  {
    to: "/seguridad",
    label: "Seguridad",
    icon: ShieldCheck,
    permission: "module:security:view",
    soon: true,
  },
];

/** Iniciales para el avatar a partir del nombre visible. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Layout principal de la app autenticada: sidebar Lyra + área de contenido. */
export function AppLayout() {
  const { user, signOut } = useAuth();
  const perms = usePermissions();

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <Boxes size={20} color="#fff" />
          </div>
          <div>
            <div className={styles.brandWordmark}>
              Lyra <span className={styles.brandProduct}>WatchLog</span>
            </div>
            <div className={styles.brandSubtitle}>Bitácora operacional</div>
          </div>
        </div>

        <div className={styles.navSectionLabel}>Módulos</div>
        {NAV_ITEMS.map((item) => {
          // Oculta el ítem si el usuario no tiene el permiso de módulo.
          if (item.permission && !perms.can(item.permission)) return null;
          const Icon = item.icon;

          if (item.soon) {
            return (
              <div key={item.to} className={cx(styles.navItem, styles.navItemDisabled)} aria-disabled>
                <span className={styles.navIcon}>
                  <Icon size={18} aria-hidden="true" />
                </span>
                <span className={styles.navLabel}>{item.label}</span>
                <span className={styles.soonBadge}>Pronto</span>
              </div>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => cx(styles.navItem, isActive && styles.navItemActive)}
            >
              <span className={styles.navIcon}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className={styles.navLabel}>{item.label}</span>
            </NavLink>
          );
        })}

        <div className={styles.sidebarFooter}>
          {user && (
            <div className={styles.userCard}>
              <div className={styles.avatar}>{initials(user.displayName)}</div>
              <div className={styles.userMeta}>
                <div className={styles.userName}>{user.displayName}</div>
                <div className={styles.userEmail}>{user.email}</div>
              </div>
            </div>
          )}
          <Button
            variant="secondary"
            block
            leftIcon={<LogOut size={16} />}
            onClick={() => void signOut()}
          >
            Cerrar sesión
          </Button>
        </div>
      </aside>

      <div className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}
