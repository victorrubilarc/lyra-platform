import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "../../cx.js";
import { Spinner } from "../Spinner/Spinner.js";
import styles from "./Button.module.css";

export type ButtonVariant = "primary" | "secondary" | "danger" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Estilo visual. Por defecto `secondary`. La primaria es el gradiente de marca. */
  variant?: ButtonVariant;
  /** Muestra spinner y bloquea la interacción sin perder el ancho del botón. */
  loading?: boolean;
  /** Ocupa el 100% del ancho del contenedor. */
  block?: boolean;
  /** Ícono opcional a la izquierda del texto (Lucide). */
  leftIcon?: ReactNode;
  children?: ReactNode;
}

/**
 * Botón del Design System Lyra. Variantes primary/secondary/danger/icon,
 * estado de carga y área táctil mínima de 44px.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", loading = false, block = false, leftIcon, children, className, disabled, type, ...rest },
  ref,
) {
  const isDisabled = disabled || loading;
  return (
    <button
      ref={ref}
      // Por defecto `button`: evita envíos accidentales de formularios.
      type={type ?? "button"}
      className={cx(styles.button, styles[variant], block && styles.block, className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <span className={styles.spinnerOverlay}>
          <Spinner size={18} label="Cargando" />
        </span>
      )}
      <span className={cx(styles.label, loading && styles.contentLoading)}>
        {leftIcon}
        {children}
      </span>
    </button>
  );
});
