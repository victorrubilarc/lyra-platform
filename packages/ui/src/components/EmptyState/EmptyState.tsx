import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Acción opcional (p. ej. un botón). */
  action?: ReactNode;
}

/** Estado vacío del Design System: ícono + título + descripción + acción. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      {icon && <div className={styles.icon}>{icon}</div>}
      <div className={styles.title}>{title}</div>
      {description && <p className={styles.desc}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
