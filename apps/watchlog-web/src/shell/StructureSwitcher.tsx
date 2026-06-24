import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, Search, Settings2 } from "lucide-react";
import { Menu, MenuItem, MenuSeparator } from "@lyra/ui";
import type { OrgStructure } from "@lyra/contracts";
import { Can } from "../auth/Can.js";
import { useOrgStructures } from "../features/structure/structure-queries.js";
import { accentOf, iconComponentOf } from "../features/structure/structure-identity.js";
import { useStructureStore } from "./structure-store.js";
import styles from "../features/structure/StructureSelector.module.css";

/** Operable = tiene al menos un nodo (configurada) y está activa (habilitada). */
function isOperable(s: { nodeCount?: number; active?: boolean }): boolean {
  return (s.nodeCount ?? 0) > 0 && s.active !== false;
}

/** Contenido visual del badge/disparador: ícono en acento + "Estás en" + nombre. */
function BadgeInner({ structure, interactive }: { structure: OrgStructure; interactive: boolean }) {
  const { t } = useTranslation();
  const Icon = iconComponentOf(structure);
  return (
    <span className={styles.badge} data-accent={accentOf(structure)}>
      <span className={styles.badgeIcon}>
        <Icon size={15} aria-hidden="true" />
      </span>
      <span className={styles.badgeText}>
        <span className={styles.badgeLabel}>{t("structure.selector.youAreIn")}</span>
        <span className={styles.badgeName}>{structure.name}</span>
      </span>
      {interactive && <ChevronDown size={15} className={styles.badgeChevron} aria-hidden="true" />}
    </span>
  );
}

/**
 * Contexto de estructura activa, montado en el topbar. Cumple DOS roles a la vez (L3):
 *  · BADGE "Estás en: <estructura>" SIEMPRE visible (con su color/ícono), para que nadie
 *    registre datos en la estructura equivocada.
 *  · SWITCHER pulido (búsqueda + identidad por fila) cuando hay ≥2 estructuras operables.
 * Si solo hay una estructura operable, se muestra como badge ESTÁTICO (sin desplegable).
 *
 * Solo ofrece estructuras CONFIGURADAS (con ≥1 nodo): una vacía no es contexto operativo
 * válido. Como vive siempre, SANEA además la estructura activa: si la guardada dejó de ser
 * accesible, o quedó vacía mientras navegas FUERA de `/estructura`, vuelve a la por defecto.
 */
export function StructureSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: structures = [] } = useOrgStructures();
  const activeId = useStructureStore((s) => s.activeStructureId);
  const setActive = useStructureStore((s) => s.setActiveStructure);
  const [query, setQuery] = useState("");

  const onConfigPage = pathname.startsWith("/estructura");

  // Saneo global de la estructura activa.
  useEffect(() => {
    if (structures.length === 0 || !activeId) return;
    const active = structures.find((s) => s.id === activeId);
    const inaccessible = !active;
    const notOperableOutsideConfig = active && !isOperable(active) && !onConfigPage;
    if (inaccessible || notOperableOutsideConfig) setActive(null);
  }, [structures, activeId, setActive, onConfigPage]);

  // Solo se ofrecen estructuras operables (configuradas + activas); en config se incluye
  // también la activa (aunque esté vacía/inactiva) para no perder de vista dónde estás.
  const selectable = structures.filter((s) => isOperable(s) || (onConfigPage && s.id === activeId));

  const active =
    structures.find((s) => s.id === activeId) ?? structures.find((s) => s.isDefault) ?? structures[0];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return selectable;
    return selectable.filter((s) => s.name.toLowerCase().includes(q) || s.key.toLowerCase().includes(q));
  }, [selectable, query]);

  if (!active) return null;

  // Una sola estructura operable: badge estático (sin desplegable). Igual da contexto.
  if (selectable.length < 2) {
    return <BadgeInner structure={active} interactive={false} />;
  }

  return (
    <Menu
      align="end"
      minWidth={280}
      ariaLabel={t("structure.selector.aria")}
      trigger={<BadgeInner structure={active} interactive />}
    >
      <div className={styles.searchRow}>
        <Search size={14} className={styles.searchIcon} aria-hidden="true" />
        <input
          className={styles.searchInput}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("structure.selector.searchPlaceholder")}
          aria-label={t("structure.selector.searchPlaceholder")}
          autoFocus
        />
      </div>
      <div className={styles.menuScroll} role="none">
        {filtered.length === 0 ? (
          <div className={styles.noMatches}>{t("structure.selector.noMatches")}</div>
        ) : (
          filtered.map((s) => {
            const Icon = iconComponentOf(s);
            return (
              <MenuItem
                key={s.id}
                icon={
                  <span className={styles.itemDot} data-accent={accentOf(s)}>
                    <Icon size={14} aria-hidden="true" />
                  </span>
                }
                trailing={active.id === s.id ? <Check size={15} /> : undefined}
                onSelect={() => setActive(s.isDefault ? null : s.id)}
              >
                {s.name}
              </MenuItem>
            );
          })
        )}
      </div>
      <Can perform="orglevel:manage">
        <MenuSeparator />
        <MenuItem icon={<Settings2 size={15} />} onSelect={() => navigate("/estructura")}>
          {t("structure.selector.manage")}
        </MenuItem>
      </Can>
    </Menu>
  );
}
