import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button, Checkbox, Input, Modal } from "@lyra/ui";
import bar from "./MyRoundsPage.module.css";
import styles from "./TemplateFilterModal.module.css";

export interface TemplateOption {
  id: string;
  name: string;
  count: number;
}

interface Props {
  open: boolean;
  options: TemplateOption[];
  selected: Set<string>;
  onApply: (ids: Set<string>) => void;
  onClose: () => void;
}

/**
 * Value help (selector múltiple en modal) de BITÁCORAS para el planificador — patrón
 * F4/Value Help de SAP. Ofrece SOLO las bitácoras que el planificador tiene disponibles
 * (las presentes en sus horarios visibles, ya acotados por ABAC nodo×plantilla). Busca,
 * marca varias y aplica; lo seleccionado se muestra como chips fuera del modal.
 */
export function TemplateFilterModal({ open, options, selected, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<Set<string>>(selected);
  const [q, setQ] = useState("");

  // Sincroniza el borrador al abrir (refleja lo aplicado actualmente).
  useEffect(() => { if (open) { setDraft(new Set(selected)); setQ(""); } }, [open, selected]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options;
  }, [options, q]);

  function toggle(id: string) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Filtrar por bitácoras"
      size="md"
      footer={
        <div className={styles.footer}>
          <span className={styles.count}>{draft.size > 0 ? `${draft.size} seleccionada(s)` : "Ninguna seleccionada"}</span>
          <div className={styles.footerBtns}>
            <Button variant="secondary" onClick={() => setDraft(new Set())} disabled={draft.size === 0}>Quitar todas</Button>
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button onClick={() => { onApply(draft); onClose(); }}>Aplicar</Button>
          </div>
        </div>
      }
    >
      <p className={styles.help}>Elige una o más bitácoras para acotar la lista de horarios. Solo aparecen las que tienes disponibles.</p>
      <div className={bar.searchWrap}>
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar bitácora…"
          aria-label="Buscar bitácora"
          rightSlot={q ? (
            <button type="button" className={bar.searchClear} onClick={() => setQ("")} aria-label="Limpiar"><X size={14} /></button>
          ) : <Search size={16} aria-hidden="true" />}
        />
      </div>
      <ul className={styles.list}>
        {filtered.length === 0 ? (
          <li className={styles.empty}>Sin bitácoras que coincidan.</li>
        ) : (
          filtered.map((o) => (
            <li key={o.id} className={styles.item}>
              <Checkbox checked={draft.has(o.id)} onChange={() => toggle(o.id)} label={o.name} />
              <span className={styles.itemCount}>{o.count}</span>
            </li>
          ))
        )}
      </ul>
    </Modal>
  );
}
