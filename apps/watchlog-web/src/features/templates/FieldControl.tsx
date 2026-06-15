import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FunctionSquare,
  Image as ImageIcon,
  Info,
  Star,
  XCircle,
} from "lucide-react";
import { Checkbox, Combobox, Input, LookupPicker, MultiSelect, Textarea, Toggle } from "@lyra/ui";
import {
  CONFORMITY_CODES,
  RATING_DEFAULT_MAX,
  isPresentationalType,
  type ComputedFieldConfig,
  type FieldType,
  type OptionInlineItem,
} from "@lyra/contracts";
import { formatCurrency, formatDurationHm, formatPercent, formatRut } from "../../lib/format.js";
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

  // --- Objetos de PRESENTACIÓN (no-dato): se dibujan SIN la anatomía de campo
  // (etiqueta/obligatorio/control). El `label` es su texto/título; `config` el cuerpo.
  if (isPresentationalType(field.type)) {
    return <PresentationalBlock field={field} t={t} />;
  }

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
    case "TEXT": {
      const fmt = (field.config as { format?: string }).format;
      const inputMode = fmt === "email" ? "email" : fmt === "phone" ? "tel" : fmt === "url" ? "url" : undefined;
      return wrap(
        <Input
          type={fmt === "email" ? "email" : fmt === "url" ? "url" : fmt === "phone" ? "tel" : "text"}
          inputMode={inputMode}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={(field.config.placeholder as string) ?? placeholderForFormat(fmt)}
          invalid={invalid}
        />,
      );
    }
    case "TEXTAREA":
      return wrap(<Textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} invalid={invalid} />);
    case "NUMBER": {
      const st = numberState(field.config, value);
      const c = field.config as Record<string, string | number | undefined>;
      const isPercent = c.format === "percent";
      const isCurrency = c.format === "currency";
      const suffix = isPercent ? "%" : isCurrency ? ((c.currency as string) ?? "CLP") : (c.unit as string | undefined);
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
            {suffix && <span className={styles.previewUnit}>{suffix}</span>}
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
    case "SELECT": {
      const display = (field.config as { displayAs?: string }).displayAs ?? "dropdown";
      const cur = (value as string) ?? "";
      if (display === "radio") {
        return wrap(
          <div className={styles.optionList} role="radiogroup">
            {opts.map((o) => (
              <button
                key={o.code}
                type="button"
                role="radio"
                aria-checked={cur === o.code}
                className={styles.optionRow}
                data-on={cur === o.code}
                onClick={() => onChange(cur === o.code ? null : o.code)}
              >
                <span className={styles.optionRadio} aria-hidden />
                <span>{o.label}</span>
              </button>
            ))}
          </div>,
        );
      }
      if (display === "segmented") {
        return wrap(
          <div className={styles.segmented} role="radiogroup">
            {opts.map((o) => (
              <button
                key={o.code}
                type="button"
                role="radio"
                aria-checked={cur === o.code}
                className={styles.segmentedBtn}
                data-on={cur === o.code}
                onClick={() => onChange(cur === o.code ? null : o.code)}
              >
                {o.label}
              </button>
            ))}
          </div>,
        );
      }
      return wrap(
        <div style={{ maxWidth: 360 }}>
          <Combobox
            value={cur}
            onChange={(val) => onChange(val || null)}
            options={opts.map((o) => ({ value: o.code, label: o.label, hint: o.code }))}
            placeholder="—"
            clearable
          />
        </div>,
      );
    }
    case "MULTISELECT": {
      const display = (field.config as { displayAs?: string }).displayAs ?? (listKey ? "modal" : "dropdown");
      const cur = (value as string[]) ?? [];
      if (display === "checkboxes") {
        return wrap(
          <div className={styles.optionList}>
            {opts.map((o) => {
              const on = cur.includes(o.code);
              return (
                <div key={o.code} className={styles.optionRow} data-on={on}>
                  <Checkbox
                    checked={on}
                    label={o.label}
                    onChange={() => onChange(on ? cur.filter((c) => c !== o.code) : [...cur, o.code])}
                  />
                </div>
              );
            })}
          </div>,
        );
      }
      if (display === "modal") {
        return wrap(
          <div style={{ maxWidth: 480 }}>
            <LookupPicker
              value={cur}
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
          </div>,
        );
      }
      return wrap(
        <div style={{ maxWidth: 360 }}>
          <MultiSelect value={cur} onChange={(vals) => onChange(vals)} options={opts.map((o) => ({ value: o.code, label: o.label, hint: o.code }))} />
        </div>,
      );
    }
    case "BOOLEAN":
      return wrap(<Toggle checked={Boolean(value)} onChange={(checked) => onChange(checked)} />);
    case "DATE":
      return wrap(<Input type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} style={{ maxWidth: 220 }} invalid={invalid} />);
    case "DATETIME":
      return wrap(<Input type="datetime-local" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} style={{ maxWidth: 260 }} invalid={invalid} />);
    case "TIME":
      return wrap(<Input type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value || null)} style={{ maxWidth: 160 }} invalid={invalid} />);
    case "DURATION": {
      const mins = typeof value === "number" ? value : null;
      const hh = mins == null ? "" : String(Math.floor(mins / 60));
      const mm = mins == null ? "" : String(mins % 60);
      const emit = (hv: string, mv: string) => {
        if (hv === "" && mv === "") return onChange(null);
        onChange((Number(hv) || 0) * 60 + (Number(mv) || 0));
      };
      return wrap(
        <div className={styles.durationRow}>
          <Input type="number" min={0} value={hh} onChange={(e) => emit(e.target.value, mm)} style={{ maxWidth: 88 }} invalid={invalid} />
          <span className={styles.previewUnit}>{t("templates.builder.durationHours")}</span>
          <Input type="number" min={0} max={59} value={mm} onChange={(e) => emit(hh, e.target.value)} style={{ maxWidth: 88 }} invalid={invalid} />
          <span className={styles.previewUnit}>{t("templates.builder.durationMinutes")}</span>
        </div>,
      );
    }
    case "RANGE": {
      const c = field.config as { unit?: string };
      const r = (value as { from?: number | null; to?: number | null } | null) ?? {};
      const emit = (from: unknown, to: unknown) => {
        const f = from === "" || from === undefined ? null : Number(from);
        const tt = to === "" || to === undefined ? null : Number(to);
        onChange(f == null && tt == null ? null : { from: f, to: tt });
      };
      return wrap(
        <div className={styles.rangeRow}>
          <Input type="number" value={r.from ?? ""} onChange={(e) => emit(e.target.value, r.to)} placeholder={t("templates.builder.rangeMin")} style={{ maxWidth: 140 }} invalid={invalid} />
          <span className={styles.rangeDash}>–</span>
          <Input type="number" value={r.to ?? ""} onChange={(e) => emit(r.from, e.target.value)} placeholder={t("templates.builder.rangeMax")} style={{ maxWidth: 140 }} invalid={invalid} />
          {c.unit && <span className={styles.previewUnit}>{c.unit}</span>}
        </div>,
      );
    }
    case "CONFORMITY": {
      const allowNa = (field.config as { allowNa?: boolean }).allowNa !== false;
      const codes = CONFORMITY_CODES.filter((c) => allowNa || c !== "NA");
      const cur = value as string | null;
      return wrap(
        <div className={styles.segmented} role="radiogroup">
          {codes.map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={cur === code}
              className={styles.conformityBtn}
              data-state={code}
              data-on={cur === code}
              onClick={() => onChange(cur === code ? null : code)}
            >
              {conformityIcon(code)} {t(`templates.conformity.${code}`)}
            </button>
          ))}
        </div>,
      );
    }
    case "RATING": {
      const cfg = field.config as { style?: string; max?: number; labels?: string[] };
      const max = cfg.max ?? RATING_DEFAULT_MAX;
      const cur = Number(value) || 0;
      const style = cfg.style ?? "stars";
      if (style === "stars") {
        return wrap(
          <div className={styles.ratingRow}>
            {Array.from({ length: max }).map((_, i) => (
              <button key={i} type="button" className={styles.ratingStar} data-on={i < cur} aria-label={`${i + 1}`} onClick={() => onChange(cur === i + 1 ? null : i + 1)}>
                <Star size={22} fill={i < cur ? "currentColor" : "none"} />
              </button>
            ))}
          </div>,
        );
      }
      // numeric / likert: botones 1..max (likert agrega rótulos opcionales).
      return wrap(
        <div className={styles.ratingScale} role="radiogroup">
          {Array.from({ length: max }).map((_, i) => {
            const n = i + 1;
            return (
              <button key={n} type="button" role="radio" aria-checked={cur === n} className={styles.ratingScaleBtn} data-on={cur === n} onClick={() => onChange(cur === n ? null : n)}>
                <span>{n}</span>
                {style === "likert" && cfg.labels?.[i] && <small>{cfg.labels[i]}</small>}
              </button>
            );
          })}
        </div>,
      );
    }
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

