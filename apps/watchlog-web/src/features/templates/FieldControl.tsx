import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FunctionSquare,
  Image as ImageIcon,
  Info,
  Plus,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { Checkbox, Combobox, Input, LookupPicker, MultiSelect, Textarea, Toggle } from "@lyra/ui";
import {
  CONFORMITY_CODES,
  RATING_DEFAULT_MAX,
  effectiveNumberBands,
  isPresentationalType,
  riskLevelFor,
  type ComputedFieldConfig,
  type FieldType,
  type OptionInlineItem,
  type ReferenceEntity,
} from "@lyra/contracts";
import { applyMask, formatCurrency, formatDurationHm, formatNumber, formatPercent, formatRut, formatRutLive } from "../../lib/format.js";
import { useResolvedReferenceList } from "../reference-data/reference-data-queries.js";
import { useReferenceOptions } from "../log-entries/log-entries-queries.js";
import { AttachmentControl, type AttachmentHandlers } from "./AttachmentControl.js";
import { QrScanButton } from "./QrScanButton.js";
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

/** Evalúa el estado de un valor numérico contra rango y bandas de umbral ISA-18.2
 *  (bandas EFECTIVAS: derivadas de `expected ± tolerance` o explícitas). */
function numberState(config: Record<string, unknown>, value: unknown): "ok" | "warn" | "crit" {
  if (value === "" || value === undefined || value === null) return "ok";
  const n = Number(value);
  if (Number.isNaN(n)) return "ok";
  const c = config as Record<string, number | undefined>;
  if ((c.min !== undefined && n < c.min) || (c.max !== undefined && n > c.max)) return "crit";
  const b = effectiveNumberBands(config);
  if ((b.critLow !== undefined && n < b.critLow) || (b.critHigh !== undefined && n > b.critHigh)) return "crit";
  if ((b.warnLow !== undefined && n < b.warnLow) || (b.warnHigh !== undefined && n > b.warnHigh)) return "warn";
  return "ok";
}

/**
 * Contador de caracteres + pista de mín/máx para TEXT/TEXTAREA. Discreto (no invade
 * el formulario): una línea pequeña y atenuada bajo el control, alineada a la
 * derecha. Solo aparece si el campo define `minLength` y/o `maxLength`. Vira a ámbar
 * cuando aún no llega al mínimo (con texto ya escrito) y a rojo cuando excede el máximo.
 */
function CharCounter({
  config,
  value,
  t,
}: {
  config: Record<string, unknown>;
  value: unknown;
  t: (k: string, opts?: Record<string, unknown>) => string;
}) {
  const c = config as { minLength?: number; maxLength?: number };
  const min = typeof c.minLength === "number" ? c.minLength : undefined;
  const max = typeof c.maxLength === "number" ? c.maxLength : undefined;
  if (min === undefined && max === undefined) return null;
  const len = typeof value === "string" ? value.length : 0;
  const over = max !== undefined && len > max;
  const under = min !== undefined && len > 0 && len < min;
  return (
    <div className={styles.charCounter} data-over={over || undefined} data-under={under || undefined}>
      <span>{min !== undefined && len < min ? t("templates.builder.charMin", { n: min }) : null}</span>
      <span>
        {max !== undefined
          ? over
            ? t("templates.builder.charOver", { n: len - max })
            : t("templates.builder.charRemaining", { n: max - len })
          : null}
      </span>
    </div>
  );
}

/**
 * Input numérico con FORMATEO EN VIVO (formateo A): al DESENFOCAR muestra el número
 * con separador de miles + decimales regionales (`lib/format`, p. ej. es-CL
 * "1.250.000,50"); al ENFOCAR se edita en plano (punto decimal, sin separadores).
 * Persiste SIEMPRE el número (o null), nunca el texto formateado. Caret estable
 * porque mientras se edita el textbox muestra exactamente lo tecleado (estado local).
 */
