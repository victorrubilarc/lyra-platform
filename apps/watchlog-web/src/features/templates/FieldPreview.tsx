import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Input, Select, Textarea, Toggle } from "@lyra/ui";
import type { FieldOption } from "@lyra/contracts";
import type { EditField, EditState } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

type Values = Record<string, unknown>;

function options(field: EditField): FieldOption[] {
  const raw = (field.config.options as FieldOption[] | undefined) ?? [];
  return raw.filter((o) => o && typeof o.value === "string");
}

/** Evalúa el estado de un valor numérico contra rango y bandas de umbral. */
function numberState(field: EditField, value: unknown): "ok" | "warn" | "crit" {
  if (value === "" || value === undefined || value === null) return "ok";
  const n = Number(value);
  if (Number.isNaN(n)) return "ok";
  const c = field.config as Record<string, number | undefined>;
  if ((c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) return "crit";
  if ((c.critLow !== undefined && n < c.critLow) || (c.critHigh !== undefined && n > c.critHigh)) return "crit";
  if ((c.warnLow !== undefined && n < c.warnLow) || (c.warnHigh !== undefined && n > c.warnHigh)) return "warn";
  return "ok";
}

function PreviewField({ field, values, setValue }: { field: EditField; values: Values; setValue: (k: string, v: unknown) => void }) {
  const { t } = useTranslation();
  const v = values[field.key];

  const label = (
    <label className={styles.previewLabel}>
      {field.label}
      {field.required && <span className={styles.req}> *</span>}
    </label>
  );

  let control: React.ReactNode = null;
  switch (field.type) {
    case "TEXT":
      control = <Input value={(v as string) ?? ""} onChange={(e) => setValue(field.key, e.target.value)} placeholder={(field.config.placeholder as string) ?? ""} />;
      break;
    case "TEXTAREA":
      control = <Textarea value={(v as string) ?? ""} onChange={(e) => setValue(field.key, e.target.value)} />;
      break;
    case "NUMBER": {
      const st = numberState(field, v);
      const c = field.config as Record<string, string | number | undefined>;
      control = (
        <div>
          <div className={styles.previewNumberRow}>
            <Input
              type="number"
              value={(v as string) ?? ""}
              onChange={(e) => setValue(field.key, e.target.value)}
              invalid={st === "crit"}
              style={{ maxWidth: 180 }}
            />
            {c.unit && <span className={styles.previewUnit}>{c.unit as string}</span>}
            {(c.min !== undefined || c.max !== undefined) && (
              <span className={styles.previewRange}>
                {t("templates.builder.min")} {c.min ?? "—"} · {t("templates.builder.max")} {c.max ?? "—"}
              </span>
            )}
          </div>
          {st !== "ok" && (
            <div className={st === "crit" ? styles.previewCrit : styles.previewWarn}>
              <AlertTriangle size={13} /> {st === "crit" ? t("templates.builder.outOfRangeHint") : t("templates.builder.thresholds")}
            </div>
          )}
        </div>
      );
      break;
    }
    case "SELECT":
      control = (
        <Select value={(v as string) ?? ""} onChange={(e) => setValue(field.key, e.target.value)}>
          <option value="">—</option>
          {options(field).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      );
      break;
    case "MULTISELECT":
      control = (
        <div className={styles.previewChips}>
          {options(field).map((o) => {
            const arr = (v as string[]) ?? [];
            const on = arr.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className={on ? styles.previewChipOn : styles.previewChip}
                onClick={() => setValue(field.key, on ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
              >
                {on ? "✓ " : ""}
                {o.label}
              </button>
            );
          })}
        </div>
      );
      break;
    case "BOOLEAN":
      control = <Toggle checked={Boolean(v)} onChange={(checked) => setValue(field.key, checked)} />;
      break;
    case "DATE":
      control = <Input type="date" value={(v as string) ?? ""} onChange={(e) => setValue(field.key, e.target.value)} style={{ maxWidth: 220 }} />;
      break;
    case "DATETIME":
      control = <Input type="datetime-local" value={(v as string) ?? ""} onChange={(e) => setValue(field.key, e.target.value)} style={{ maxWidth: 260 }} />;
      break;
    case "SEVERITY":
      control = (
        <div className={styles.severityRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={styles.severityBtn}
              data-on={v === n}
              data-sev={n}
              onClick={() => setValue(field.key, n)}
            >
              {n}
            </button>
          ))}
        </div>
      );
      break;
    case "SIGNATURE":
      control = <div className={styles.previewSignature}>{t("templates.fieldTypes.signature")}</div>;
      break;
  }

  return (
    <div className={styles.previewField}>
      {label}
      {field.help && <div className={styles.previewHelp}>{field.help}</div>}
      {control}
    </div>
  );
}

/** Vista previa del formulario (opciones fijas; datos vivos llegan en Fase 3). */
export function PreviewForm({ state }: { state: EditState }) {
  const [values, setValues] = useState<Values>({});
  const setValue = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));

  const isVisible = (field: EditField): boolean => {
    if (!field.visibleWhen) return true;
    return values[field.visibleWhen.fieldKey] === field.visibleWhen.equals;
  };

  return (
    <div className={styles.previewForm}>
      {state.sections.map((s) => (
        <div key={s.uid} className={styles.previewSection}>
          <div className={styles.previewSectionTitle}>{s.title}</div>
          {s.description && <div className={styles.previewSectionDesc}>{s.description}</div>}
          {s.fields.filter(isVisible).map((f) => (
            <PreviewField key={f.uid} field={f} values={values} setValue={setValue} />
          ))}
          {s.fields.length === 0 && <div className={styles.previewEmpty}>—</div>}
        </div>
      ))}
    </div>
  );
}
