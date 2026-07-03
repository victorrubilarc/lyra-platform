import { FilterX } from "lucide-react";
import { Button, Chip } from "@lyra/ui";
import styles from "./filter-chips.module.css";

/** Un filtro activo, mostrado como chip removible. */
export interface FilterChip {
  key: string;
  label: string;
  /** Quita SOLO este filtro. */
  onRemove: () => void;
}

/**
 * Fila de chips de filtros activos con «×» por chip + «Limpiar filtros» (reset
 * total). Reutilizable en toda grilla con drill-down (deja claro QUÉ está filtrado y
 * permite quitarlo). Espejo del patrón ya presente en Bitácoras (LogbookPage). No
 * renderiza nada si no hay filtros activos.
 */
export function FilterChips({ chips, onClear, clearLabel = "Limpiar filtros" }: { chips: FilterChip[]; onClear: () => void; clearLabel?: string }) {
  if (chips.length === 0) return null;
  return (
    <div className={styles.chips}>
      {chips.map((chip) => (
        <Chip key={chip.key} label={chip.label} variant="info" onRemove={chip.onRemove} />
      ))}
      <Button variant="secondary" leftIcon={<FilterX size={14} />} onClick={onClear}>
        {clearLabel}
      </Button>
    </div>
  );
}
