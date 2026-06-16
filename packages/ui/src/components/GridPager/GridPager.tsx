import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "../Button/Button.js";
import { Select } from "../Select/Select.js";
import styles from "./GridPager.module.css";

export interface GridPagerProps {
  /** Página actual (0-based). */
  page: number;
  /** Total de páginas. */
  pages: number;
  /** Total de filas. */
  total: number;
  pageSize: number;
  /** Unidad del rango ("filas", "plantillas", "rondas"…). */
  unit?: string;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  pageSizeOptions?: number[];
}

/**
 * Paginador premium REUTILIZABLE del Design System. Convención del producto: se
 * monta ARRIBA y ABAJO de cada grilla (rango "X–Y de N", selector de tamaño,
 * navegación primera/anterior/siguiente/última). Promovido desde features/schedules.
 */
export function GridPager({
  page,
  pages,
  total,
  pageSize,
  unit = "filas",
  onPage,
  onPageSize,
  pageSizeOptions = [25, 50, 100],
}: GridPagerProps) {
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className={styles.pager}>
      <span className={styles.range}>
        <strong>
          {from.toLocaleString("es-CL")}–{to.toLocaleString("es-CL")}
        </strong>{" "}
        de {total.toLocaleString("es-CL")} {unit}
      </span>
      <div className={styles.controls}>
        <Select className={styles.size} value={String(pageSize)} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Filas por página">
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>
              {n} por página
            </option>
          ))}
        </Select>
        <div className={styles.nav}>
          <Button variant="icon" aria-label="Primera página" disabled={page === 0} onClick={() => onPage(0)}><ChevronsLeft size={16} /></Button>
          <Button variant="icon" aria-label="Anterior" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></Button>
          <span className={styles.page}>Pág. {page + 1} / {pages}</span>
          <Button variant="icon" aria-label="Siguiente" disabled={page >= pages - 1} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></Button>
          <Button variant="icon" aria-label="Última página" disabled={page >= pages - 1} onClick={() => onPage(pages - 1)}><ChevronsRight size={16} /></Button>
        </div>
      </div>
    </div>
  );
}
