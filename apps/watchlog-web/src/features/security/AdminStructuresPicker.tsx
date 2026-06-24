import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { Checkbox, Chip, Input } from "@lyra/ui";
import type { OrgStructure } from "@lyra/contracts";
import styles from "./AdminStructuresPicker.module.css";

interface AdminStructuresPickerProps {
  /** Estructuras disponibles para delegar (las que ve el super-admin). */
  structures: OrgStructure[];
  /** Ids de estructura seleccionados (delegados al sujeto). */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

/** Normaliza para buscar sin distinción de mayúsculas ni acentos (es-CL). */
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/**
 * Selector multi-estructura para la administración DELEGADA (L2b): marca qué
 * estructuras puede ADMINISTRAR el sujeto (rol o usuario). Eje DISTINTO del alcance
 * de datos (ABAC por nodo): aquí se delega CONFIGURAR la estructura, no ver sus datos.
 * Solo el super-admin (`module:structure:manage`) edita esto; en otro caso va `disabled`.
 */
export function AdminStructuresPicker({ structures, value, onChange, disabled }: AdminStructuresPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);

  const filtered = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return structures;
    return structures.filter((s) => norm(s.name).includes(q) || norm(s.key).includes(q));
  }, [structures, query]);

  function toggle(id: string, checked: boolean) {
    onChange(checked ? [...value, id] : value.filter((x) => x !== id));
  }

  if (structures.length === 0) {
    return <p className={styles.empty}>{t("security.adminStructures.none")}</p>;
  }

  return (
    <div className={styles.root}>
      {structures.length > 6 && (
        <div className={styles.search}>
          <Search size={15} aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("security.adminStructures.search")}
            aria-label={t("security.adminStructures.search")}
          />
        </div>
      )}
      <ul className={styles.list}>
        {filtered.map((s) => (
          <li key={s.id} className={styles.item}>
            <Checkbox
              checked={selected.has(s.id)}
              onChange={(v) => toggle(s.id, v)}
              disabled={disabled}
              aria-label={s.name}
              label={s.name}
            />
            <span className={styles.tags}>
              {s.isDefault && <Chip label={t("security.adminStructures.default")} variant="info" />}
              {!s.active && <Chip label={t("security.adminStructures.archived")} variant="default" />}
            </span>
          </li>
        ))}
        {filtered.length === 0 && <li className={styles.noMatch}>{t("security.adminStructures.noMatch")}</li>}
      </ul>
    </div>
  );
}
