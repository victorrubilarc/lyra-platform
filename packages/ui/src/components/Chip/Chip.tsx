import { cx } from "../../cx.js";
import styles from "./Chip.module.css";

export type ChipVariant = "default" | "primary" | "success" | "warning" | "error" | "info";

export interface ChipProps {
  label: string;
  variant?: ChipVariant;
  size?: "sm" | "md";
  className?: string;
  /**
   * Chip removible (ej. filtros activos de una grilla): muestra un botón × a la
   * derecha que invoca este callback. Sin callback, el chip es estático.
   */
  onRemove?: () => void;
  /** aria-label del botón de quitar (def. "Quitar"). */
  removeLabel?: string;
}

/** Etiqueta compacta / badge semántico. Nunca usar para decoración: solo semántica. */
export function Chip({ label, variant = "default", size = "sm", className, onRemove, removeLabel = "Quitar" }: ChipProps) {
  return (
    <span className={cx(styles.chip, styles[variant], styles[size], className)}>
      {label}
      {onRemove && (
        <button type="button" className={styles.remove} aria-label={`${removeLabel}: ${label}`} onClick={onRemove}>
          ×
        </button>
      )}
    </span>
  );
}
