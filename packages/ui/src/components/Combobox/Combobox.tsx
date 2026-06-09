import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cx } from "../../cx.js";
import styles from "./Combobox.module.css";

export interface ComboboxOption {
  value: string;
  label: string;
  /** Texto secundario opcional (ej. código/clave). */
  hint?: string;
}

export interface ComboboxProps {
  options: ComboboxOption[];
  /** Valor seleccionado (vacío = ninguno). */
  value: string | null | undefined;
  onChange: (value: string) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  /** No hay opciones en absoluto. */
  emptyText?: string;
  /** La búsqueda no encontró coincidencias. */
  noMatchText?: string;
  /** Permite limpiar la selección (muestra ×). */
  clearable?: boolean;
  ariaLabel?: string;
  /** Estilo inválido (borde rojo). */
  invalid?: boolean;
}

const norm = (s: string): string => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/**
 * Selector ÚNICO con búsqueda (combobox / autocomplete). Escala a catálogos
 * grandes: el panel (portal, acotado y con scroll) permite filtrar por teclado
 * sin alargar la vista. Navegación con flechas + Enter, Escape cierra, opción
 * limpiable. Dual-theme, área táctil 44px. Complementa a `MultiSelect` (múltiple)
 * y `Select` (nativo, listas cortas).
 */
export function Combobox({
  options,
  value,
  onChange,
  id,
  disabled,
  placeholder = "Seleccionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Sin opciones",
  noMatchText = "Sin coincidencias",
  clearable = false,
  ariaLabel,
  invalid,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const byValue = useMemo(() => new Map(options.map((o) => [o.value, o])), [options]);
  const selected = value ? byValue.get(value) : undefined;

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return options;
    return options.filter((o) => norm(o.label).includes(q) || (o.hint ? norm(o.hint).includes(q) : false));
  }, [options, query]);

  function reposition() {
    if (triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
  }

  function toggleOpen() {
    if (disabled) return;
    reposition();
    setOpen((o) => !o);
  }

  // Reposiciona el panel mientras está abierto (scroll/resize de contenedores).
  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    const onScrollResize = () => reposition();
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const selIdx = filtered.findIndex((o) => o.value === value);
    setActive(selIdx >= 0 ? selIdx : 0);
    const onDoc = (e: MouseEvent) => {
      const inTrigger = triggerRef.current?.contains(e.target as Node);
      const inPanel = panelRef.current?.contains(e.target as Node);
      if (!inTrigger && !inPanel) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    const t = setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      clearTimeout(t);
    };
  }, [open]);

  // Mantén el ítem activo dentro del rango al filtrar.
  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  function pick(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = filtered[active];
      if (opt) pick(opt.value);
    }
  }

  // Scroll del ítem activo a la vista.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const node = listRef.current.children[active] as HTMLElement | undefined;
    node?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  return (
    <div className={styles.root}>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        className={cx(styles.trigger, disabled && styles.disabled, invalid && styles.invalid)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggleOpen}
      >
        <span className={cx(styles.triggerLabel, !selected && styles.placeholder)}>
          {selected ? selected.label : placeholder}
        </span>
        {clearable && selected && !disabled && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Limpiar"
            className={styles.clear}
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            ×
          </span>
        )}
        <span className={styles.caret} aria-hidden>
          ▾
        </span>
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={panelRef}
            className={styles.panel}
            role="listbox"
            style={{ position: "fixed", top: rect.bottom + 6, left: rect.left, width: Math.max(rect.width, 240) }}
          >
            <div className={styles.searchRow}>
              <input
                ref={searchRef}
                className={styles.search}
                value={query}
                placeholder={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
              />
            </div>

            {options.length === 0 ? (
              <div className={styles.empty}>{emptyText}</div>
            ) : (
              <div className={styles.list} ref={listRef}>
                {filtered.length === 0 ? (
                  <div className={styles.empty}>{noMatchText}</div>
                ) : (
                  filtered.map((o, i) => {
                    const on = o.value === value;
                    return (
                      <button
                        type="button"
                        key={o.value}
                        role="option"
                        aria-selected={on}
                        className={cx(styles.option, on && styles.optionOn, i === active && styles.optionActive)}
                        onMouseEnter={() => setActive(i)}
                        onClick={() => pick(o.value)}
                      >
                        <span className={styles.optLabel}>
                          {o.label}
                          {o.hint && <span className={styles.optHint}>{o.hint}</span>}
                        </span>
                        {on && (
                          <span className={styles.check} aria-hidden>
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
