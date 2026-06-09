import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { Combobox, Input, LookupPicker, MultiSelect, Textarea, Toggle } from "@lyra/ui";
import type { OptionInlineItem } from "@lyra/contracts";
import { useResolvedReferenceList } from "../reference-data/reference-data-queries.js";
import type { EditField, EditState } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

type Values = Record<string, unknown>;

/** Opciones a previsualizar: ítems inline del `optionSource` (datos vivos = Fase 3). */
function options(field: EditField): OptionInlineItem[] {
  const src = field.config.optionSource as { kind?: string; items?: OptionInlineItem[] } | undefined;
  const raw = src?.kind === "inline" && Array.isArray(src.items) ? src.items : [];
  return raw.filter((o) => o && typeof o.code === "string");
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

  // Opciones del campo: inline en el config, o resueltas desde una Lista de
  // Referencia (muestra label, guarda code). El hook se llama siempre; con
  // listKey null la query queda deshabilitada.
  const src = field.config.optionSource as { kind?: string; listKey?: string } | undefined;
  const listKey = src?.kind === "referenceList" ? src.listKey || null : null;
  const resolved = useResolvedReferenceList(listKey);
  const opts: OptionInlineItem[] = listKey
    ? (resolved.data ?? []).map((o) => ({ code: o.code, label: o.label }))
    : options(field);
  // Resumen de metadata por code (columna "detalle" del lookup de referencia).
  const detailByCode = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of resolved.data ?? []) {
      if (!o.metadata) continue;
      const entries = Object.entries(o.metadata);
      if (entries.length === 0) continue;
      m.set(o.code, entries.slice(0, 3).map(([k, val]) => `${k}: ${typeof val === "string" ? val : JSON.stringify(val)}`).join(" · "));
    }
    return m;
  }, [resolved.data]);

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
        <div style={{ maxWidth: 360 }}>
          <Combobox
            value={(v as string) ?? ""}
            onChange={(val) => setValue(field.key, val)}
            options={opts.map((o) => ({ value: o.code, label: o.label, hint: o.code }))}
            placeholder="—"
            clearable
          />
        </div>
      );
      break;
    case "MULTISELECT":
      // Lista de Referencia → lookup con tabla (código/etiqueta/metadata, patrón
      // "value help" SAP); opciones inline (cortas) → token-picker simple.
      control = listKey ? (
        <div style={{ maxWidth: 480 }}>
          <LookupPicker
            value={(v as string[]) ?? []}
            onChange={(vals) => setValue(field.key, vals)}
            options={opts.map((o) => ({ value: o.code, label: o.label, hint: o.code, detail: detailByCode.get(o.code) }))}
            title={field.label}
            placeholder={t("templates.builder.lookupPlaceholder")}
            searchPlaceholder={t("common.search")}
            confirmLabel={t("templates.builder.lookupConfirm")}
            cancelLabel={t("common.cancel")}
            clearLabel={t("common.clear")}
            codeHeader={t("referenceData.item.code")}
            labelHeader={t("referenceData.item.label")}
            detailHeader={t("referenceData.item.metadata")}
            summaryText={(n) => t("templates.builder.lookupSummary", { count: n })}
          />
        </div>
      ) : (
        <div style={{ maxWidth: 360 }}>
          <MultiSelect
            value={(v as string[]) ?? []}
            onChange={(vals) => setValue(field.key, vals)}
            options={opts.map((o) => ({ value: o.code, label: o.label, hint: o.code }))}
          />
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
