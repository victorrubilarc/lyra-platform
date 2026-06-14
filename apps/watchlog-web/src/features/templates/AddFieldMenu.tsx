import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@lyra/ui";
import type { FieldType } from "@lyra/contracts";
import { FIELD_TYPE_META } from "./builder-model.js";

/**
 * Selector de tipo de campo anclado (popover), reutilizable: la barra "＋ Agregar
 * campo" del lienzo y los puntos de inserción "＋" entre campos lo usan. Al elegir
 * un tipo llama `onPick(type)`, que inserta en la posición correspondiente.
 * Estilo Canva/Google Forms: agregar desde el lienzo, no desde una columna fija.
 */
export function AddFieldMenu({ trigger, onPick }: { trigger: ReactNode; onPick: (type: FieldType) => void }) {
  const { t } = useTranslation();
  const core = FIELD_TYPE_META.filter((m) => m.core);
  const advanced = FIELD_TYPE_META.filter((m) => !m.core);
  return (
    <Menu ariaLabel={t("templates.builder.addFieldMenu")} trigger={trigger} minWidth={230}>
      <MenuLabel>{t("templates.builder.fieldTypesCore")}</MenuLabel>
      {core.map((m) => {
        const Icon = m.icon;
        return (
          <MenuItem key={m.type} icon={<Icon size={15} />} onSelect={() => onPick(m.type)}>
            {t(m.labelKey)}
          </MenuItem>
        );
      })}
      <MenuSeparator />
      <MenuLabel>{t("templates.builder.fieldTypesSpecial")}</MenuLabel>
      {advanced.map((m) => {
        const Icon = m.icon;
        return (
          <MenuItem key={m.type} icon={<Icon size={15} />} onSelect={() => onPick(m.type)}>
            {t(m.labelKey)}
          </MenuItem>
        );
      })}
    </Menu>
  );
}
