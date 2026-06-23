import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Building2, Check, ChevronDown, Network, Settings2 } from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@lyra/ui";
import { Can } from "../auth/Can.js";
import { useOrgStructures } from "../features/structure/structure-queries.js";
import { useStructureStore } from "./structure-store.js";
import styles from "../features/structure/StructureSelector.module.css";

/** Una estructura está CONFIGURADA cuando tiene al menos un nodo (es operable). */
function isConfigured(s: { nodeCount?: number }): boolean {
  return (s.nodeCount ?? 0) > 0;
}

/**
 * Selector GLOBAL de estructura activa, montado en el topbar. Solo ofrece estructuras
 * CONFIGURADAS (con ≥1 nodo): una estructura vacía no es un contexto operativo válido.
 * Como vive siempre, es también el punto donde se SANEA la estructura activa: si la
 * guardada dejó de ser accesible, o quedó vacía mientras navegas FUERA de la pantalla
 * de configuración, vuelve a la por defecto — así ninguna pantalla operativa queda
 * "vacía" o mostrando datos de otra estructura. En la pantalla de Estructura
 * (`/estructura`) NO se sanea, para poder trabajar dentro de una estructura recién
 * creada (aún sin nodos) y configurarla.
 */
export function StructureSwitcher() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { data: structures = [] } = useOrgStructures();
  const activeId = useStructureStore((s) => s.activeStructureId);
  const setActive = useStructureStore((s) => s.setActiveStructure);

  const onConfigPage = pathname.startsWith("/estructura");

  // Saneo global de la estructura activa.
  useEffect(() => {
    if (structures.length === 0 || !activeId) return;
    const active = structures.find((s) => s.id === activeId);
    const inaccessible = !active;
    const emptyOutsideConfig = active && !isConfigured(active) && !onConfigPage;
    if (inaccessible || emptyOutsideConfig) setActive(null);
  }, [structures, activeId, setActive, onConfigPage]);

  // Solo se ofrecen estructuras configuradas; en config se incluye también la activa
  // (aunque esté vacía) para no perder de vista dónde estás mientras la armas.
  const selectable = structures.filter((s) => isConfigured(s) || (onConfigPage && s.id === activeId));

  // En instalaciones con una sola estructura configurada, el conmutador no aporta nada.
  if (selectable.length < 2) return null;

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
      {selectable.map((s) => (
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
