import { useId, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import styles from "./FormField.module.css";

/** Datos que `FormField` inyecta al control para cablear accesibilidad. */
export interface FieldControlProps {
  /** `id` del control; el label apunta aquí con `htmlFor`. */
  id: string;
  /** Valor para `aria-describedby` (apunta al hint y/o al error). */
  describedBy: string | undefined;
  /** `true` cuando hay error (para pasar a `invalid`/`aria-invalid`). */
  invalid: boolean;
}

export interface FormFieldProps {
  /** Texto del label. */
  label: string;
  /** Marca el campo como obligatorio (añade `*`). */
  required?: boolean;
  /** Texto de ayuda bajo el control (oculto cuando hay error). */
  hint?: string;
  /** Mensaje de error; su presencia activa el estado inválido. */
  error?: string;
  /** Control del formulario, como render-prop para cablear id/aria. */
  children: (field: FieldControlProps) => ReactNode;
}

/**
 * Envoltorio de campo de formulario: label (con marca de obligatorio), control
 * y mensaje de error/ayuda, todo cableado con `aria-describedby`/`aria-invalid`.
 */
export function FormField({ label, required, hint, error, children }: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = Boolean(error);
  const describedBy = invalid ? errorId : hint ? hintId : undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {required ? (
          <span className={styles.required} aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {children({ id, describedBy, invalid })}

      {invalid ? (
        <span id={errorId} className={styles.error} role="alert">
          <AlertCircle size={14} aria-hidden="true" />
          {error}
        </span>
      ) : hint ? (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}
