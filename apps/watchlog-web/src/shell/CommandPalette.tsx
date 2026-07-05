import { Command } from "cmdk";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, Languages, LogOut, Monitor, Moon, PanelLeft, Rows3, Search, Sun } from "lucide-react";
import { cx } from "@lyra/ui";
import { usePermissions } from "../auth/use-permissions.js";
import { useLicensedModules } from "../auth/use-license.js";
import { useAuth } from "../auth/use-auth.js";
import { useUIStore } from "./ui-store.js";
import { useThemeStore } from "./theme-store.js";
import { ROUTES } from "./navigation.js";
import { SUPPORTED_LANGUAGES, setLanguage } from "../i18n/i18n.js";
import styles from "./CommandPalette.module.css";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Paleta de comandos (⌘K): saltar a módulos, cambiar preferencias y acciones. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const perms = usePermissions();
  const licensed = useLicensedModules();
  const { signOut } = useAuth();
  const toggleDensity = useUIStore((s) => s.toggleDensity);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setThemePref = useThemeStore((s) => s.setPreference);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  // Igual que el sidebar: módulo LICENCIADO ∧ permiso del usuario (solo oculta).
  const navRoutes = ROUTES.filter(
    (r) => licensed(r.module) && (!r.permission || perms.can(r.permission)),
  );

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label={t("palette.placeholder")}
      className={styles.dialog}
    >
      <div className={styles.inputRow}>
        <Search size={16} className={styles.inputIcon} aria-hidden="true" />
        <Command.Input className={styles.input} placeholder={t("palette.placeholder")} autoFocus />
      </div>
      <Command.List className={styles.list}>
        <Command.Empty className={styles.empty}>{t("palette.noResults")}</Command.Empty>

        <Command.Group heading={t("palette.navigate")}>
          {navRoutes.map((r) => {
            const Icon = r.icon;
            return (
              <Command.Item
                key={r.path}
                className={styles.item}
                value={`${t(r.labelKey)} ${r.path}`}
                onSelect={() => go(r.path)}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{t(r.labelKey)}</span>
              </Command.Item>
            );
          })}
        </Command.Group>

        <Command.Group heading={t("palette.preferences")}>
          <Command.Item className={styles.item} value="densidad density" onSelect={() => run(toggleDensity)}>
            <Rows3 size={16} aria-hidden="true" />
            <span>{t("palette.toggleDensity")}</span>
          </Command.Item>
          <Command.Item className={styles.item} value="menu sidebar" onSelect={() => run(toggleSidebar)}>
            <PanelLeft size={16} aria-hidden="true" />
            <span>{t("palette.toggleSidebar")}</span>
          </Command.Item>
          <Command.Item className={styles.item} value="tema oscuro dark theme" onSelect={() => run(() => setThemePref("dark"))}>
            <Moon size={16} aria-hidden="true" />
            <span>{`${t("palette.theme")}: ${t("theme.dark")}`}</span>
          </Command.Item>
          <Command.Item className={styles.item} value="tema claro light theme" onSelect={() => run(() => setThemePref("light"))}>
            <Sun size={16} aria-hidden="true" />
            <span>{`${t("palette.theme")}: ${t("theme.light")}`}</span>
          </Command.Item>
          <Command.Item className={styles.item} value="tema auto automatico theme" onSelect={() => run(() => setThemePref("auto"))}>
            <Monitor size={16} aria-hidden="true" />
            <span>{`${t("palette.theme")}: ${t("theme.auto")}`}</span>
          </Command.Item>
          {SUPPORTED_LANGUAGES.filter((l) => l.ready).map((l) => (
            <Command.Item
              key={l.code}
              className={styles.item}
              value={`idioma language ${l.code}`}
              onSelect={() => run(() => setLanguage(l.code))}
            >
              <Languages size={16} aria-hidden="true" />
              <span>{t(`languages.${l.code}`)}</span>
              {i18n.language === l.code && <Check size={14} className={styles.itemCheck} />}
            </Command.Item>
          ))}
        </Command.Group>

        <Command.Group heading={t("palette.actions")}>
          <Command.Item
            className={cx(styles.item, styles.itemDanger)}
            value="cerrar sesion logout salir"
            onSelect={() => run(() => void signOut())}
          >
            <LogOut size={16} aria-hidden="true" />
            <span>{t("palette.signOut")}</span>
          </Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
