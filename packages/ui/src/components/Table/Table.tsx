import { useState, useEffect, type ReactNode } from "react";
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "../../cx.js";
import { Skeleton } from "../Skeleton/Skeleton.js";
import styles from "./Table.module.css";

export interface TableColumn<T> {
  key: string;
  header: ReactNode;
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
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyState?: ReactNode;
  sort?: TableSort;
  onSort?: (key: string, direction: "asc" | "desc") => void;
  onRowClick?: (row: T) => void;
  className?: string;
  /** Habilita paginación cliente con controles en el footer. */
  paginated?: boolean;
  /** Tamaño de página inicial. Por defecto 10. */
  defaultPageSize?: number;
  /** Opciones del selector de tamaño. Por defecto [10, 25, 50]. */
  pageSizeOptions?: number[];
}

/** Calcula los números de página a mostrar, insertando "..." donde corresponde. */
function getPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 1;
  const range: number[] = [];
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) {
    range.push(i);
  }
  const result: (number | "...")[] = [1];
  if ((range[0] ?? 0) > 2) result.push("...");
  result.push(...range);
  if ((range[range.length - 1] ?? 0) < total - 1) result.push("...");
  result.push(total);
  return result;
}

export function Table<T>({
  columns,
  data,
  rowKey,
  loading = false,
  skeletonRows = 5,
  emptyState,
  sort,
  onSort,
  onRowClick,
  className,
  paginated = false,
  defaultPageSize = 10,
  pageSizeOptions = [10, 25, 50],
}: TableProps<T>) {
  const [page, setPage]         = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // Resetear a página 1 cuando los datos cambian
  useEffect(() => { setPage(1); }, [data.length]);

  function handleSort(key: string) {
    if (!onSort) return;
    onSort(key, sort?.key === key && sort.direction === "asc" ? "desc" : "asc");
  }

  const total       = data.length;
  const pages       = paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage    = Math.min(page, pages);
  const startIndex  = paginated ? (safePage - 1) * pageSize : 0;
  const endIndex    = paginated ? Math.min(startIndex + pageSize, total) : total;
  const visible     = paginated ? data.slice(startIndex, endIndex) : data;
  const pageNums    = getPageNumbers(safePage, pages);

  const showFooter  = paginated && !loading && total > 0;

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
                  col.align === "right"  && styles.thRight,
                  col.align === "center" && styles.thCenter,
                )}
                style={col.width != null ? { width: col.width } : undefined}
                onClick={col.sortable ? () => handleSort(col.key) : undefined}
              >
                <span className={styles.thInner}>
                  {col.header}
                  {col.sortable && (
                    sort?.key === col.key ? (
                      sort.direction === "asc"
                        ? <ChevronUp   size={12} className={cx(styles.sortIcon, styles.sortActive)} />
                        : <ChevronDown size={12} className={cx(styles.sortIcon, styles.sortActive)} />
                    ) : (
                      <ChevronsUpDown size={12} className={styles.sortIcon} />
                    )
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody className={styles.tbody}>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i} className={styles.skeletonRow}>
                {columns.map((col) => (
                  <td key={col.key} className={styles.td}>
                    <Skeleton height={14} width={col.align === "right" ? "35%" : "60%"} />
                  </td>
                ))}
              </tr>
            ))
          ) : visible.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.emptyTd}>
                {emptyState}
              </td>
            </tr>
          ) : (
            visible.map((row, i) => (
              <tr
                key={rowKey(row)}
                className={cx(styles.dataRow, onRowClick && styles.clickable)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cx(
                      styles.td,
                      col.align === "right"  && styles.tdRight,
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

      {/* Footer de paginación */}
      {showFooter && (
        <div className={styles.footer}>
          <span className={styles.footerInfo}>
            {startIndex + 1}–{endIndex} de {total}
          </span>

          <div className={styles.footerControls}>
            {/* Selector de tamaño */}
            <select
              className={styles.pageSizeSelect}
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              aria-label="Filas por página"
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s}>{s} por pág.</option>
              ))}
            </select>

            {/* Navegación */}
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              aria-label="Página anterior"
            >
              <ChevronLeft size={15} />
            </button>

            {pageNums.map((n, idx) =>
              n === "..." ? (
                <span key={`ellipsis-${idx}`} className={styles.pageEllipsis}>…</span>
              ) : (
                <button
                  key={n}
                  type="button"
                  className={cx(styles.pageBtn, n === safePage && styles.pageBtnActive)}
                  onClick={() => setPage(n)}
                  aria-label={`Página ${n}`}
                  aria-current={n === safePage ? "page" : undefined}
                >
                  {n}
                </button>
              )
            )}

            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={safePage >= pages}
              aria-label="Página siguiente"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
