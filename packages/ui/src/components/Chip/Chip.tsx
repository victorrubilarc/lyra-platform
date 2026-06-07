import { cx } from "../../cx.js";
import styles from "./Chip.module.css";

export type ChipVariant = "default" | "primary" | "success" | "warning" | "error" | "info";

export interface ChipProps {
  label: string;
  variant?: ChipVariant;
  size?: "sm" | "md";
  className?: string;
}

/** Etiqueta compacta / badge semántico. Nunca usar para decoración: solo semántica. */
export function Chip({ label, variant = "default", size = "sm", className }: ChipProps) {
  return (
    <span className={cx(styles.chip, styles[variant], styles[size], className)}>
      {label}
    </span>
  );
}
