import { Check, Minus } from "lucide-react";
import { cx } from "../../cx.js";
import styles from "./Checkbox.module.css";

export interface CheckboxProps {
  /** Estado marcado (controlado). */
  checked: boolean;
  /** Se llama con el nuevo valor al alternar. */
  onChange: (value: boolean) => void;
  /** Estado indeterminado (ej. grupo parcialmente seleccionado). Visual; al hacer clic pasa a `true`. */
  indeterminate?: boolean;
  disabled?: boolean;
  /** Etiqueta opcional a la derecha (clic en ella también alterna). */
  label?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * Casilla de verificación del Design System. `role="checkbox"`, accesible por
 * teclado (Space/Enter), área táctil 44px. Soporta estado indeterminado para
 * selecciones de grupo (ej. matriz de permisos).
 */
export function Checkbox({
  checked,
  onChange,
  indeterminate = false,
  disabled,
  label,
  id,
  "aria-label": ariaLabel,
}: CheckboxProps) {
  const toggle = () => {
    if (!disabled) onChange(indeterminate ? true : !checked);
  };

  return (
    <label className={cx(styles.wrapper, disabled && styles.disabled)}>
      <button
        type="button"
        role="checkbox"
        id={id}
        aria-label={ariaLabel}
        aria-checked={indeterminate ? "mixed" : checked}
        disabled={disabled}
        className={cx(styles.box, (checked || indeterminate) && styles.on)}
        onClick={toggle}
      >
        {indeterminate ? (
          <Minus size={14} strokeWidth={3} aria-hidden="true" />
        ) : checked ? (
          <Check size={14} strokeWidth={3} aria-hidden="true" />
        ) : null}
      </button>
      {label != null && <span className={styles.label}>{label}</span>}
    </label>
  );
}
