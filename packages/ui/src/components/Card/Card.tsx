import type { HTMLAttributes } from "react";
import { cx } from "../../cx.js";
import styles from "./Card.module.css";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Añade glow de marca para destacar (usar con criterio: 1–2 por pantalla). */
  glow?: boolean;
  /** Resalta el borde al pasar el cursor (cards clickeables). */
  hoverable?: boolean;
}

/** Contenedor con glassmorphism del Design System Lyra. */
export function Card({ glow, hoverable, className, ...rest }: CardProps) {
  return (
    <div
      className={cx(styles.card, glow && styles.glow, hoverable && styles.hoverable, className)}
      {...rest}
    />
  );
}
