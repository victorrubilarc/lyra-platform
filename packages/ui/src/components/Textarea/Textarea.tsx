import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cx } from "../../cx.js";
import styles from "./Textarea.module.css";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Marca visualmente el campo como inválido (borde de error). */
  invalid?: boolean;
  /** Tipografía monoespaciada (p. ej. editor de opciones una por línea). */
  mono?: boolean;
}

/**
 * Textarea primitivo del Design System. Mismo estilo/tokens que `Input`, con
 * redimensionado vertical. Se usa dentro de `FormField` para label/error.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, mono, className, rows = 3, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cx(styles.textarea, invalid && styles.invalid, mono && styles.mono, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
});
