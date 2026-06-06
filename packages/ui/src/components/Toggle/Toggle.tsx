import { cx } from "../../cx.js";
import styles from "./Toggle.module.css";

export interface ToggleProps {
  /** Estado encendido/apagado (controlado). */
  checked: boolean;
  /** Se llama con el nuevo valor al alternar. */
  onChange: (value: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  id?: string;
  "aria-label"?: string;
}

/** Switch del Design System. `role="switch"`, accesible por teclado. */
export function Toggle({
  checked,
  onChange,
  disabled,
  size = "md",
  id,
  "aria-label": ariaLabel,
}: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-label={ariaLabel}
      aria-checked={checked}
      disabled={disabled}
      className={cx(styles.toggle, checked && styles.on, size === "sm" && styles.sm)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.knob} />
    </button>
  );
}
