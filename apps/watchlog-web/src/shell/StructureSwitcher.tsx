import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Check, ChevronDown, Network, Settings2 } from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@lyra/ui";
import { Can } from "../auth/Can.js";
import { useOrgStructures } from "../features/structure/structure-queries.js";
import { useStructureStore } from "./structure-store.js";
import styles from "../features/structure/StructureSelector.module.css";

/**
 * Selector GLOBAL de estructura activa, montado en el topbar. Como vive siempre, es
 * también el punto donde se SANEA la estructura activa: si la guardada dejó de existir
 * o de ser accesible, vuelve a la por defecto. Así ninguna pantalla (calendarios,
 * pickers de nodo de incidencias/bitácoras, etc.) queda "vacía" por una estructura
 * activa fantasma. Solo se muestra si hay ≥2 estructuras (en instalaciones de una sola
 * estructura no estorba). La gestión vive en la pantalla de Estructura.
 */
export function StructureSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: structures = [] } = useOrgStructures();
  const activeId = useStructureStore((s) => s.activeStructureId);
  const setActive = useStructureStore((s) => s.setActiveStructure);

  // Saneo global: una estructura activa que ya no es accesible vuelve a la por defecto.
  useEffect(() => {
    if (structures.length === 0) return;
    if (activeId && !structures.some((s) => s.id === activeId)) setActive(null);
  }, [structures, activeId, setActive]);

  // En instalaciones de una sola estructura, el conmutador no aporta nada.
  if (structures.length < 2) return null;

  const active =
    structures.find((s) => s.id === activeId) ?? structures.find((s) => s.isDefault) ?? structures[0];

  return (
    <Menu
      align="end"
      minWidth={260}
      ariaLabel={t("structure.selector.aria")}
      trigger={
        <span className={styles.trigger}>
          <Network size={16} className={styles.triggerIcon} />
          <span className={styles.triggerLabel}>{active?.name ?? t("structure.selector.loading")}</span>
          <ChevronDown size={15} className={styles.triggerChevron} />
        </span>
      }
    >
      <MenuLabel>{t("structure.selector.title")}</MenuLabel>
      {structures.map((s) => (
        <MenuItem
          key={s.id}
          icon={<Building2 size={15} />}
          trailing={active?.id === s.id ? <Check size={15} /> : undefined}
          onSelect={() => setActive(s.isDefault ? null : s.id)}
        >
          {s.name}
        </MenuItem>
      ))}
      <Can perform="orglevel:manage">
        <MenuSeparator />
        <MenuItem icon={<Settings2 size={15} />} onSelect={() => navigate("/estructura")}>
          {t("structure.selector.manage")}
        </MenuItem>
      </Can>
    </Menu>
  );
}
