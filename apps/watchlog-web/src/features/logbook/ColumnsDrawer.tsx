import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, GripVertical, Pin, Plus, RotateCcw, X } from "lucide-react";
import { Button, Checkbox, Drawer, Select } from "@lyra/ui";
import type { TableColumnState } from "@lyra/ui";
import type { LogEntrySortField, LogEntrySortKey } from "@lyra/contracts";
import { DEFAULT_COLUMN_STATE, LOGBOOK_COLUMNS, type LogbookDensity } from "./logbook-views.js";
import styles from "./Logbook.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  columnState: Required<TableColumnState>;
  onColumnStateChange: (next: Required<TableColumnState>) => void;
  density: LogbookDensity;
  onDensityChange: (d: LogbookDensity) => void;
  sorts: LogEntrySortKey[];
  onSortsChange: (s: LogEntrySortKey[]) => void;
}

/** Columnas que aceptan orden server-side (las indexadas). */
const SORTABLE = LOGBOOK_COLUMNS.filter((c) => c.sortField);

export function ColumnsDrawer({
  open,
  onClose,
  columnState,
  onColumnStateChange,
  density,
  onDensityChange,
  sorts,
  onSortsChange,
}: Props) {
  const { t } = useTranslation();
  const [dragKey, setDragKey] = useState<string | null>(null);

  const hidden = new Set(columnState.hidden);
  const pinnedLeft = new Set(columnState.pinnedLeft);
  const pinnedRight = new Set(columnState.pinnedRight);

  function patch(p: Partial<Required<TableColumnState>>) {
    onColumnStateChange({ ...columnState, ...p });
  }

  function toggleHidden(key: string) {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else {
      next.add(key);
      // Ocultar implica desanclar.
      patch({
        hidden: [...next],
        pinnedLeft: columnState.pinnedLeft.filter((k) => k !== key),
        pinnedRight: columnState.pinnedRight.filter((k) => k !== key),
      });
      return;
    }
    patch({ hidden: [...next] });
  }

  function setPin(key: string, side: "left" | "right" | null) {
    const left = columnState.pinnedLeft.filter((k) => k !== key);
    const right = columnState.pinnedRight.filter((k) => k !== key);
    if (side === "left") left.push(key);
    if (side === "right") right.push(key);
    // Anclar implica visible.
    patch({ pinnedLeft: left, pinnedRight: right, hidden: columnState.hidden.filter((k) => k !== key) });
  }

  function reorder(fromKey: string, toKey: string) {
    if (fromKey === toKey) return;
    const order = [...columnState.order];
    const from = order.indexOf(fromKey);
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;
    order.splice(to, 0, order.splice(from, 1)[0]!);
    patch({ order });
  }

  // Orden de presentación de la lista del gestor (sigue el order del estado).
  const ordered = [...columnState.order]
    .map((k) => LOGBOOK_COLUMNS.find((c) => c.key === k))
    .filter((c): c is (typeof LOGBOOK_COLUMNS)[number] => Boolean(c));

  // --- Orden (multi-sort) ---
  function updateSort(i: number, patchKey: Partial<LogEntrySortKey>) {
    const next = sorts.map((s, idx) => (idx === i ? { ...s, ...patchKey } : s));
    onSortsChange(dedupeSorts(next));
  }
  function addSort() {
    const used = new Set(sorts.map((s) => s.field));
    const free = SORTABLE.find((c) => !used.has(c.sortField!));
    if (free && sorts.length < 3) onSortsChange([...sorts, { field: free.sortField!, dir: "desc" }]);
  }
  function removeSort(i: number) {
    const next = sorts.filter((_, idx) => idx !== i);
    onSortsChange(next.length ? next : [{ field: "recordedAt", dir: "desc" }]);
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("logbook.columns.title")}
      footer={
        <div className={styles.drawerFooter}>
          <Button
            variant="secondary"
            leftIcon={<RotateCcw size={14} />}
            onClick={() => {
              onColumnStateChange({ ...DEFAULT_COLUMN_STATE });
              onSortsChange([{ field: "recordedAt", dir: "desc" }]);
              onDensityChange("comfortable");
            }}
          >
            {t("logbook.columns.reset")}
          </Button>
          <Button variant="primary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      <div className={styles.colMgr}>
        {/* Densidad */}
        <section className={styles.colSection}>
          <h4 className={styles.colSectionTitle}>{t("logbook.columns.density")}</h4>
          <div className={styles.densityToggle}>
            {(["comfortable", "compact"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={density === d ? `${styles.densityBtn} ${styles.densityBtnActive}` : styles.densityBtn}
                onClick={() => onDensityChange(d)}
              >
                {t(`logbook.columns.density_${d}`)}
              </button>
            ))}
          </div>
        </section>

        {/* Orden (multi-sort) */}
        <section className={styles.colSection}>
          <h4 className={styles.colSectionTitle}>{t("logbook.columns.sort")}</h4>
          <p className={styles.colHint}>{t("logbook.columns.sortHint")}</p>
          <div className={styles.sortList}>
            {sorts.map((s, i) => (
              <div key={`${s.field}-${i}`} className={styles.sortRow}>
                <span className={styles.sortIndex}>{i + 1}</span>
                <Select
                  value={s.field}
                  onChange={(e) => updateSort(i, { field: e.target.value as LogEntrySortField })}
                >
                  {SORTABLE.map((c) => (
                    <option key={c.sortField} value={c.sortField}>
                      {t(c.labelKey)}
                    </option>
                  ))}
                </Select>
                <button
                  type="button"
                  className={styles.sortDirBtn}
                  title={t(`logbook.columns.dir_${s.dir}`)}
                  onClick={() => updateSort(i, { dir: s.dir === "asc" ? "desc" : "asc" })}
                >
                  {s.dir === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                </button>
                {sorts.length > 1 && (
                  <button type="button" className={styles.iconBtn} title={t("common.delete")} onClick={() => removeSort(i)}>
                    <X size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {sorts.length < 3 && SORTABLE.length > sorts.length && (
            <button type="button" className={styles.addSortBtn} onClick={addSort}>
              <Plus size={14} /> {t("logbook.columns.addSort")}
            </button>
          )}
        </section>

        {/* Columnas */}
        <section className={styles.colSection}>
          <h4 className={styles.colSectionTitle}>{t("logbook.columns.columns")}</h4>
          <p className={styles.colHint}>{t("logbook.columns.columnsHint")}</p>
          <ul className={styles.colList}>
            {ordered.map((col) => {
              const locked = col.locked === true;
              const isHidden = hidden.has(col.key);
              const pin = pinnedLeft.has(col.key) ? "left" : pinnedRight.has(col.key) ? "right" : null;
              return (
                <li
                  key={col.key}
                  className={`${styles.colRow} ${dragKey === col.key ? styles.colRowDragging : ""}`}
                  draggable={!locked}
                  onDragStart={() => !locked && setDragKey(col.key)}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={(e) => {
                    if (dragKey && dragKey !== col.key) e.preventDefault();
                  }}
                  onDrop={() => {
                    if (dragKey) reorder(dragKey, col.key);
                    setDragKey(null);
                  }}
                >
                  <span className={styles.colGrip} aria-hidden>
                    {!locked && <GripVertical size={15} />}
                  </span>
                  <Checkbox
                    checked={!isHidden}
                    disabled={locked}
                    onChange={() => toggleHidden(col.key)}
                    label={t(col.labelKey)}
                  />
                  {!locked && (
                    <div className={styles.colPins}>
                      <button
                        type="button"
                        className={pin === "left" ? `${styles.pinBtn} ${styles.pinBtnActive}` : styles.pinBtn}
                        title={t("logbook.columns.pinLeft")}
                        onClick={() => setPin(col.key, pin === "left" ? null : "left")}
                      >
                        <Pin size={13} /> <span className={styles.pinDir}>L</span>
                      </button>
                      <button
                        type="button"
                        className={pin === "right" ? `${styles.pinBtn} ${styles.pinBtnActive}` : styles.pinBtn}
                        title={t("logbook.columns.pinRight")}
                        onClick={() => setPin(col.key, pin === "right" ? null : "right")}
                      >
                        <Pin size={13} /> <span className={styles.pinDir}>R</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}

/** Quita claves de orden con campo duplicado (la 1.ª gana). */
function dedupeSorts(sorts: LogEntrySortKey[]): LogEntrySortKey[] {
  const seen = new Set<string>();
  const out: LogEntrySortKey[] = [];
  for (const s of sorts) {
    if (!seen.has(s.field)) {
      out.push(s);
      seen.add(s.field);
    }
  }
  return out;
}
