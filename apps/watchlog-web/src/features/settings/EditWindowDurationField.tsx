import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, Select } from "@lyra/ui";
import styles from "./SettingsPage.module.css";

type Unit = "minutes" | "hours";
const MAX_MINUTES = 525_600; // 365 días

/** Descompone los minutos canónicos en {valor, unidad} para mostrar (horas si es múltiplo). */
function split(minutes: number | null): { value: string; unit: Unit } {
  if (minutes === null || minutes <= 0) return { value: "", unit: "hours" };
  if (minutes % 60 === 0) return { value: String(minutes / 60), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

interface Props {
  /** Valor canónico en MINUTOS (null/0 = sin límite). */
  minutes: number | null;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
  /** Texto cuando el campo está vacío (= sin límite). */
  placeholder?: string;
  /** Persiste al salir del campo en vez de en cada tecla (settings). */
  commitOnBlur?: boolean;
}

/**
 * Campo de DURACIÓN de la ventana de edición (2.7.2): un número + selector de
 * unidad (Minutos / Horas). Internamente todo se normaliza a minutos (unidad
 * canónica de almacenamiento). Vacío ⇒ null (sin límite). Se inicializa una vez
 * desde `minutes` (los dos call-sites lo montan con el dato ya cargado).
 */
export function EditWindowDurationField({ minutes, onChange, disabled, placeholder, commitOnBlur }: Props) {
  const { t } = useTranslation();
  const init = split(minutes);
  const [value, setValue] = useState(init.value);
  const [unit, setUnit] = useState<Unit>(init.unit);

  const toMinutes = (v: string, u: Unit): number | null => {
    const n = Number(v);
    if (v.trim() === "" || !Number.isFinite(n) || n <= 0) return null;
    return Math.min(Math.trunc(n) * (u === "hours" ? 60 : 1), MAX_MINUTES);
  };

  const emit = (v: string, u: Unit) => onChange(toMinutes(v, u));

  return (
    <div className={styles.durationField}>
      <Input
        type="number"
        min={1}
        max={unit === "hours" ? 8760 : MAX_MINUTES}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={t("settings.editWindowDuration")}
        onChange={(e) => {
          setValue(e.target.value);
          if (!commitOnBlur) emit(e.target.value, unit);
        }}
        onBlur={() => commitOnBlur && emit(value, unit)}
        onKeyDown={(e) => e.key === "Enter" && commitOnBlur && emit(value, unit)}
      />
      <Select
        value={unit}
        disabled={disabled}
        aria-label={t("settings.editWindowUnit")}
        onChange={(e) => {
          const u = e.target.value as Unit;
          setUnit(u);
          emit(value, u);
        }}
      >
        <option value="minutes">{t("common.minutes")}</option>
        <option value="hours">{t("common.hours")}</option>
      </Select>
    </div>
  );
}
