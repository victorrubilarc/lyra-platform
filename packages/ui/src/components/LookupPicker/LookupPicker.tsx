import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cx } from "../../cx.js";
import { Button } from "../Button/Button.js";
import { Checkbox } from "../Checkbox/Checkbox.js";
import { Input } from "../Input/Input.js";
import { Modal } from "../Modal/Modal.js";
import { Table, type TableColumn } from "../Table/Table.js";
import styles from "./LookupPicker.module.css";

export interface LookupOption {
  value: string;
  label: string;
  /** Código/clave estable (columna propia en la tabla). */
  hint?: string;
  /** Detalle adicional opcional (3.ª columna, ej. resumen de metadata). */
  detail?: string;
}

export interface LookupPickerProps {
  options: LookupOption[];
  /** Selección actual (en single se usa el primer elemento). */
  value: string[];
  onChange: (value: string[]) => void;
  /** Selección múltiple (default). En single, elegir una fila confirma y cierra. */
  multiple?: boolean;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  /** Título del diálogo. */
  title?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  noMatchText?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  clearLabel?: string;
  codeHeader?: string;
  labelHeader?: string;
  detailHeader?: string;
  /** Resumen del trigger con N seleccionados, ej. "{n} seleccionados". */
  summaryText?: (n: number) => string;
  ariaLabel?: string;
}

const norm = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Selector por DIÁLOGO con tabla (patrón "value help" de SAP Fiori / lookup de
 * Salesforce): trigger compacto que abre un modal con búsqueda + tabla paginada
 * + selección con checkbox; la selección es un BORRADOR que se aplica al
 * confirmar (en single, elegir una fila confirma y cierra). Bajo el campo, la
 * selección vigente se muestra como tokens removibles con ×. Pensado para
 * catálogos grandes donde un combo no basta (más columnas, paginación, conteo).
 * Dual-theme, área táctil 44px.
 */
export function LookupPicker({
  options,
  value,
  onChange,
  multiple = true,
  id,
  disabled,
  placeholder = "Seleccionar…",
  title = "Seleccionar",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin opciones",
  noMatchText = "Sin coincidencias",
  confirmLabel = "Aceptar",
  cancelLabel = "Cancelar",
  clearLabel = "Limpiar",
  codeHeader = "Código",
  labelHeader = "Etiqueta",
  detailHeader = "Detalle",
  summaryText = (n) => `${n} seleccionado${n === 1 ? "" : "s"}`,
  ariaLabel,
}: LookupPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string[]>(value);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selected = value.map((v) => byValue.get(v)).filter((o): o is LookupOption => Boolean(o));
  const hasDetail = useMemo(() => options.some((o) => o.detail), [options]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter(
      (o) =>
        norm(o.label).includes(q) ||
        (o.hint ? norm(o.hint).includes(q) : false) ||
        (o.detail ? norm(o.detail).includes(q) : false),
    );
  }, [options, query]);

  // Al abrir, el borrador parte de la selección vigente y la búsqueda se limpia.
  useEffect(() => {
    if (open) {
      setDraft(value);
      setQuery("");
    }
  }, [open]);

  function toggleDraft(v: string) {
    if (!multiple) {
      // Single: elegir confirma y cierra (patrón lookup de Salesforce).
      onChange([v]);
      setOpen(false);
      return;
    }
    setDraft((d) => (d.includes(v) ? d.filter((x) => x !== v) : [...d, v]));
  }

  function confirm() {
    onChange(draft);
    setOpen(false);
  }

  function removeToken(v: string) {
    onChange(value.filter((x) => x !== v));
  }

  const columns: TableColumn<LookupOption>[] = [
    ...(multiple
      ? [
          {
            key: "_check",
            header: "",
            width: 44,
            align: "center" as const,
            render: (row: LookupOption) => (
              <Checkbox
                checked={draft.includes(row.value)}
                onChange={() => toggleDraft(row.value)}
                aria-label={row.label}
              />
            ),
          },
        ]
      : []),
    {
      key: "hint",
      header: codeHeader,
      width: 130,
      sortable: true,
      render: (row) => <span className={styles.codeCell}>{row.hint ?? row.value}</span>,
    },
    { key: "label", header: labelHeader, sortable: true, render: (row) => row.label },
    ...(hasDetail
      ? [
          {
            key: "detail",
            header: detailHeader,
            render: (row: LookupOption) => <span className={styles.detailCell}>{row.detail ?? "—"}</span>,
          },
        ]
      : []),
  ];

  const draftOptions = draft.map((v) => byValue.get(v)).filter((o): o is LookupOption => Boolean(o));

  return (
    <div className={styles.root}>
      <button
        type="button"
        id={id}
        className={cx(styles.trigger, disabled && styles.disabled)}
        aria-haspopup="dialog"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <span className={cx(styles.triggerLabel, selected.length === 0 && styles.placeholder)}>
          {selected.length === 0
            ? placeholder
            : multiple
              ? summaryText(selected.length)
              : (selected[0]?.label ?? placeholder)}
        </span>
        <Search size={15} className={styles.triggerIcon} aria-hidden />
      </button>

      {/* Tokens de la selección vigente, removibles con × (fuera del modal). */}
      {selected.length > 0 && (
        <div className={styles.tokens}>
          {selected.map((o) => (
            <span key={o.value} className={styles.token}>
              <span className={styles.tokenCode}>{o.hint ?? o.value}</span>
              {o.label}
              {!disabled && (
                <button
                  type="button"
                  className={styles.tokenRemove}
                  aria-label={`Quitar ${o.label}`}
                  onClick={() => removeToken(o.value)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        size="lg"
        footer={
          <div className={styles.footer}>
            {multiple && (
              <div className={styles.footerDraft}>
                {draftOptions.map((o) => (
                  <span key={o.value} className={styles.token}>
                    {o.label}
                    <button
                      type="button"
                      className={styles.tokenRemove}
                      aria-label={`Quitar ${o.label}`}
                      onClick={() => toggleDraft(o.value)}
                    >
                      ×
                    </button>
                  </span>
                ))}
                {draft.length > 0 && (
                  <button type="button" className={styles.clearAll} onClick={() => setDraft([])}>
                    {clearLabel}
                  </button>
                )}
              </div>
            )}
            <div className={styles.footerActions}>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {cancelLabel}
              </Button>
              {multiple && (
                <Button variant="primary" onClick={confirm}>
                  {confirmLabel}
                  {draft.length > 0 ? ` (${draft.length})` : ""}
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className={styles.dialogBody}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            rightSlot={<Search size={15} aria-hidden />}
            autoFocus
          />
          <Table
            columns={columns}
            data={filtered}
            rowKey={(r) => r.value}
            onRowClick={(r) => toggleDraft(r.value)}
            paginated
            defaultPageSize={8}
            emptyState={<div className={styles.empty}>{options.length === 0 ? emptyText : noMatchText}</div>}
          />
        </div>
      </Modal>
    </div>
  );
}
