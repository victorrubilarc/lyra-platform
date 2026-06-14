import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Input, Select } from "@lyra/ui";
import styles from "./SlaDurationField.module.css";

type Unit = "minutes" | "hours" | "days";
const MAX_MINUTES = 525_600; // 365 días
const PER = { minutes: 1, hours: 60, days: 1440 } as const;

/** Descompone los minutos canónicos en {valor, unidad}, eligiendo la mayor unidad exacta. */
function split(minutes: number | null): { value: string; unit: Unit } {
  if (minutes === null || minutes <= 0) return { value: "", unit: "hours" };
  if (minutes % 1440 === 0) return { value: String(minutes / 1440), unit: "days" };
  if (minutes % 60 === 0) return { value: String(minutes / 60), unit: "hours" };
  return { value: String(minutes), unit: "minutes" };
}

interface Props {
  /** SLA en MINUTOS canónicos (null/0 = sin SLA). */
  minutes: number | null;
  onChange: (minutes: number | null) => void;
  disabled?: boolean;
}

/**
 * Campo de DURACIÓN del SLA de permanencia (Workflow SLA): número + selector de unidad
 * (Minutos / Horas / Días). Todo se normaliza a MINUTOS (unidad canónica de almacenamiento).
 * Vacío ⇒ null (sin SLA). Espejo de `EditWindowDurationField` (2.7.2) con "Días" añadido
 * (los SLA operacionales suelen medirse en días). Se inicializa una vez desde `minutes`.
 */
export function SlaDurationField({ minutes, onChange, disabled }: Props) {
  const { t } = useTranslation();
  const init = split(minutes);
  const [value, setValue] = useState(init.value);
  const [unit, setUnit] = useState<Unit>(init.unit);

  const toMinutes = (v: string, u: Unit): number | null => {
    const n = Number(v);
    if (v.trim() === "" || !Number.isFinite(n) || n <= 0) return null;
    return Math.min(Math.trunc(n) * PER[u], MAX_MINUTES);
  };

  const emit = (v: string, u: Unit) => onChange(toMinutes(v, u));

  return (
    <div className={styles.field}>
      <Input
        type="number"
        min={1}
        value={value}
        placeholder={t("workflows.builder.slaNone")}
        disabled={disabled}
        aria-label={t("workflows.builder.slaLabel")}
        className={styles.num}
        onChange={(e) => {
          setValue(e.target.value);
          emit(e.target.value, unit);
        }}
      />
      <Select
        value={unit}
        disabled={disabled}
        aria-label={t("workflows.builder.slaUnit")}
        className={styles.unit}
        onChange={(e) => {
          const u = e.target.value as Unit;
          setUnit(u);
          emit(value, u);
        }}
      >
        <option value="minutes">{t("common.minutes")}</option>
        <option value="hours">{t("common.hours")}</option>
        <option value="days">{t("common.days")}</option>
      </Select>
    </div>
  );
}
