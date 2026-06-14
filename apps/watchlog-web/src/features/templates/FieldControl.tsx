import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, FunctionSquare } from "lucide-react";
import { Combobox, Input, LookupPicker, MultiSelect, Textarea, Toggle } from "@lyra/ui";
import type { ComputedFieldConfig, FieldType, OptionInlineItem } from "@lyra/contracts";
import { useResolvedReferenceList } from "../reference-data/reference-data-queries.js";
import styles from "./TemplateBuilder.module.css";

/** Forma mínima de un campo para renderizar su control (común a builder y llenado). */
export interface FieldControlField {
  key: string;
  type: FieldType;
  label: string;
  required?: boolean;
  help?: string | null;
  config: Record<string, unknown>;
  /** Campo FORMULADO (Req-7): si está presente, se muestra READ-ONLY (valor derivado). */
  computed?: ComputedFieldConfig | null;
}

/** Ítems inline del `optionSource` (cuando la fuente no es una Lista de Referencia). */
function inlineOptions(config: Record<string, unknown>): OptionInlineItem[] {
  const src = config.optionSource as { kind?: string; items?: OptionInlineItem[] } | undefined;
  const raw = src?.kind === "inline" && Array.isArray(src.items) ? src.items : [];
  return raw.filter((o) => o && typeof o.code === "string");
}

/** Evalúa el estado de un valor numérico contra rango y bandas de umbral ISA-18.2. */
function numberState(config: Record<string, unknown>, value: unknown): "ok" | "warn" | "crit" {
  if (value === "" || value === undefined || value === null) return "ok";
  const n = Number(value);
  if (Number.isNaN(n)) return "ok";
  const c = config as Record<string, number | undefined>;
  if ((c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) return "crit";
  if ((c.critLow !== undefined && n < c.critLow) || (c.critHigh !== undefined && n > c.critHigh)) return "crit";
  if ((c.warnLow !== undefined && n < c.warnLow) || (c.warnHigh !== undefined && n > c.warnHigh)) return "warn";
  return "ok";
}

/**
 * Control de un campo, FUENTE ÚNICA de render del Form Builder (vista previa) y
 * del llenado de bitácoras (Fase 2.4). En modo `readOnly` muestra el valor
 * formateado (resolviendo code→label para selectores); de lo contrario, el
 * control interactivo. La resolución de opciones desde Listas de Referencia es
 * idéntica en ambos modos (muestra label, persiste code).
 */
export function FieldControl({
  field,
  value,
  onChange,
  readOnly = false,
  invalid = false,
}: {
  field: FieldControlField;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  invalid?: boolean;
}) {
  const { t } = useTranslation();

  const src = field.config.optionSource as { kind?: string; listKey?: string } | undefined;
  const listKey = src?.kind === "referenceList" ? src.listKey || null : null;
  const resolved = useResolvedReferenceList(listKey);
  const opts: OptionInlineItem[] = listKey
    ? (resolved.data ?? []).map((o) => ({ code: o.code, label: o.label }))
    : inlineOptions(field.config);
  const labelByCode = useMemo(() => new Map(opts.map((o) => [o.code, o.label])), [opts]);
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

  const isComputed = !!field.computed;
  const labelEl = (
    <label className={styles.previewLabel}>
      {field.label}
      {field.required && !isComputed && <span className={styles.req}> *</span>}
      {isComputed && (
        <span className={styles.computedBadge} title={t("templates.builder.computedField")}>
          <FunctionSquare size={11} /> {t("templates.builder.computedTag")}
        </span>
      )}
    </label>
  );

  const wrap = (control: React.ReactNode) => (
    <div className={styles.previewField}>
      {labelEl}
      {field.help && <div className={styles.previewHelp}>{field.help}</div>}
      {control}
    </div>
  );

  // --- Campo FORMULADO o modo solo-lectura: valor formateado (read-only) ----
  // Un formulado es read-only SIEMPRE (su valor lo deriva el servidor); se muestra
  // el valor calculado que el llamador recomputó.
  if (isComputed || readOnly) {
    return wrap(<div className={styles.previewReadonly}>{formatReadonly(field, value, labelByCode, t)}</div>);
  }

  switch (field.type) {
    case "TEXT":
      return wrap(
        <Input value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={(field.config.placeholder as string) ?? ""} invalid={invalid} />,
      );
    case "TEXTAREA":
      return wrap(<Textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} invalid={invalid} />);
    case "NUMBER": {
      const st = numberState(field.config, value);
      const c = field.config as Record<string, string | number | undefined>;
      return wrap(
        <div>
          <div className={styles.previewNumberRow}>
            <Input
              type="number"
              value={(value as string) ?? ""}
              onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
              invalid={invalid || st === "crit"}
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
        </div>,
      );
    }
    case "SELECT":
      return wrap(
        <div style={{ maxWidth: 360 }}>
          <Combobox
            value={(value as string) ?? ""}
            onChange={(val) => onChange(val || null)}
            options={opts.map((o) => ({ value: o.code, label: o.label, hint: o.code }))}
            placeholder="—"
            clearable
          />
        </div>,
      );
    case "MULTISELECT":
      return wrap(
        listKey ? (
          <div style={{ maxWidth: 480 }}>
            <LookupPicker
              value={(value as string[]) ?? []}
              onChange={(vals) => onChange(vals)}
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
            <MultiSelect value={(value as string[]) ?? []} onChange={(vals) => onChange(vals)} options={opts.map((o) => ({ value: o.code, label: o.label, hint: o.code }))} />
          </div>
        ),
      );
    case "BOOLEAN":
      return wrap(<Toggle checked={Boolean(value)} onChange={(checked) => onChange(checked)} />);
    case "DATE":
      return wrap(<Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} style={{ maxWidth: 220 }} invalid={invalid} />);
    case "DATETIME":
      return wrap(<Input type="datetime-local" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} style={{ maxWidth: 260 }} invalid={invalid} />);
    case "SEVERITY":
      return wrap(
        <div className={styles.severityRow}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" className={styles.severityBtn} data-on={value === n} data-sev={n} onClick={() => onChange(n)}>
              {n}
            </button>
          ))}
        </div>,
      );
    case "SIGNATURE":
      return wrap(<div className={styles.previewSignature}>{t("templates.fieldTypes.signature")}</div>);
    default:
      return wrap(null);
  }
}

function formatReadonly(
  field: FieldControlField,
  value: unknown,
  labelByCode: Map<string, string>,
  t: (k: string) => string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.type) {
    case "SELECT":
      return labelByCode.get(value as string) ?? String(value);
    case "MULTISELECT":
      return Array.isArray(value) && value.length > 0
        ? (value as string[]).map((c) => labelByCode.get(c) ?? c).join(", ")
        : "—";
    case "BOOLEAN": {
      const c = field.config as { trueLabel?: string; falseLabel?: string };
      return value ? (c.trueLabel ?? t("common.yes")) : (c.falseLabel ?? t("common.no"));
    }
    case "NUMBER": {
      const unit = (field.config as { unit?: string }).unit;
      return unit ? `${String(value)} ${unit}` : String(value);
    }
    default:
      return String(value);
  }
}
