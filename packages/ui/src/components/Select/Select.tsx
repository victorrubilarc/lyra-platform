import { forwardRef, type SelectHTMLAttributes } from "react";
import { cx } from "../../cx.js";
import styles from "./Select.module.css";

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

/**
 * Select primitivo del Design System — mismo look que `Input`.
 * Normalmente se usa dentro de `FormField`.
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(styles.select, invalid && styles.invalid, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});
