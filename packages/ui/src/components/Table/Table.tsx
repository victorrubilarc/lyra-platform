import { type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { cx } from "../../cx.js";
import { Skeleton } from "../Skeleton/Skeleton.js";
import styles from "./Table.module.css";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
  /** Renderizador personalizado. Si se omite se usa `String(row[key])`. */
  render?: (row: T, index: number) => ReactNode;
  sortable?: boolean;
  width?: number | string;
  align?: "left" | "center" | "right";
}

export interface TableSort {
  key: string;
  direction: "asc" | "desc";
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  /** Clave estable para cada fila (evita parpadeo en re-renders). */
  rowKey: (row: T) => string;
  loading?: boolean;
  /** Cantidad de filas skeleton mientras carga. Por defecto 4. */
  skeletonRows?: number;
  /** Slot renderizado cuando `data` está vacío. */
  emptyState?: ReactNode;
  sort?: TableSort;
  onSort?: (key: string, direction: "asc" | "desc") => void;
  onRowClick?: (row: T) => void;
  className?: string;
}

/**
 * Tabla premium del Design System Lyra. CSS Modules sobre tokens; funciona en
 * claro y oscuro. Para listas con acciones, incluye el slot de acciones en la
 * última columna usando `render`.
 */
export function Table<T>({
  columns,
  data,
  rowKey,
  loading = false,
  skeletonRows = 4,
  emptyState,
  sort,
  onSort,
  onRowClick,
  className,
}: TableProps<T>) {
  function handleSort(key: string) {
    if (!onSort) return;
    if (sort?.key === key) {
      onSort(key, sort.direction === "asc" ? "desc" : "asc");
    } else {
      onSort(key, "asc");
    }
  }

  return (
    <div className={cx(styles.wrapper, className)}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={cx(
                  styles.th,
                  col.sortable && styles.thSortable,
                  col.align === "right" && styles.thRight,
                  col.align === "center" && styles.thCenter,
                )}
                style={col.width != null ? { width: col.width } : undefined}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className={styles.thInner}>
                  {col.header}
                  {col.sortable &&
                    (sort?.key === col.key ? (
                      sort.direction === "asc" ? (
                        <ChevronUp size={13} className={cx(styles.sortIcon, styles.sortActive)} />
                      ) : (
                        <ChevronDown size={13} className={cx(styles.sortIcon, styles.sortActive)} />
                      )
                    ) : (
                      <ChevronsUpDown size={13} className={styles.sortIcon} />
                    ))}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={styles.tbody}>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={col.key} className={styles.skeletonTd}>
                    <Skeleton height={15} width={col.align === "right" ? "40%" : "65%"} />
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.emptyTd}>
                {emptyState}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? styles.clickable : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cx(
                      styles.td,
                      col.align === "right" && styles.tdRight,
                      col.align === "center" && styles.tdCenter,
                    )}
                  >
                    {col.render
                      ? col.render(row, i)
                      : String((row as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
