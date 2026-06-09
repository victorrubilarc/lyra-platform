import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Checkbox, Input } from "@lyra/ui";
import type { PermissionDef } from "@lyra/contracts";
import styles from "./PermissionMatrix.module.css";

/** Normaliza para buscar sin distinción de mayúsculas ni acentos (es-CL). */
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

interface PermissionMatrixProps {
  catalog: PermissionDef[];
  /** Claves seleccionadas. */
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}

/**
 * Matriz de permisos agrupada por `group` del catálogo (fuente de verdad del
 * backend). Permite marcar/desmarcar permisos individuales o un grupo completo
 * (checkbox de grupo con estado indeterminado en selección parcial). La UI solo
 * arma el conjunto; el backend valida las claves al guardar.
 */
export function PermissionMatrix({ catalog, selected, onChange, disabled }: PermissionMatrixProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  function groupLabelRaw(group: string): string {
    const key = `security.permGroups.${group}`;
    const label = t(key);
    return label === key ? group : label;
  }

  // Filtra por clave, descripción o nombre de grupo (sin acentos/mayúsculas).
  const filteredCatalog = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return catalog;
    return catalog.filter(
      (def) =>
        norm(def.key).includes(q) ||
        norm(def.description).includes(q) ||
        norm(groupLabelRaw(def.group)).includes(q),
    );
    // groupLabelRaw depende de t; query y catalog son los disparadores reales.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog, query]);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const def of filteredCatalog) {
      const list = map.get(def.group) ?? [];
      list.push(def);
      map.set(def.group, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredCatalog]);

  function toggleKey(key: string, value: boolean) {
    const next = new Set(selected);
    if (value) next.add(key);
    else next.delete(key);
    onChange(next);
  }

  function toggleGroup(defs: PermissionDef[], value: boolean) {
    const next = new Set(selected);
    for (const d of defs) {
      if (value) next.add(d.key);
      else next.delete(d.key);
    }
    onChange(next);
  }

  return (
    <div className={styles.matrix}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("security.roles.searchPermissions")}
        rightSlot={<Search size={15} aria-hidden="true" />}
      />

      {groups.length === 0 ? (
        <p className={styles.noMatches}>{t("security.roles.noPermissionMatches")}</p>
      ) : (
        groups.map(([group, defs]) => {
        const selectedCount = defs.filter((d) => selected.has(d.key)).length;
        const allSelected = selectedCount === defs.length;
        const partial = selectedCount > 0 && !allSelected;
        return (
          <fieldset key={group} className={styles.group}>
            <legend className={styles.groupHeader}>
              <Checkbox
                checked={allSelected}
                indeterminate={partial}
                disabled={disabled}
                onChange={(v) => toggleGroup(defs, v)}
                label={groupLabelRaw(group)}
                aria-label={groupLabelRaw(group)}
              />
              <span className={styles.groupCount}>
                {selectedCount}/{defs.length}
              </span>
            </legend>

            <div className={styles.perms}>
              {defs.map((def) => (
                <label key={def.key} className={styles.permRow}>
                  <Checkbox
                    checked={selected.has(def.key)}
                    disabled={disabled}
                    onChange={(v) => toggleKey(def.key, v)}
                    aria-label={def.key}
                  />
                  <span className={styles.permInfo}>
                    <span className={styles.permKey}>{def.key}</span>
                    <span className={styles.permDesc}>{def.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          );
        })
      )}
    </div>
  );
}
