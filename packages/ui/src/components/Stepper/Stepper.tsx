import { Fragment } from "react";
import { Check } from "lucide-react";
import { cx } from "../../cx.js";
import styles from "./Stepper.module.css";

export interface Step {
  /** Identificador estable del paso (key de React + valor de navegación). */
  id: string;
  /** Rótulo corto del paso. */
  label: string;
  /** Descripción opcional bajo el rótulo. */
  hint?: string;
}

export interface StepperProps {
  steps: Step[];
  /** Índice (0-based) del paso ACTUAL. */
  current: number;
  /**
   * Navegación opcional a un paso ya visitado (índice ≤ current). Si se omite, el
   * indicador es puramente informativo. Solo se ofrece para pasos completados (no
   * se puede saltar adelante sin validar los previos).
   */
  onStepClick?: (index: number) => void;
  className?: string;
}

/**
 * Indicador de pasos premium (presentacional) para asistentes/wizards. Muestra los
 * pasos numerados con su estado (completado · actual · pendiente), un conector entre
 * ellos y soporte de teclado/lector de pantalla. La LÓGICA del wizard (validación,
 * avance) vive en el consumidor: este componente solo pinta el progreso. Respeta
 * tokens (claro/oscuro), área táctil 44px e iconografía Lucide.
 */
export function Stepper({ steps, current, onStepClick, className }: StepperProps) {
  return (
    <ol className={cx(styles.stepper, className)} aria-label="Progreso del asistente">
      {steps.map((step, i) => {
        const state = i < current ? "done" : i === current ? "current" : "upcoming";
        const navigable = Boolean(onStepClick) && i < current;
        const Marker = (
          <span className={styles.marker} aria-hidden="true">
            {state === "done" ? <Check size={15} /> : <span className={styles.markerNum}>{i + 1}</span>}
          </span>
        );
        const body = (
          <span className={styles.body}>
            <span className={styles.label}>{step.label}</span>
            {step.hint && <span className={styles.hint}>{step.hint}</span>}
          </span>
        );
        return (
          <Fragment key={step.id}>
            <li className={cx(styles.step, styles[state])} aria-current={state === "current" ? "step" : undefined}>
              {navigable ? (
                <button type="button" className={styles.trigger} onClick={() => onStepClick?.(i)}>
                  {Marker}
                  {body}
                </button>
              ) : (
                <span className={styles.trigger}>
                  {Marker}
                  {body}
                </span>
              )}
            </li>
            {i < steps.length - 1 && <li className={cx(styles.connector, i < current && styles.connectorDone)} aria-hidden="true" />}
          </Fragment>
        );
      })}
    </ol>
  );
}
