import { useState, useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
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

/**
 * Estado de PRESENTACIÓN de columnas (gestor de columnas, Fase 2.8.1b). Controlado
 * por el padre y persistible en una vista guardada. El `Table` solo RENDERIZA según
 * este estado; la UI de gestión vive aparte. Las claves son `TableColumn.key`.
 */
export interface TableColumnState {
  /** Orden de presentación. Las columnas ausentes conservan su posición original al final. */
  order?: string[];
  hidden?: string[];
  pinnedLeft?: string[];
  pinnedRight?: string[];
  widths?: Record<string, number>;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  emptyState?: ReactNode;
  sort?: TableSort;
  /**
   * Multi-sort (2.8.1b): lista ordenada de claves activas. Si se entrega, el
   * indicador de cabecera muestra el número de prioridad (1, 2, …). Es solo visual;
   * el orden efectivo lo decide el padre. `sort` sigue sirviendo para el caso simple.
   */
  sorts?: TableSort[];
  onSort?: (key: string, direction: "asc" | "desc") => void;
  onRowClick?: (row: T) => void;
  /** Clase por fila (p. ej. realce de excepción/review-by-exception). */
  rowClassName?: (row: T) => string | undefined;
  className?: string;
  /** Densidad de filas (área táctil de terreno vs. más filas a la vista). */
  density?: "comfortable" | "compact";
  /** Estado de columnas controlado (orden/ocultas/ancladas/anchos). */
  columnState?: TableColumnState;
  /** Notifica un nuevo ancho tras arrastrar el borde de la columna (px). */
  onColumnResize?: (key: string, width: number) => void;
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

const DEFAULT_PINNED_WIDTH = 140;

/** Ancho efectivo de una columna en px (estado > prop numérica > default para sticky). */
function widthOf<T>(col: TableColumn<T>, state: TableColumnState | undefined, fallback?: number): number | undefined {
  const fromState = state?.widths?.[col.key];
  if (typeof fromState === "number") return fromState;
  if (typeof col.width === "number") return col.width;
  return fallback;
}

interface DisplayColumn<T> {
  col: TableColumn<T>;
  pinned: "left" | "right" | null;
  offset?: number; // px desde el borde izq/der según pinned
  width?: number;
}

/**
 * Resuelve las columnas a renderizar a partir del estado controlado: aplica orden,
 * oculta, agrupa ancladas (izq → libres → der) y calcula los offsets sticky.
 */
function resolveColumns<T>(columns: TableColumn<T>[], state: TableColumnState | undefined): DisplayColumn<T>[] {
  const byKey = new Map(columns.map((c) => [c.key, c]));
  const hidden = new Set(state?.hidden ?? []);
  const pinnedLeft = (state?.pinnedLeft ?? []).filter((k) => byKey.has(k) && !hidden.has(k));
  const pinnedRight = (state?.pinnedRight ?? []).filter((k) => byKey.has(k) && !hidden.has(k));
  const pinnedSet = new Set([...pinnedLeft, ...pinnedRight]);

  // Orden base: el del estado (filtrado), luego cualquier columna no mencionada.
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const k of state?.order ?? []) {
    if (byKey.has(k) && !seen.has(k)) {
      ordered.push(k);
      seen.add(k);
    }
  }
  for (const c of columns) {
    if (!seen.has(c.key)) {
      ordered.push(c.key);
      seen.add(c.key);
    }
  }

  const middle = ordered.filter((k) => !hidden.has(k) && !pinnedSet.has(k));
  const finalOrder = [...pinnedLeft, ...middle, ...pinnedRight];

  // Offsets sticky acumulados (izq de izquierda a derecha; der de derecha a izquierda).
  const out: DisplayColumn<T>[] = finalOrder.map((k) => {
    const col = byKey.get(k)!;
    const pinned = pinnedLeft.includes(k) ? "left" : pinnedRight.includes(k) ? "right" : null;
    return { col, pinned, width: widthOf(col, state, pinned ? DEFAULT_PINNED_WIDTH : undefined) };
  });

  let leftAcc = 0;
  for (const dc of out) {
    if (dc.pinned === "left") {
      dc.offset = leftAcc;
      leftAcc += dc.width ?? DEFAULT_PINNED_WIDTH;
    }
  }
  let rightAcc = 0;
  for (let i = out.length - 1; i >= 0; i--) {
    const dc = out[i]!;
    if (dc.pinned === "right") {
      dc.offset = rightAcc;
      rightAcc += dc.width ?? DEFAULT_PINNED_WIDTH;
    }
  }
  return out;
}

export function Table<T>({
  columns,
  data,
  rowKey,
  loading = false,
  skeletonRows = 5,
  emptyState,
  sort,
  sorts,
  onSort,
  onRowClick,
  rowClassName,
  className,
  density = "comfortable",
  columnState,
  onColumnResize,
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
    const current = sorts?.find((s) => s.key === key) ?? (sort?.key === key ? sort : undefined);
    onSort(key, current && current.direction === "asc" ? "desc" : "asc");
  }

  const displayColumns = resolveColumns(columns, columnState);
  const colCount = displayColumns.length;

  const total       = data.length;
  const pages       = paginated ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const safePage    = Math.min(page, pages);
  const startIndex  = paginated ? (safePage - 1) * pageSize : 0;
  const endIndex    = paginated ? Math.min(startIndex + pageSize, total) : total;
  const visible     = paginated ? data.slice(startIndex, endIndex) : data;
  const pageNums    = getPageNumbers(safePage, pages);

  const showFooter  = paginated && !loading && total > 0;

  /** Prioridad de orden de una columna (1-based) cuando hay multi-sort. */
  function sortPriority(key: string): number | null {
    if (!sorts || sorts.length < 2) return null;
    const i = sorts.findIndex((s) => s.key === key);
    return i >= 0 ? i + 1 : null;
  }
  function activeSortDir(key: string): "asc" | "desc" | null {
    const s = sorts?.find((x) => x.key === key) ?? (sort?.key === key ? sort : undefined);
    return s ? s.direction : null;
  }

  function cellStyle(dc: DisplayColumn<T>): CSSProperties | undefined {
    const style: CSSProperties = {};
    if (dc.width != null) {
      style.width = dc.width;
      style.minWidth = dc.width;
      style.maxWidth = dc.width;
    } else if (dc.col.width != null) {
      style.width = dc.col.width;
    }
    if (dc.pinned === "left") {
      style.position = "sticky";
      style.left = dc.offset ?? 0;
      style.zIndex = 1;
    } else if (dc.pinned === "right") {
      style.position = "sticky";
      style.right = dc.offset ?? 0;
      style.zIndex = 1;
    }
    return Object.keys(style).length ? style : undefined;
  }

  return (
    <div className={cx(styles.wrapper, density === "compact" && styles.compact, className)}>
      <table className={styles.table}>
        <thead className={styles.thead}>
          <tr>
            {displayColumns.map((dc) => {
              const col = dc.col;
              const dir = activeSortDir(col.key);
              const prio = sortPriority(col.key);
              return (
                <th
                  key={col.key}
                  className={cx(
                    styles.th,
                    col.sortable && styles.thSortable,
                    col.align === "right"  && styles.thRight,
                    col.align === "center" && styles.thCenter,
                    dc.pinned && styles.pinned,
                    dc.pinned === "left" && styles.pinnedLeft,
                    dc.pinned === "right" && styles.pinnedRight,
                  )}
                  style={cellStyle(dc)}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                >
                  <span className={styles.thInner}>
                    {col.header}
                    {col.sortable && (
                      dir ? (
                        dir === "asc"
                          ? <ChevronUp   size={12} className={cx(styles.sortIcon, styles.sortActive)} />
                          : <ChevronDown size={12} className={cx(styles.sortIcon, styles.sortActive)} />
                      ) : (
                        <ChevronsUpDown size={12} className={styles.sortIcon} />
                      )
                    )}
                    {prio != null && <span className={styles.sortPriority}>{prio}</span>}
                  </span>
                  {onColumnResize && (
                    <ColumnResizeGrip
                      width={dc.width ?? (typeof col.width === "number" ? col.width : 160)}
                      onResize={(w) => onColumnResize(col.key, w)}
                    />
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody className={styles.tbody}>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i} className={styles.skeletonRow}>
                {displayColumns.map((dc) => (
                  <td key={dc.col.key} className={styles.td} style={cellStyle(dc)}>
                    <Skeleton height={14} width={dc.col.align === "right" ? "35%" : "60%"} />
                  </td>
                ))}
              </tr>
            ))
          ) : visible.length === 0 ? (
            <tr>
              <td colSpan={colCount} className={styles.emptyTd}>
                {emptyState}
              </td>
            </tr>
          ) : (
            visible.map((row, i) => (
              <tr
                key={rowKey(row)}
                className={cx(styles.dataRow, onRowClick && styles.clickable, rowClassName?.(row))}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {displayColumns.map((dc) => (
                  <td
                    key={dc.col.key}
                    className={cx(
                      styles.td,
                      dc.col.align === "right"  && styles.tdRight,
                      dc.col.align === "center" && styles.tdCenter,
                      dc.pinned && styles.pinned,
                      dc.pinned === "left" && styles.pinnedLeft,
                      dc.pinned === "right" && styles.pinnedRight,
                    )}
                    style={cellStyle(dc)}
                  >
                    {dc.col.render
                      ? dc.col.render(row, i)
                      : String((row as Record<string, unknown>)[dc.col.key] ?? "")}
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

/** Grip de redimensionado de columna (arrastre horizontal). Stretch de 2.8.1b. */
function ColumnResizeGrip({ width, onResize }: { width: number; onResize: (width: number) => void }) {
  const startX = useRef(0);
  const startW = useRef(width);

  function onPointerDown(e: ReactPointerEvent) {
    e.stopPropagation();
    e.preventDefault();
    startX.current = e.clientX;
    startW.current = width;
    const move = (ev: PointerEvent) => {
      const next = Math.max(60, Math.min(1200, startW.current + (ev.clientX - startX.current)));
      onResize(Math.round(next));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return <span className={styles.resizeGrip} onPointerDown={onPointerDown} onClick={(e) => e.stopPropagation()} aria-hidden />;
}
