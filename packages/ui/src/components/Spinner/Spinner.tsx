import styles from "./Spinner.module.css";

export interface SpinnerProps {
  /** Diámetro en px. Por defecto 18 (UI estándar). */
  size?: number;
  /** Grosor del trazo en px. Por defecto 2. */
  thickness?: number;
  /** Etiqueta accesible; si se omite, el spinner es decorativo (aria-hidden). */
  label?: string;
  className?: string;
}

/**
 * Indicador de carga inline. Hereda el color del contexto (`currentColor`),
 * por lo que sirve dentro de botones, inputs o cualquier superficie.
 */
export function Spinner({ size = 18, thickness = 2, label, className }: SpinnerProps) {
  return (
    <span
      className={className ? `${styles.spinner} ${className}` : styles.spinner}
      style={{ width: size, height: size, borderWidth: thickness }}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
