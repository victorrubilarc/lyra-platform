import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar.js";
import { Topbar } from "./Topbar.js";
import { WorkspaceTabs } from "./WorkspaceTabs.js";
import { CommandPalette } from "./CommandPalette.js";
import { useUIStore } from "./ui-store.js";
import { useWorkspaceStore } from "./workspace-store.js";
import { useFavoritesStore } from "./favorites-store.js";
import { routeForPath } from "./navigation.js";
import styles from "./AppShell.module.css";

/**
 * Marco premium de la aplicación: sidebar colapsable + top bar + pestañas de
 * trabajo + command palette (⌘K). La densidad se aplica como `data-density`.
 * Cada ruta (salvo la Home) abre una pestaña; el estado de la vista lo preserva
 * la caché de TanStack Query, no este shell.
 */
export function AppShell() {
  const density = useUIStore((s) => s.density);
  const { pathname } = useLocation();
  const openTab = useWorkspaceStore((s) => s.openTab);
  const pushRecent = useFavoritesStore((s) => s.pushRecent);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // ⌘K / Ctrl+K alterna la paleta de comandos.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Sincroniza la ruta actual con pestañas y recientes (la Home no genera pestaña).
  // Las sub-rutas se atribuyen a su módulo padre → UNA sola pestaña por módulo.
  useEffect(() => {
    const route = routeForPath(pathname);
    if (route && route.path !== "/") {
      openTab({ path: route.path });
      pushRecent(route.path);
    }
  }, [pathname, openTab, pushRecent]);

  return (
    <div className={styles.shell} data-density={density}>
      <Sidebar />
      <div className={styles.main}>
        <Topbar onOpenSearch={() => setPaletteOpen(true)} />
        <WorkspaceTabs />
        <div className={styles.content}>
          <Outlet />
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}