function FormattedNumberInput({
  value,
  onChange,
  decimals,
  invalid,
}: {
  value: unknown;
  onChange: (v: number | null) => void;
  decimals?: number;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const n = value === "" || value === null || value === undefined ? null : Number(value);
  const formatted =
    n === null || !Number.isFinite(n)
      ? ""
      : formatNumber(n, { minimumFractionDigits: decimals ?? 0, maximumFractionDigits: decimals ?? 20 });
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={focused ? draft : formatted}
      invalid={invalid}
      style={{ maxWidth: 180 }}
      onFocus={() => {
        setDraft(n === null ? "" : String(n));
        setFocused(true);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const cleaned = raw.replace(",", ".").replace(/[^\d.-]/g, "");
        if (cleaned === "" || cleaned === "-" || cleaned === ".") onChange(null);
        else {
          const parsed = Number(cleaned);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }
      }}
      onBlur={() => setFocused(false)}
    />
  );
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
  nodeId = null,
  counterPrevious,
  attachments,
  bare = false,
}: {
  field: FieldControlField;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  invalid?: boolean;
  /** Nodo de la entrada (Ola 2): acota las opciones de equipo/turno de los selectores de referencia. */
  nodeId?: string | null;
  /** Lectura previa de un campo CONTADOR (Ola 2): la UI muestra el delta (actual − previa). */
  counterPrevious?: number;
  /** Subida/descarga de ADJUNTOS (Ola 3) ligados a entrada+sección+campo por el llamador. */
  attachments?: AttachmentHandlers;
  /** Render SIN anatomía de campo (sin etiqueta/ayuda): para CELDAS de objetos estructurados (Ola 4). */
  bare?: boolean;
}) {
  const { t } = useTranslation();

  const src = field.config.optionSource as { kind?: string; listKey?: string } | undefined;
  const listKey = src?.kind === "referenceList" ? src.listKey || null : null;
  const resolved = useResolvedReferenceList(listKey);
  const opts: OptionInlineItem[] = listKey
    ? (resolved.data ?? []).map((o) => ({ code: o.code, label: o.label }))
    : inlineOptions(field.config);
  const labelByCode = useMemo(() => new Map(opts.map((o) => [o.code, o.label])), [opts]);

  // --- Objetos de REFERENCIA (Ola 2): opciones resueltas server-side (ABAC). El
  // mismo render resuelve id→label en fill y en visor (read-only). Hook SIEMPRE
  // llamado (deshabilitado si el campo no es REFERENCE) para no romper reglas de hooks.
  const refEntity = field.type === "REFERENCE" ? ((field.config as { entity?: ReferenceEntity }).entity ?? null) : null;
  const refQuery = useReferenceOptions(refEntity, nodeId, field.type === "REFERENCE");
  const refOptions = useMemo(() => refQuery.data?.options ?? [], [refQuery.data]);
  const labelByRefId = useMemo(() => new Map(refOptions.map((o) => [o.id, o.label])), [refOptions]);
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

  const wrap = (control: React.ReactNode) =>
    bare ? (
      <>{control}</>
    ) : (
      <div className={styles.previewField}>
        {labelEl}
        {field.help && <div className={styles.previewHelp}>{field.help}</div>}
        {control}
      </div>
    );

  // --- Adjuntos / evidencia (Ola 3): render ÚNICO en builder/llenado/visor. Va
  // ANTES del early-return de read-only porque el visor necesita lista + descarga
  // (no un texto plano). Sin `attachments` (vista previa del builder) muestra el
  // marcador "se sube al llenar".
  if (field.type === "ATTACHMENT") {
    return wrap(<AttachmentControl field={field} value={value} onChange={onChange} readOnly={readOnly} handlers={attachments} />);
  }

  // --- Objetos ESTRUCTURADOS / repetibles (Ola 4): render ÚNICO en builder/llenado/
  // visor. Cada celda reusa el MISMO FieldControl (modo `bare`), de modo que un NUMBER
  // de columna trae su unidad/umbral y un SELECT su catálogo inline. Va antes del
  // early-return de read-only porque el visor necesita la grilla, no un texto plano.
  if (field.type === "TABLE") {
    return wrap(<RepeatableControl field={field} value={value} onChange={onChange} readOnly={readOnly} nodeId={nodeId} t={t} />);
  }
  if (field.type === "MATRIX") {
    return wrap(<MatrixControl field={field} value={value} onChange={onChange} readOnly={readOnly} nodeId={nodeId} t={t} />);
  }

  // --- Campo FORMULADO o modo solo-lectura: valor formateado (read-only) ----
  // Un formulado es read-only SIEMPRE (su valor lo deriva el servidor); se muestra
  // el valor calculado que el llamador recomputó.
  if (isComputed || readOnly) {
    return wrap(<div className={styles.previewReadonly}>{formatReadonly(field, value, labelByCode, labelByRefId, t)}</div>);
  }

  switch (field.type) {
    case "TEXT": {
      const fmt = (field.config as { format?: string }).format;
      const scan = (field.config as { scan?: boolean }).scan === true;
      const mask = (field.config as { mask?: string }).mask;
      const inputMode = fmt === "email" ? "email" : fmt === "phone" ? "tel" : fmt === "url" ? "url" : fmt === "rut" || mask ? "numeric" : undefined;
      // Formateo EN VIVO al teclear: RUT (puntos+guion incremental, manda sobre máscara)
      // o máscara genérica (#=dígito, A=letra, *=alfanumérico, resto literales).
      const onText = (raw: string) => onChange(fmt === "rut" ? formatRutLive(raw) : mask ? applyMask(mask, raw) : raw);
      const input = (
        <Input
          type={fmt === "email" ? "email" : fmt === "url" ? "url" : fmt === "phone" ? "tel" : "text"}
          inputMode={inputMode}
          value={(value as string) ?? ""}
          onChange={(e) => onText(e.target.value)}
          placeholder={(field.config.placeholder as string) ?? mask ?? placeholderForFormat(fmt)}
          invalid={invalid}
        />
      );
      // Escáner QR/código (Ola 3): decodifica con la cámara y rellena el texto. El
      // usuario siempre puede teclear el valor manualmente (degradación elegante).
      if (scan) {
        return wrap(
          <>
            <div className={styles.scanRow}>
              {input}
              <QrScanButton onResult={(text) => onChange(text)} />
            </div>
            {!bare && <CharCounter config={field.config} value={value} t={t} />}
          </>,
        );
      }
      return wrap(
        <>
          {input}
          {!bare && <CharCounter config={field.config} value={value} t={t} />}
        </>,
      );
    }
    case "TEXTAREA":
      return wrap(
        <>
          <Textarea value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} invalid={invalid} />
          {!bare && <CharCounter config={field.config} value={value} t={t} />}
        </>,
      );
    case "NUMBER": {
      const st = numberState(field.config, value);
      const c = field.config as Record<string, string | number | boolean | undefined>;
      const isPercent = c.format === "percent";
      const isCurrency = c.format === "currency";
      const suffix = isPercent ? "%" : isCurrency ? ((c.currency as string) ?? "CLP") : (c.unit as string | undefined);
      const isTolerance = typeof c.expected === "number";
      const isCounter = c.counter === true;
      const n = value === "" || value === null || value === undefined ? null : Number(value);
      const delta = isCounter && n != null && typeof counterPrevious === "number" ? n - counterPrevious : null;
      // Formateo en vivo (A): moneda y porcentaje SIEMPRE formatean (miles+decimales);
      // un número simple solo si el diseñador fijó `decimals` (así un año/folio queda sin
      // agrupar). Moneda sin decimales explícitos = 0 (CLP). El símbolo lo da el sufijo.
      const fmtDecimals = isCurrency
        ? (typeof c.decimals === "number" ? c.decimals : 0)
        : typeof c.decimals === "number"
          ? c.decimals
          : undefined;
      const useFormatted = isCurrency || isPercent || typeof c.decimals === "number";
      return wrap(
        <div>
          <div className={styles.previewNumberRow}>
            {useFormatted ? (
              <FormattedNumberInput value={value} onChange={onChange} decimals={fmtDecimals} invalid={invalid || st === "crit"} />
            ) : (
              <Input
                type="number"
                value={(value as string) ?? ""}
                onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                invalid={invalid || st === "crit"}
                style={{ maxWidth: 180 }}
              />
            )}
            {suffix && <span className={styles.previewUnit}>{suffix}</span>}
            {!bare && isTolerance && (
              <span className={styles.previewRange}>
                {t("templates.builder.toleranceTarget")} {String(c.expected)}
                {typeof c.tolerance === "number" ? ` ± ${c.tolerance}` : ""}
                {suffix ? ` ${suffix}` : ""}
              </span>
            )}
            {!bare && !isTolerance && (c.min !== undefined || c.max !== undefined) && (
              <span className={styles.previewRange}>
                {t("templates.builder.min")} {c.min ?? "—"} · {t("templates.builder.max")} {c.max ?? "—"}
              </span>
            )}
          </div>
          {!bare && isCounter && (
            <div className={styles.counterDelta}>
              {typeof counterPrevious === "number"
                ? t("templates.builder.counterPrevious", { value: formatNumber(counterPrevious) })
                : t("templates.builder.counterNoPrevious")}
              {delta != null && (
                <strong data-neg={delta < 0}> · Δ {delta >= 0 ? "+" : ""}{formatNumber(delta)}</strong>
              )}
            </div>
          )}
          {!bare && st !== "ok" && (
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
    case "REFERENCE": {
      const display = (field.config as { display?: string }).display ?? "dropdown";
      const cur = (value as string) ?? "";
      const needsNode = refEntity === "equipment" || refEntity === "shift";
      // En el builder (sin nodo) los selectores acotados al nodo no tienen opciones.
      if (needsNode && !nodeId) {
        return wrap(<div className={styles.referenceHint}>{t("templates.builder.referenceNeedsNode")}</div>);
      }
      const options = refOptions.map((o) => ({ value: o.id, label: o.label, hint: o.sublabel ?? undefined }));
      if (display === "modal") {
        return wrap(
          <div style={{ maxWidth: 480 }}>
            <LookupPicker
              value={cur ? [cur] : []}
              onChange={(vals) => onChange(vals[vals.length - 1] ?? null)}
              options={options.map((o) => ({ value: o.value, label: o.label, hint: o.hint }))}
              title={field.label}
              placeholder={t("templates.builder.lookupPlaceholder")}
              searchPlaceholder={t("common.search")}
              confirmLabel={t("templates.builder.lookupConfirm")}
              cancelLabel={t("common.cancel")}
              clearLabel={t("common.clear")}
              codeHeader={t("referenceData.item.code")}
              labelHeader={t("referenceData.item.label")}
              detailHeader={t("referenceData.item.metadata")}
              summaryText={(count) => t("templates.builder.lookupSummary", { count })}
            />
          </div>,
        );
      }
      return wrap(
        <div style={{ maxWidth: 380 }}>
          <Combobox
            value={cur}
            onChange={(val) => onChange(val || null)}
            options={options}
            placeholder={refQuery.isLoading ? t("common.loading") : "—"}
            clearable
          />
        </div>,
      );
    }
    case "RISK_MATRIX":
      return wrap(<RiskMatrixControl field={field} value={value} onChange={onChange} t={t} />);
    default:
      return wrap(null);
  }
}

/** Cuadrícula de selección de la matriz de riesgo (probabilidad × consecuencia → nivel). */
function RiskMatrixControl({
  field,
  value,
  onChange,
  t,
}: {
  field: FieldControlField;
  value: unknown;
  onChange: (value: unknown) => void;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const cfg = field.config as { probabilityLabels?: string[]; consequenceLabels?: string[]; cells?: number[][] };
  const pLabels = cfg.probabilityLabels ?? [];
  const cLabels = cfg.consequenceLabels ?? [];
  const cur = (value as { probability?: number; consequence?: number } | null) ?? {};
  const level = riskLevelFor(field.config, value);
  return (
    <div>
      <div
        className={styles.riskMatrix}
        role="grid"
        aria-label={field.label}
        style={{ gridTemplateColumns: `minmax(90px,max-content) repeat(${cLabels.length}, minmax(48px,1fr))` }}
      >
        <div className={styles.riskCorner} aria-hidden>
          <span>{t("templates.builder.riskProbability")}</span>
          <span>{t("templates.builder.riskConsequence")}</span>
        </div>
        {cLabels.map((cl, c) => (
          <div key={`h${c}`} className={styles.riskColHead}>{cl}</div>
        ))}
        {pLabels.map((pl, p) => (
          <Fragment key={`r${p}`}>
            <div className={styles.riskRowHead}>{pl}</div>
            {cLabels.map((_, c) => {
              const sev = cfg.cells?.[p]?.[c] ?? 1;
              const on = cur.probability === p + 1 && cur.consequence === c + 1;
              return (
                <button
                  key={`${p}-${c}`}
                  type="button"
                  role="gridcell"
                  aria-selected={on}
                  className={styles.riskCell}
                  data-sev={sev}
                  data-on={on}
                  title={`${pl} × ${_} → ${t(`templates.builder.riskLevel.${sev}`)}`}
                  onClick={() => onChange(on ? null : { probability: p + 1, consequence: c + 1 })}
                >
                  {sev}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
      {level && (
        <div className={styles.riskResult} data-sev={level.severity}>
          {level.probabilityLabel} × {level.consequenceLabel} ·{" "}
          <strong>{t(`templates.builder.riskLevel.${level.severity}`)}</strong>
        </div>
      )}
    </div>
  );
}

// === Objetos ESTRUCTURADOS / repetibles (Ola 4) ==============================

interface StructuredColumn {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  config?: Record<string, unknown>;
}

/** Vista de una columna/celda como campo para reusar `FieldControl` (modo `bare`). */
function cellControlField(col: StructuredColumn): FieldControlField {
  return { key: col.key, type: col.type, label: col.label, config: col.config ?? {} };
}

/**
 * TABLE — tabla/grupo repetible. Filas dinámicas (`Array<Record<colKey, escalar>>`).
 * `layout=table` ⇒ grilla con scroll horizontal y encabezado sticky; `layout=cards`
 * ⇒ bloques verticales "agregar otro". Cada celda reusa `FieldControl` (render único).
 */
function RepeatableControl({
  field,
  value,
  onChange,
  readOnly,
  nodeId,
  t,
}: {
  field: FieldControlField;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly: boolean;
  nodeId: string | null;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const cfg = field.config as { layout?: string; columns?: StructuredColumn[]; minRows?: number; maxRows?: number; addRowLabel?: string };
  const columns = cfg.columns ?? [];
  const layout = cfg.layout === "cards" ? "cards" : "table";
  const rows: Record<string, unknown>[] = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];
  const atMax = typeof cfg.maxRows === "number" && rows.length >= cfg.maxRows;

  const setCell = (ri: number, key: string, v: unknown) => {
    const next = rows.map((r, i) => (i === ri ? { ...r, [key]: v } : r));
    onChange(next);
  };
  const addRow = () => onChange([...rows, {}]);
  const removeRow = (ri: number) => onChange(rows.filter((_, i) => i !== ri));
  const moveRow = (ri: number, dir: -1 | 1) => {
    const j = ri + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[ri], next[j]] = [next[j]!, next[ri]!];
    onChange(next);
  };

  const addLabel = cfg.addRowLabel || t("templates.builder.tableAddRow");
  const rowActions = (ri: number) =>
    !readOnly && (
      <div className={styles.repRowActions}>
        <button type="button" className={styles.repIconBtn} disabled={ri === 0} onClick={() => moveRow(ri, -1)} aria-label={t("templates.builder.tableMoveUp")}>
          <ChevronUp size={16} />
        </button>
        <button type="button" className={styles.repIconBtn} disabled={ri === rows.length - 1} onClick={() => moveRow(ri, 1)} aria-label={t("templates.builder.tableMoveDown")}>
          <ChevronDown size={16} />
        </button>
        <button type="button" className={styles.repIconBtn} data-danger onClick={() => removeRow(ri)} aria-label={t("templates.builder.tableRemoveRow")}>
          <Trash2 size={16} />
        </button>
      </div>
    );

  if (rows.length === 0 && readOnly) return <div className={styles.repEmpty}>{t("templates.builder.tableEmpty")}</div>;

  const body =
    layout === "cards" ? (
      <div className={styles.repCards}>
        {rows.map((row, ri) => (
          <div key={ri} className={styles.repCard}>
            <div className={styles.repCardHead}>
              <span className={styles.repCardIndex}>{ri + 1}</span>
              {rowActions(ri)}
            </div>
            <div className={styles.repCardFields}>
              {columns.map((col) => (
                <div key={col.key} className={styles.repCardField}>
                  <label className={styles.repCardLabel}>
                    {col.label}
                    {col.required && <span className={styles.req}> *</span>}
                  </label>
                  <FieldControl field={cellControlField(col)} value={row[col.key]} onChange={(v) => setCell(ri, col.key, v)} readOnly={readOnly} nodeId={nodeId} bare />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className={styles.repScroll}>
        <table className={styles.repTable}>
          <thead>
            <tr>
              <th className={styles.repRowNumHead} aria-hidden />
              {columns.map((col) => (
                <th key={col.key} className={styles.repColHead}>
                  {col.label}
                  {col.required && <span className={styles.req}> *</span>}
                </th>
              ))}
              {!readOnly && <th className={styles.repActionsHead} aria-hidden />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                <td className={styles.repRowNum}>{ri + 1}</td>
                {columns.map((col) => (
                  <td key={col.key} className={styles.repCell}>
                    <FieldControl field={cellControlField(col)} value={row[col.key]} onChange={(v) => setCell(ri, col.key, v)} readOnly={readOnly} nodeId={nodeId} bare />
                  </td>
                ))}
                {!readOnly && <td className={styles.repActionsCell}>{rowActions(ri)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );

  return (
    <div className={styles.repWrap}>
      {body}
      {!readOnly && (
        <button type="button" className={styles.repAddBtn} onClick={addRow} disabled={atMax}>
          <Plus size={16} /> {atMax ? t("templates.builder.tableMaxReached", { max: cfg.maxRows }) : addLabel}
        </button>
      )}
    </div>
  );
}

/**
 * MATRIX — parámetro×turno. Filas (parámetros) y columnas (turnos) FIJAS; celda
 * uniforme. Valor `Record<rowKey, Record<colKey, escalar>>`. Cabeceras read-only;
 * solo las celdas son editables. Scroll horizontal con la 1ª columna sticky.
 */
function MatrixControl({
  field,
  value,
  onChange,
  readOnly,
  nodeId,
  t,
}: {
  field: FieldControlField;
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly: boolean;
  nodeId: string | null;
  t: (k: string, o?: Record<string, unknown>) => string;
}) {
  const cfg = field.config as {
    rows?: { key: string; label: string }[];
    columns?: { key: string; label: string }[];
    cell?: { type: FieldType; config?: Record<string, unknown> };
    rowHeaderLabel?: string;
  };
  const rows = cfg.rows ?? [];
  const cols = cfg.columns ?? [];
  const cellType = cfg.cell?.type ?? "NUMBER";
  const cellConfig = cfg.cell?.config ?? {};
  const v = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, Record<string, unknown>>;

  const setCell = (rowKey: string, colKey: string, cellVal: unknown) => {
    const nextRow = { ...(v[rowKey] ?? {}), [colKey]: cellVal };
    onChange({ ...v, [rowKey]: nextRow });
  };

  return (
    <div className={styles.repWrap}>
      <div className={styles.repScroll}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th className={styles.matrixCornerHead}>{cfg.rowHeaderLabel || t("templates.builder.matrixParameter")}</th>
              {cols.map((col) => (
                <th key={col.key} className={styles.repColHead}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <th scope="row" className={styles.matrixRowHead}>{row.label}</th>
                {cols.map((col) => (
                  <td key={col.key} className={styles.repCell}>
                    <FieldControl
                      field={cellControlField({ key: `${row.key}__${col.key}`, label: `${row.label} / ${col.label}`, type: cellType, config: cellConfig })}
                      value={v[row.key]?.[col.key]}
                      onChange={(cv) => setCell(row.key, col.key, cv)}
                      readOnly={readOnly}
                      nodeId={nodeId}
                      bare
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  labelByRefId: Map<string, string>,
  t: (k: string) => string,
): string {
  if (value === null || value === undefined || value === "") return "—";
  switch (field.type) {
    case "SELECT":
      return labelByCode.get(value as string) ?? String(value);
    case "REFERENCE":
      return labelByRefId.get(value as string) ?? String(value);
    case "RISK_MATRIX": {
      const level = riskLevelFor(field.config, value);
      if (!level) return "—";
      return `${level.probabilityLabel} × ${level.consequenceLabel} · ${t(`templates.builder.riskLevel.${level.severity}`)}`;
    }
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
