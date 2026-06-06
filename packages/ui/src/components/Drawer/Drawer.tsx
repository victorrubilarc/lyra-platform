import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cx } from "../../cx.js";
import styles from "./Drawer.module.css";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Ancho del panel (px). Por defecto 480. */
  width?: number;
  side?: "right" | "left";
}

/**
 * Panel lateral deslizante. Para acciones/detalle sin perder el contexto de la
 * vista actual (clave en el patrón "no salir y entrar" del workspace).
 */
export function Drawer({ open, onClose, title, children, footer, width = 480, side = "right" }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay} onMouseDown={onClose}>
      <aside
        className={cx(styles.panel, side === "left" ? styles.left : styles.right)}
        role="dialog"
        aria-modal="true"
        style={{ width }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {title && (
          <div className={styles.header}>
            <div className={styles.title}>{title}</div>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
              <X size={18} />
            </button>
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </aside>
    </div>,
    document.body,
  );
}
