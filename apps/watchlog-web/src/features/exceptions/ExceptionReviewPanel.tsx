import { useMemo, useState } from "react";
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronRight, HelpCircle, Layers } from "lucide-react";
import type { ExceptionListQuery, LogEntryExceptionDto } from "@lyra/contracts";
import { Button, Spinner } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { useExceptions, useExceptionSummary } from "./exceptions-queries.js";
import { ExceptionCard } from "./ExceptionCard.js";
import { ExceptionDetailDrawer } from "./ExceptionDetailDrawer.js";
import { ConvertExceptionModal } from "./ConvertExceptionModal.js";
import styles from "./exceptions.module.css";

interface Props {
  logEntryId: string;
  /** Abre el cuerpo por defecto (p. ej. cuando hay críticas). */
  defaultOpen?: boolean;
}

/**
 * Panel de revisión de excepciones de UNA entrada de bitácora (Fase 4.1.1).
 * Inline plegable: cabecera con el resumen (críticas/advertencias/inválidas) y,
 * al expandir, la lista accionable con selección múltiple para agrupar. No se
 * monta si la entrada no tiene excepciones (cero ruido).
 */
export function ExceptionReviewPanel({ logEntryId, defaultOpen }: Props) {
  const { can } = usePermissions();
  const { data: summary } = useExceptionSummary(logEntryId);
  const [open, setOpen] = useState(!!defaultOpen);
  const query: ExceptionListQuery = useMemo(() => ({ logEntryId, sort: "severity", pageSize: 100 }), [logEntryId]);
  const { data, isLoading } = useExceptions(query, open);

  const [selId, setSelId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  if (!summary || summary.total === 0) return null;

  const items: LogEntryExceptionDto[] = data?.items ?? [];
  const accent = summary.critical > 0 ? "#EF4444" : summary.warning > 0 ? "#F59E0B" : "#06B6D4";
  const canConvert = can("exception:triage") && can("incident:create");

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const selectedIds = [...selected].filter((id) => items.some((i) => i.id === id));

  return (
    <section className={styles.panel} aria-label="Revisión de excepciones">
      <button className={styles.panelHead} style={{ ["--panelAccent" as string]: accent }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? <ChevronDown size={16} className={styles.chevron} /> : <ChevronRight size={16} className={styles.chevron} />}
        <span className={styles.panelTitle}><AlertTriangle size={16} style={{ color: accent }} /> Revisión de excepciones</span>
        <span className={styles.panelChips}>
          {summary.critical > 0 && <span className={styles.countChip} style={{ color: "#EF4444", borderColor: "#EF4444" }}><AlertOctagon size={12} /> {summary.critical} {summary.critical === 1 ? "crítica" : "críticas"}</span>}
          {summary.warning > 0 && <span className={styles.countChip} style={{ color: "#F59E0B", borderColor: "#F59E0B" }}><AlertTriangle size={12} /> {summary.warning} {summary.warning === 1 ? "advertencia" : "advertencias"}</span>}
          {summary.invalid > 0 && <span className={styles.countChip} style={{ color: "#06B6D4", borderColor: "#06B6D4" }}><HelpCircle size={12} /> {summary.invalid} posibles inválidos</span>}
          {summary.open > 0 && <span className={styles.countChip} style={{ color: "#9AA3B8", borderColor: "var(--color-border-subtle)" }}>{summary.open} sin resolver</span>}
        </span>
      </button>

      {open && (
        <div className={styles.panelBody}>
          {isLoading ? (
            <div className={styles.center}><Spinner /></div>
          ) : items.length === 0 ? (
            <p className={styles.muted}>No hay excepciones que mostrar.</p>
          ) : (
            <>
              {canConvert && selectedIds.length > 1 && (
                <div className={styles.bulkBar}>
                  <span className={styles.bulkCount}>{selectedIds.length} seleccionadas</span>
                  <Button variant="primary" leftIcon={<Layers size={15} />} onClick={() => setBulkOpen(true)}>Agrupar en una incidencia</Button>
                  <Button variant="secondary" onClick={() => setSelected(new Set())}>Limpiar</Button>
                </div>
              )}
              <div className={styles.cards}>
                {items.map((exc) => (
                  <ExceptionCard
                    key={exc.id}
                    exc={exc}
                    onOpen={setSelId}
                    selectable={canConvert}
                    selected={selected.has(exc.id)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      <ExceptionDetailDrawer exceptionId={selId} onClose={() => setSelId(null)} />

      <ConvertExceptionModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        exceptionIds={selectedIds}
        anchorExceptionId={selectedIds[0] ?? null}
        onDone={() => { setBulkOpen(false); setSelected(new Set()); }}
      />
    </section>
  );
}
