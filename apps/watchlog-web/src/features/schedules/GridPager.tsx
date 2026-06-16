import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button, Select } from "@lyra/ui";
import styles from "./GridPager.module.css";

interface Props {
  page: number;        // 0-based
  pages: number;
  total: number;
  pageSize: number;
  unit?: string;       // "horarios" / "rondas"
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  pageSizeOptions?: number[];
}

/** Paginador premium reutilizable (se monta ARRIBA y ABAJO de cada grilla). */
export function GridPager({ page, pages, total, pageSize, unit = "filas", onPage, onPageSize, pageSizeOptions = [25, 50, 100] }: Props) {
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <div className={styles.pager}>
      <span className={styles.range}>
        <strong>{from.toLocaleString("es-CL")}–{to.toLocaleString("es-CL")}</strong> de {total.toLocaleString("es-CL")} {unit}
      </span>
      <div className={styles.controls}>
        <Select className={styles.size} value={String(pageSize)} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Filas por página">
          {pageSizeOptions.map((n) => <option key={n} value={n}>{n} por página</option>)}
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
