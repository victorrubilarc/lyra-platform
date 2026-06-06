import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cx } from "../../cx.js";
import styles from "./Menu.module.css";

interface MenuCtx {
  close: () => void;
}
const Ctx = createContext<MenuCtx>({ close: () => undefined });

export interface MenuProps {
  /** Elemento que abre el menú (un botón, avatar, etc.). */
  trigger: ReactNode;
  align?: "start" | "end";
  minWidth?: number;
  /** Etiqueta accesible del botón disparador. */
  ariaLabel?: string;
  children: ReactNode;
}

/** Menú desplegable con cierre por click-fuera y Escape. */
export function Menu({ trigger, align = "end", minWidth = 210, ariaLabel, children }: MenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        {trigger}
      </button>
      {open && (
        <Ctx.Provider value={{ close }}>
          <div
            className={cx(styles.panel, align === "end" ? styles.alignEnd : styles.alignStart)}
            role="menu"
            style={{ minWidth }}
          >
            {children}
          </div>
        </Ctx.Provider>
      )}
    </div>
  );
}

export interface MenuItemProps {
  icon?: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Contenido a la derecha (atajo, check, etc.). */
  trailing?: ReactNode;
  children: ReactNode;
}

export function MenuItem({ icon, onSelect, disabled, danger, trailing, children }: MenuItemProps) {
  const { close } = useContext(Ctx);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={cx(styles.item, danger && styles.danger)}
      onClick={() => {
        onSelect?.();
        close();
      }}
    >
      {icon && <span className={styles.itemIcon}>{icon}</span>}
      <span className={styles.itemLabel}>{children}</span>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div className={styles.sep} role="separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className={styles.label}>{children}</div>;
}
