import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Check, ChevronDown, Network, Settings2 } from "lucide-react";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@lyra/ui";
import { Can } from "../../auth/Can.js";
import { useStructureStore } from "../../shell/structure-store.js";
import { useOrgStructures } from "./structure-queries.js";
import styles from "./StructureSelector.module.css";

interface StructureSelectorProps {
  /** Abre el mantenedor de estructuras (CRUD). */
  onManage: () => void;
}

/**
 * Selector de la ESTRUCTURA ACTIVA del shell (multi-estructura). Cambia qué árbol,
 * niveles y calendarios ve toda la app. Lista solo las estructuras que el usuario
 * alcanza (ABAC en el backend); si solo hay una, igual permite gestionar. La opción
 * "Gestionar estructuras" (gate `orglevel:manage`) abre el mantenedor.
 */
export function StructureSelector({ onManage }: StructureSelectorProps) {
  const { t } = useTranslation();
  const { data: structures = [] } = useOrgStructures();
  const activeId = useStructureStore((s) => s.activeStructureId);
  const setActive = useStructureStore((s) => s.setActiveStructure);

  // Si la estructura activa dejó de ser accesible (o no hay selección), apunta a la
  // por defecto de la lista para que el selector siempre muestre algo coherente.
  useEffect(() => {
    if (structures.length === 0) return;
    if (activeId && !structures.some((s) => s.id === activeId)) setActive(null);
  }, [structures, activeId, setActive]);

  const active = structures.find((s) => s.id === activeId) ?? structures.find((s) => s.isDefault) ?? structures[0];
  const label = active?.name ?? t("structure.selector.loading");

  return (
    <Menu
      align="start"
      minWidth={260}
      ariaLabel={t("structure.selector.aria")}
      trigger={
        <span className={styles.trigger}>
          <Network size={16} className={styles.triggerIcon} />
          <span className={styles.triggerLabel}>{label}</span>
          <ChevronDown size={15} className={styles.triggerChevron} />
        </span>
      }
    >
      <MenuLabel>{t("structure.selector.title")}</MenuLabel>
      {structures.map((s) => {
        const isActive = active?.id === s.id;
        return (
          <MenuItem
            key={s.id}
            icon={<Building2 size={15} />}
            trailing={isActive ? <Check size={15} /> : undefined}
            onSelect={() => setActive(s.isDefault ? null : s.id)}
          >
            {s.name}
          </MenuItem>
        );
      })}
      <Can perform="orglevel:manage">
        <MenuSeparator />
        <MenuItem icon={<Settings2 size={15} />} onSelect={onManage}>
          {t("structure.selector.manage")}
        </MenuItem>
      </Can>
    </Menu>
  );
}
