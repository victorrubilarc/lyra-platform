import type { ReactNode } from "react";
import { cx } from "../../cx.js";
import styles from "./Tooltip.module.css";

export interface TooltipProps {
  label: string;
  side?: "top" | "right" | "bottom";
  children: ReactNode;
}

/**
 * Tooltip ligero (CSS, sin JS de posicionamiento). Aparece en hover/focus del
 * contenido envuelto. Útil para el menú colapsado a riel de íconos.
 */
export function Tooltip({ label, side = "top", children }: TooltipProps) {
  return (
    <span className={styles.wrap}>
      {children}
      <span className={cx(styles.bubble, styles[side])} role="tooltip">
        {label}
      </span>
    </span>
  );
}
