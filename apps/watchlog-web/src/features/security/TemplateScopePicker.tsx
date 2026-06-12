import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, X } from "lucide-react";
import { Checkbox, Input } from "@lyra/ui";
import type { TemplateScopeOption } from "@lyra/contracts";
import styles from "./ScopeTreePicker.module.css";

interface TemplateScopePickerProps {
  options: TemplateScopeOption[];
  /** Ids de plantilla seleccionados (allow-list). Vacío = sin restricción. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/** Normaliza para buscar sin distinción de mayúsculas ni acentos (es-CL). */
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Selector de alcance por PLANTILLA (ABAC dim. 4, 2.º eje — Fase 2.8). Lista
 * plana searchable agrupada por nodo (las globales en su propio grupo). Marcar
 * una plantilla la añade a la allow-list; lista vacía = sin restricción (ve
 * todas). La autorización real la aplica el `ScopeService`; aquí solo se compone
 * la lista. Mismo lenguaje visual que `ScopeTreePicker` (reusa su CSS module).
 */
export function TemplateScopePicker({ options, value, onChange, disabled }: TemplateScopePickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const selected = useMemo(() => new Set(value), [value]);
  const nameById = useMemo(() => new Map(options.map((o) => [o.id, o.name])), [options]);

  const q = norm(query.trim());
  const visible = useMemo(
    () => (q ? options.filter((o) => norm(o.name).includes(q) || (o.orgNodePath && norm(o.orgNodePath).includes(q))) : options),
    [options, q],
  );

  // Agrupa por nodo (orgNodePath); las globales en un grupo propio al final.
  const groups = useMemo(() => {
    const GLOBAL = "￿"; // ordena al final
    const byGroup = new Map<string, { label: string; items: TemplateScopeOption[] }>();
    for (const o of visible) {
      const key = o.orgNodePath ?? GLOBAL;
      const label = o.orgNodePath ?? t("security.users.templateScope.globalGroup");
      const g = byGroup.get(key) ?? { label, items: [] };
      g.items.push(o);
      byGroup.set(key, g);
    }
    return [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, g]) => g);
  }, [visible, t]);

  function setTemplate(id: string, checked: boolean) {
    if (checked) {
      if (selected.has(id)) return;
      onChange([...value, id]);
    } else {
      onChange(value.filter((v) => v !== id));
    }
  }

  if (options.length === 0) {
    return <p className={styles.empty}>{t("security.users.templateScope.noTemplates")}</p>;
  }

  return (
    <div className={styles.picker}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("security.users.templateScope.search")}
        rightSlot={<Search size={15} aria-hidden="true" />}
      />

      {/* Resumen de seleccionados (visible aunque la lista sea enorme). */}
      {value.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.summaryCount}>
            {t("security.users.templateScope.selectedCount", { count: value.length })}
          </span>
          <div className={styles.chips}>
            {value.map((id) => (
              <span key={id} className={styles.chip}>
                {nameById.get(id) ?? id}
                {!disabled && (
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => setTemplate(id, false)}
                    aria-label={t("common.delete")}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!disabled && (
            <button type="button" className={styles.clearBtn} onClick={() => onChange([])}>
              {t("security.users.scope.clear")}
            </button>
          )}
        </div>
      )}

      <div className={styles.tree}>
        {q && visible.length === 0 ? (
          <p className={styles.empty}>{t("security.users.scope.noMatches")}</p>
        ) : (
          groups.map((g) => (
            <Fragment key={g.label}>
              <div className={styles.scopeGroupLabel}>{g.label}</div>
              {g.items.map((o) => (
                <div key={o.id} className={styles.row} style={{ paddingLeft: 18 }}>
                  <Checkbox
                    checked={selected.has(o.id)}
                    disabled={disabled}
                    onChange={(v) => setTemplate(o.id, v)}
                    label={o.name}
                    aria-label={o.name}
                  />
                </div>
              ))}
            </Fragment>
          ))
        )}
      </div>
    </div>
  );
}
