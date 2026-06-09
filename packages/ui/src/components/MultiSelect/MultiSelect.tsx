import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../cx.js";
import { useAnchoredPanel } from "../../internal/useAnchoredPanel.js";
import styles from "./MultiSelect.module.css";

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Texto secundario opcional (ej. clave del rol). */
  hint?: string;
}

export interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  id?: string;
  disabled?: boolean;
  /** Texto cuando no hay nada seleccionado. */
  placeholder?: string;
  searchPlaceholder?: string;
  /** No hay opciones en absoluto. */
  emptyText?: string;
  /** La búsqueda no encontró coincidencias. */
  noMatchText?: string;
  clearLabel?: string;
  selectAllLabel?: string;
  ariaLabel?: string;
  /** Cuántos chips mostrar antes de resumir como "+N". */
  maxChips?: number;
}

const norm = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Selector múltiple con búsqueda y chips (token picker). Escala a catálogos
 * grandes: el trigger resume la selección y el panel (portal, acotado y con
 * scroll) permite buscar y marcar sin alargar la vista. Patrón enterprise tipo
 * "reviewers" / asignación de roles. Dual-theme, área táctil 44px.
 */
export function MultiSelect({
  options,
  value,
  onChange,
  id,
  disabled,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin opciones",
  noMatchText = "Sin coincidencias",
  clearLabel = "Limpiar",
  selectAllLabel = "Seleccionar todos",
  ariaLabel,
  maxChips = 4,
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selected = value.map((v) => byValue.get(v)).filter((o): o is MultiSelectOption => Boolean(o));

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q) || (o.hint ? norm(o.hint).includes(q) : false));
  }, [options, query]);

  const panelStyle = useAnchoredPanel(open, triggerRef, panelRef, [filtered.length]);

  function toggleOpen() {
    if (disabled) return;
    setOpen((o) => !o);
  }

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const inTrigger = triggerRef.current?.contains(e.target as Node);
      const inPanel = panelRef.current?.contains(e.target as Node);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      clearTimeout(t);
    };
  }, [open]);

  function toggleValue(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }

  function selectAllFiltered() {
    const merged = new Set(value);
    filtered.forEach((o) => merged.add(o.value));
    onChange([...merged]);
  }

  const shownChips = selected.slice(0, maxChips);
  const extra = selected.length - shownChips.length;

  return (
    <div className={styles.root}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={cx(styles.trigger, disabled && styles.disabled)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleOpen}
      >
        <span className={styles.triggerContent}>
          {selected.length === 0 ? (
            <span className={styles.placeholder}>{placeholder}</span>
          ) : (
            <>
              {shownChips.map((o) => (
                <span key={o.value} className={styles.chip}>
                  {o.label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Quitar ${o.label}`}
                    className={styles.chipRemove}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!disabled) toggleValue(o.value);
                    }}
                  >
                    ×
                  </span>
                </span>
              ))}
              {extra > 0 && <span className={styles.more}>+{extra}</span>}
            </>
          )}
        </span>
        <span className={styles.caret} aria-hidden>
          ▾
        </span>
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          className={styles.panel}
          role="listbox"
          aria-multiselectable
          style={panelStyle}
        >
          <div className={styles.searchRow}>
            <input
              ref={searchRef}
              className={styles.search}
              value={query}
              placeholder={searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {options.length === 0 ? (
            <div className={styles.empty}>{emptyText}</div>
          ) : (
            <>
              <div className={styles.list}>
                {filtered.length === 0 ? (
                  <div className={styles.empty}>{noMatchText}</div>
                ) : (
                  filtered.map((o) => {
                    const on = value.includes(o.value);
                    return (
                      <button
                        type="button"
                        key={o.value}
                        role="option"
                        aria-selected={on}
                        className={cx(styles.option, on && styles.optionOn)}
                        onClick={() => toggleValue(o.value)}
                      >
                        <span className={cx(styles.box, on && styles.boxOn)} aria-hidden>
                          {on ? "✓" : ""}
                        </span>
                        <span className={styles.optLabel}>
                          {o.label}
                          {o.hint && <span className={styles.optHint}>{o.hint}</span>}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
              <div className={styles.footer}>
                <button type="button" className={styles.action} onClick={selectAllFiltered} disabled={filtered.length === 0}>
                  {selectAllLabel}
                </button>
                <button type="button" className={styles.action} onClick={() => onChange([])} disabled={value.length === 0}>
                  {clearLabel}
                </button>
                <span className={styles.count}>{value.length}/{options.length}</span>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