/** Placeholder por defecto según el formato semántico de un TEXT. */
function placeholderForFormat(fmt?: string): string {
  switch (fmt) {
    case "rut":
      return "12.345.678-5";
    case "email":
      return "nombre@empresa.cl";
    case "phone":
      return "+56 9 1234 5678";
    case "url":
      return "https://…";
    default:
      return "";
  }
}

function conformityIcon(code: string) {
  if (code === "CONFORME") return <CheckCircle2 size={15} />;
  if (code === "NO_CONFORME") return <XCircle size={15} />;
  return <span aria-hidden>—</span>;
}

/** Render de un objeto de PRESENTACIÓN (HEADING/STATIC_TEXT/DIVIDER/NOTICE/…). */
function PresentationalBlock({ field, t }: { field: FieldControlField; t: (k: string) => string }) {
  const c = field.config as Record<string, unknown>;
  switch (field.type) {
    case "HEADING": {
      const level = (c.level as number) ?? 2;
      return (
        <div className={styles.blockHeading} data-level={level}>
          {field.label}
        </div>
      );
    }
    case "STATIC_TEXT":
      return (
        <div className={styles.blockText}>
          {field.label && <strong>{field.label}</strong>}
          {typeof c.text === "string" && c.text.trim() !== "" && <p>{c.text}</p>}
        </div>
      );
    case "DIVIDER":
      return <hr className={styles.blockDivider} data-spacing={(c.spacing as string) ?? "md"} />;
    case "NOTICE": {
      const variant = (c.variant as string) ?? "info";
      return (
        <div className={styles.blockNotice} data-variant={variant} role="note">
          <span className={styles.blockNoticeIcon}>{variant === "info" ? <Info size={16} /> : <AlertTriangle size={16} />}</span>
          <div>
            {field.label && <strong>{field.label}</strong>}
            {typeof c.text === "string" && c.text.trim() !== "" && <p>{c.text}</p>}
          </div>
        </div>
      );
    }
    case "PROCEDURE_LINK": {
      const url = (c.url as string) ?? "";
      const text = (c.linkText as string) || field.label || url;
      if (!url) return <div className={styles.blockText}>{text || t("templates.builder.procedureLinkEmpty")}</div>;
      return (
        <a className={styles.blockLink} href={url} target="_blank" rel="noreferrer noopener">
          <ExternalLink size={15} /> {text}
        </a>
      );
    }
    case "REFERENCE_IMAGE": {
      const url = (c.url as string) ?? "";
      const caption = (c.caption as string) ?? "";
      return (
        <figure className={styles.blockImage}>
          {url ? (
            <img src={url} alt={(c.alt as string) ?? field.label ?? ""} />
          ) : (
            <div className={styles.blockImagePlaceholder}>
              <ImageIcon size={22} /> {t("templates.builder.referenceImageEmpty")}
            </div>
          )}
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      );
    }
    default:
      return null;
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
    case "CONFORMITY":
      return t(`templates.conformity.${value as string}`);
    case "RATING": {
      const max = (field.config as { max?: number }).max ?? 5;
      return `${value} / ${max}`;
    }
    case "DURATION":
      return typeof value === "number" ? formatDurationHm(value) : String(value);
    case "RANGE": {
      const r = value as { from?: number | null; to?: number | null };
      const unit = (field.config as { unit?: string }).unit;
      const seg = `${r.from ?? "—"} – ${r.to ?? "—"}`;
      return unit ? `${seg} ${unit}` : seg;
    }
    case "BOOLEAN": {
      const c = field.config as { trueLabel?: string; falseLabel?: string };
      return value ? (c.trueLabel ?? t("common.yes")) : (c.falseLabel ?? t("common.no"));
    }
    case "NUMBER": {
      const c = field.config as { unit?: string; format?: string; currency?: string };
      const n = Number(value);
      if (c.format === "percent" && Number.isFinite(n)) return formatPercent(n);
      if (c.format === "currency" && Number.isFinite(n)) return formatCurrency(n, c.currency ?? "CLP");
      return c.unit ? `${String(value)} ${c.unit}` : String(value);
    }
    case "TEXT": {
      const fmt = (field.config as { format?: string }).format;
      return fmt === "rut" ? formatRut(String(value)) : String(value);
    }
    default:
      return String(value);
  }
}
