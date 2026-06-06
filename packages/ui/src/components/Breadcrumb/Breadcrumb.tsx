import { Fragment } from "react";
import { ChevronRight } from "lucide-react";
import { cx } from "../../cx.js";
import styles from "./Breadcrumb.module.css";

export interface Crumb {
  label: string;
  /** Si se provee, el crumb es navegable (la navegación la decide el consumidor). */
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: Crumb[];
}

/**
 * Ruta de navegación. El último elemento es el actual (no navegable). La
 * navegación real la maneja el consumidor vía `onClick` (UI sin acoplar a router).
 */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav aria-label="Ruta" className={styles.crumbs}>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <Fragment key={`${item.label}-${i}`}>
            {isLast || !item.onClick ? (
              <span className={cx(styles.crumb, isLast && styles.current)} aria-current={isLast ? "page" : undefined}>
                {item.label}
              </span>
            ) : (
              <button type="button" className={styles.crumb} onClick={item.onClick}>
                {item.label}
              </button>
            )}
            {!isLast && <ChevronRight size={14} className={styles.sep} aria-hidden="true" />}
          </Fragment>
        );
      })}
    </nav>
  );
}
