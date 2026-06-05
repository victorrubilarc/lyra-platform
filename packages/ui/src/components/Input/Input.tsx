import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../cx.js";
import styles from "./Input.module.css";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Marca visualmente el campo como inválido (borde de error). */
  invalid?: boolean;
  /** Tipografía monoespaciada con tracking (para códigos TOTP/recovery). */
  mono?: boolean;
  /** Contenido a la derecha del input (p. ej. botón mostrar/ocultar). */
  rightSlot?: ReactNode;
}

/**
 * Input primitivo del Design System. Estados default/focus/disabled/error.
 * Normalmente se usa dentro de `FormField`, que aporta label y mensaje de error.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, mono, rightSlot, className, ...rest },
  ref,
) {
  return (
    <span className={styles.wrapper}>
      <input
        ref={ref}
        className={cx(
          styles.input,
          invalid && styles.invalid,
          mono && styles.mono,
          Boolean(rightSlot) && styles.hasRightSlot,
          className,
        )}
        aria-invalid={invalid || undefined}
        {...rest}
      />
      {rightSlot ? <span className={styles.rightSlot}>{rightSlot}</span> : null}
    </span>
  );
});
