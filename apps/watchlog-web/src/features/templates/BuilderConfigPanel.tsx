import { useTranslation } from "react-i18next";
import { Checkbox, Combobox, FormField, Input, MultiSelect, Select, Textarea, Toggle } from "@lyra/ui";
import { isPresentationalType, type OptionInlineItem, type RoleSummary, type WorkflowStateDto } from "@lyra/contracts";
import { useReferenceLists } from "../reference-data/reference-data-queries.js";
import { fieldDisplayMeta, slugifyKey, WIDTH_PRESETS, type EditField, type EditSection } from "./builder-model.js";
import { ExpressionEditor } from "./ExpressionEditor.js";
import type { RuleFieldRef } from "./expression-meta.js";
import styles from "./TemplateBuilder.module.css";

/** Lee los ítems inline del `optionSource` de un SELECT/MULTISELECT (vacío si no es inline). */
function inlineItems(config: Record<string, unknown>): OptionInlineItem[] {
  const src = config.optionSource as { kind?: string; items?: OptionInlineItem[] } | undefined;
  return src?.kind === "inline" && Array.isArray(src.items) ? src.items : [];
}

/** Tipo de fuente de opciones del campo (inline por defecto). */
function optionSourceKind(config: Record<string, unknown>): "inline" | "referenceList" {
  const src = config.optionSource as { kind?: string } | undefined;
  return src?.kind === "referenceList" ? "referenceList" : "inline";
}

/** `listKey` referenciado (vacío si no es referenceList). */
function referencedListKey(config: Record<string, unknown>): string {
  const src = config.optionSource as { kind?: string; listKey?: string } | undefined;
  return src?.kind === "referenceList" ? (src.listKey ?? "") : "";
}

interface BooleanFieldRef {
  key: string;
  label: string;
}

interface BuilderConfigPanelProps {
  section: EditSection | null;
  field: EditField | null;
  roles: RoleSummary[];
  booleanFields: BooleanFieldRef[];
  /** Todos los campos de la plantilla (key + label + tipo + opciones) para fórmulas. */
  allFields: RuleFieldRef[];
  /** Estados del flujo asignado (para mapear sección → estado editable). */
  workflowStates: WorkflowStateDto[];
  /** Hay un flujo asignado a la versión. */
  hasWorkflow: boolean;
  onUpdateSection: (patch: Partial<EditSection>) => void;
  onUpdateField: (patch: Partial<EditField>) => void;
}

function numberConfigField(
  config: Record<string, unknown>,
  key: string,
  label: string,
  onSet: (key: string, value: number | undefined) => void,
) {
  const raw = config[key];
  return (
    <FormField label={label}>
      {({ id }) => (
        <Input
          id={id}
          type="number"
          value={raw === undefined || raw === null ? "" : String(raw)}
          onChange={(e) => onSet(key, e.target.value === "" ? undefined : Number(e.target.value))}
        />
      )}
    </FormField>
  );
}

export function BuilderConfigPanel({
  section,
  field,
  roles,
  booleanFields,
  allFields,
  workflowStates,
  hasWorkflow,
  onUpdateSection,
  onUpdateField,
}: BuilderConfigPanelProps) {
  const { t } = useTranslation();

  // ── Config de CAMPO ────────────────────────────────────────────────────────
  if (field) {
    const meta = fieldDisplayMeta(field);
    const setConfig = (key: string, value: unknown) => {
      const next = { ...field.config };
      if (value === undefined) delete next[key];
      else next[key] = value;
      onUpdateField({ config: next });
    };
    const isOptions = field.type === "SELECT" || field.type === "MULTISELECT";
    const isDateLike = field.type === "DATE" || field.type === "DATETIME";
    const isPresentational = isPresentationalType(field.type);
    const optionLines = inlineItems(field.config)
      .map((o) => o.label)
      .join("\n");

    return (
      <div className={styles.configBody}>
        <div className={styles.configTypeTag}>{t(meta.labelKey)}</div>

        <FormField label={t("templates.builder.fieldLabel")}>
          {({ id }) => <Input id={id} value={field.label} onChange={(e) => onUpdateField({ label: e.target.value })} />}
        </FormField>

        <FormField label={t("templates.builder.fieldHelp")}>
          {({ id }) => (
            <Input id={id} value={field.help ?? ""} onChange={(e) => onUpdateField({ help: e.target.value || null })} />
          )}
        </FormField>

        {/* Ancho del campo en la grilla de 12 (Fase 2.1.3): presentación pura, aplica a todos
            los tipos. Presets rápidos; el ajuste fino se hace arrastrando el borde en el lienzo. */}
        <FormField label={t("templates.builder.layoutWidth")} hint={t("templates.builder.layoutWidthHint")}>
          {() => (
            <div className={styles.widthSeg} role="group" aria-label={t("templates.builder.layoutWidth")}>
              {WIDTH_PRESETS.map((p) => (
                <button
                  key={p.span}
                  type="button"
                  className={styles.widthSegBtn}
                  data-on={field.colSpan === p.span}
                  onClick={() => onUpdateField({ colSpan: p.span })}
                  title={t(p.labelKey)}
                >
                  {p.glyph}
                </button>
              ))}
            </div>
          )}
        </FormField>

        {isPresentational && <p className={styles.modeledNote}>{t("templates.builder.presentationalNote")}</p>}

        {!field.computed && !isPresentational && (
          <div className={styles.inlineCheck}>
            <Checkbox
              checked={field.required}
              onChange={(checked) => onUpdateField({ required: checked })}
              label={t("templates.builder.required")}
            />
          </div>
        )}

        {/* Campo FORMULADO (Req-7): valor derivado de una fórmula (read-only). */}
        {field.type !== "SIGNATURE" && !isPresentational && (
          <div className={styles.computedBox}>
            <div className={styles.inlineCheck}>
              <Toggle
                checked={!!field.computed}
                onChange={(checked) =>
                  onUpdateField({
                    computed: checked ? { expression: { kind: "lit", value: 0 } } : null,
                    required: checked ? false : field.required,
                  })
                }
                aria-label={t("templates.builder.computedField")}
              />
              <span>{t("templates.builder.computedField")}</span>
            </div>
            {field.computed && (
              <>
                <p className={styles.thresholdHint}>{t("templates.builder.computedFieldHint")}</p>
                <ExpressionEditor
                  value={field.computed.expression}
                  fields={allFields.filter((f) => f.key !== field.key)}
                  onChange={(expr) => onUpdateField({ computed: { expression: expr } })}
                />
              </>
            )}
          </div>
        )}

        {field.type === "TEXT" && (
          <FormField label={t("templates.builder.textFormat")}>
            {({ id }) => (
              <Select
                id={id}
                value={(field.config.format as string) ?? ""}
                onChange={(e) => setConfig("format", e.target.value || undefined)}
              >
                <option value="">{t("templates.builder.textFormatNone")}</option>
                <option value="rut">{t("templates.builder.textFormatRut")}</option>
                <option value="email">{t("templates.builder.textFormatEmail")}</option>
                <option value="phone">{t("templates.builder.textFormatPhone")}</option>
                <option value="url">{t("templates.builder.textFormatUrl")}</option>
              </Select>
            )}
          </FormField>
        )}

        {field.type === "NUMBER" && (
          <>
            <FormField label={t("templates.builder.numberFormat")}>
              {({ id }) => (
                <Select
                  id={id}
                  value={(field.config.format as string) ?? ""}
                  onChange={(e) => {
                    const fmt = e.target.value || undefined;
                    setConfig("format", fmt);
                    if (fmt !== "currency") setConfig("currency", undefined);
                    else if (!field.config.currency) setConfig("currency", "CLP");
                  }}
                >
                  <option value="">{t("templates.builder.numberFormatNone")}</option>
                  <option value="percent">{t("templates.builder.numberFormatPercent")}</option>
                  <option value="currency">{t("templates.builder.numberFormatCurrency")}</option>
                </Select>
              )}
            </FormField>
            {field.config.format === "currency" && (
              <FormField label={t("templates.builder.currency")}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={(field.config.currency as string) ?? "CLP"}
                    maxLength={3}
                    onChange={(e) => setConfig("currency", e.target.value.toUpperCase() || undefined)}
                  />
                )}
              </FormField>
            )}
            {field.config.format !== "percent" && field.config.format !== "currency" && (
              <FormField label={t("templates.builder.unit")}>
                {({ id }) => (
                  <Input
                    id={id}
                    value={(field.config.unit as string) ?? ""}
                    onChange={(e) => setConfig("unit", e.target.value || undefined)}
                    placeholder="°C, bar, t…"
                  />
                )}
              </FormField>
            )}
            <div className={styles.twoCol}>
              {numberConfigField(field.config, "min", t("templates.builder.min"), setConfig)}
              {numberConfigField(field.config, "max", t("templates.builder.max"), setConfig)}
            </div>
            <div className={styles.thresholdBox}>
              <div className={styles.thresholdTitle}>{t("templates.builder.thresholds")}</div>
              <p className={styles.thresholdHint}>{t("templates.builder.thresholdsHint")}</p>
              <div className={styles.twoCol}>
                {numberConfigField(field.config, "warnLow", t("templates.builder.warnLow"), setConfig)}
                {numberConfigField(field.config, "warnHigh", t("templates.builder.warnHigh"), setConfig)}
              </div>
              <div className={styles.twoCol}>
                {numberConfigField(field.config, "critLow", t("templates.builder.critLow"), setConfig)}
                {numberConfigField(field.config, "critHigh", t("templates.builder.critHigh"), setConfig)}
              </div>
            </div>
          </>
        )}

        {isOptions && (
          <>
            <FormField label={t("templates.builder.displayAs")}>
              {({ id }) => (
                <Select
                  id={id}
                  value={(field.config.displayAs as string) ?? "dropdown"}
                  onChange={(e) => setConfig("displayAs", e.target.value)}
                >
                  {field.type === "SELECT" ? (
                    <>
                      <option value="dropdown">{t("templates.builder.displayDropdown")}</option>
                      <option value="radio">{t("templates.builder.displayRadio")}</option>
                      <option value="segmented">{t("templates.builder.displaySegmented")}</option>
                    </>
                  ) : (
                    <>
                      <option value="dropdown">{t("templates.builder.displayDropdown")}</option>
                      <option value="checkboxes">{t("templates.builder.displayCheckboxes")}</option>
                      <option value="modal">{t("templates.builder.displayModal")}</option>
                    </>
                  )}
                </Select>
              )}
            </FormField>
            <FormField label={t("templates.builder.optionSource")} hint={t("templates.builder.optionSourceHint")}>
              {({ id }) => (
                <Select
                  id={id}
                  value={optionSourceKind(field.config)}
                  onChange={(e) => {
                    const kind = e.target.value;
                    if (kind === "referenceList") setConfig("optionSource", { kind: "referenceList", listKey: "" });
                    else setConfig("optionSource", { kind: "inline", items: inlineItems(field.config) });
                  }}
                >
                  <option value="inline">{t("templates.builder.optionSourceInline")}</option>
                  <option value="referenceList">{t("templates.builder.optionSourceReference")}</option>
                </Select>
              )}
            </FormField>

            {optionSourceKind(field.config) === "inline" ? (
              <FormField label={t("templates.builder.options")}>
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={4}
                    value={optionLines}
                    placeholder={t("templates.builder.optionsPlaceholder")}
                    onChange={(e) => {
                      const used = new Set<string>();
                      const items: OptionInlineItem[] = e.target.value
                        .split("\n")
                        .map((l) => l.trim())
                        .filter(Boolean)
                        .map((label, i) => {
                          // El `code` es el valor estable que se persiste (no el label).
                          let code = slugifyKey(label, `op_${i + 1}`);
                          while (used.has(code)) code = `${code}_${i}`;
                          used.add(code);
                          return { code, label };
                        });
                      setConfig("optionSource", { kind: "inline", items });
                    }}
                  />
                )}
              </FormField>
            ) : (
              <ReferenceListPicker
                value={referencedListKey(field.config)}
                onChange={(listKey) => setConfig("optionSource", { kind: "referenceList", listKey })}
              />
            )}
          </>
        )}

        {isDateLike && (
          <div className={styles.inlineCheck}>
            <Checkbox
              checked={field.semanticRole === "EFFECTIVE_DATE"}
              onChange={(checked) => onUpdateField({ semanticRole: checked ? "EFFECTIVE_DATE" : null })}
              label={t("templates.builder.effectiveDate")}
            />
          </div>
        )}
        {isDateLike && field.semanticRole === "EFFECTIVE_DATE" && (
          <p className={styles.thresholdHint}>{t("templates.builder.effectiveDateHint")}</p>
        )}

        {field.type === "CONFORMITY" && (
          <div className={styles.inlineCheck}>
            <Checkbox
              checked={(field.config.allowNa as boolean) !== false}
              onChange={(checked) => setConfig("allowNa", checked ? undefined : false)}
              label={t("templates.builder.conformityAllowNa")}
            />
          </div>
        )}

        {field.type === "RATING" && (
          <>
            <FormField label={t("templates.builder.ratingStyle")}>
              {({ id }) => (
                <Select id={id} value={(field.config.style as string) ?? "stars"} onChange={(e) => setConfig("style", e.target.value)}>
                  <option value="stars">{t("templates.builder.ratingStyleStars")}</option>
                  <option value="numeric">{t("templates.builder.ratingStyleNumeric")}</option>
                  <option value="likert">{t("templates.builder.ratingStyleLikert")}</option>
                </Select>
              )}
            </FormField>
            <FormField label={t("templates.builder.ratingMax")}>
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={2}
                  max={10}
                  value={String((field.config.max as number) ?? 5)}
                  onChange={(e) => setConfig("max", e.target.value === "" ? undefined : Number(e.target.value))}
                />
              )}
            </FormField>
            {field.config.style === "likert" && (
              <FormField label={t("templates.builder.ratingLabels")}>
                {({ id }) => (
                  <Textarea
                    id={id}
                    rows={3}
                    value={Array.isArray(field.config.labels) ? (field.config.labels as string[]).join("\n") : ""}
                    onChange={(e) => {
                      const labels = e.target.value.split("\n").map((l) => l.trim()).filter(Boolean);
                      setConfig("labels", labels.length ? labels : undefined);
                    }}
                  />
                )}
              </FormField>
            )}
          </>
        )}

        {field.type === "RANGE" && (
          <>
            <FormField label={t("templates.builder.unit")}>
              {({ id }) => (
                <Input id={id} value={(field.config.unit as string) ?? ""} onChange={(e) => setConfig("unit", e.target.value || undefined)} placeholder="°C, bar…" />
              )}
            </FormField>
            <div className={styles.twoCol}>
              {numberConfigField(field.config, "min", t("templates.builder.min"), setConfig)}
              {numberConfigField(field.config, "max", t("templates.builder.max"), setConfig)}
            </div>
          </>
        )}

        {field.type === "HEADING" && (
          <FormField label={t("templates.builder.headingLevel")}>
            {({ id }) => (
              <Select id={id} value={String((field.config.level as number) ?? 2)} onChange={(e) => setConfig("level", Number(e.target.value))}>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </Select>
            )}
          </FormField>
        )}

        {(field.type === "STATIC_TEXT" || field.type === "NOTICE") && (
          <FormField label={t("templates.builder.bodyText")}>
            {({ id }) => (
              <Textarea
                id={id}
                rows={3}
                value={(field.config.text as string) ?? ""}
                placeholder={t("templates.builder.bodyTextPlaceholder")}
                onChange={(e) => setConfig("text", e.target.value || undefined)}
              />
            )}
          </FormField>
        )}

        {field.type === "NOTICE" && (
          <FormField label={t("templates.builder.noticeVariant")}>
            {({ id }) => (
              <Select id={id} value={(field.config.variant as string) ?? "info"} onChange={(e) => setConfig("variant", e.target.value)}>
                <option value="info">{t("templates.builder.noticeInfo")}</option>
                <option value="warning">{t("templates.builder.noticeWarning")}</option>
                <option value="success">{t("templates.builder.noticeSuccess")}</option>
                <option value="danger">{t("templates.builder.noticeDanger")}</option>
              </Select>
            )}
          </FormField>
        )}

        {field.type === "DIVIDER" && (
          <FormField label={t("templates.builder.dividerSpacing")}>
            {({ id }) => (
              <Select id={id} value={(field.config.spacing as string) ?? "md"} onChange={(e) => setConfig("spacing", e.target.value)}>
                <option value="sm">{t("templates.builder.spacingSm")}</option>
                <option value="md">{t("templates.builder.spacingMd")}</option>
                <option value="lg">{t("templates.builder.spacingLg")}</option>
              </Select>
            )}
          </FormField>
        )}

        {field.type === "PROCEDURE_LINK" && (
          <>
            <FormField label={t("templates.builder.linkUrl")}>
              {({ id }) => (
                <Input id={id} type="url" value={(field.config.url as string) ?? ""} onChange={(e) => setConfig("url", e.target.value || undefined)} placeholder="https://…" />
              )}
            </FormField>
            <FormField label={t("templates.builder.linkText")}>
              {({ id }) => (
                <Input id={id} value={(field.config.linkText as string) ?? ""} onChange={(e) => setConfig("linkText", e.target.value || undefined)} />
              )}
            </FormField>
          </>
        )}

        {field.type === "REFERENCE_IMAGE" && (
          <>
            <FormField label={t("templates.builder.imageUrl")}>
              {({ id }) => (
                <Input id={id} type="url" value={(field.config.url as string) ?? ""} onChange={(e) => setConfig("url", e.target.value || undefined)} placeholder="https://…" />
              )}
            </FormField>
            <FormField label={t("templates.builder.imageAlt")}>
              {({ id }) => (
                <Input id={id} value={(field.config.alt as string) ?? ""} onChange={(e) => setConfig("alt", e.target.value || undefined)} />
              )}
            </FormField>
            <FormField label={t("templates.builder.imageCaption")}>
              {({ id }) => (
                <Input id={id} value={(field.config.caption as string) ?? ""} onChange={(e) => setConfig("caption", e.target.value || undefined)} />
              )}
            </FormField>
          </>
        )}

        {(field.type === "SEVERITY" || field.type === "SIGNATURE") && (
          <p className={styles.modeledNote}>{t("templates.builder.modeledLater")}</p>
        )}

        {booleanFields.length > 0 && (
          <FormField label={t("templates.builder.visibleWhen")}>
            {({ id }) => (
              <Select
                id={id}
                value={field.visibleWhen?.fieldKey ?? ""}
                onChange={(e) =>
                  onUpdateField({ visibleWhen: e.target.value ? { fieldKey: e.target.value, equals: true } : null })
                }
              >
                <option value="">{t("templates.builder.visibleAlways")}</option>
                {booleanFields
                  .filter((b) => b.key !== field.key)
                  .map((b) => (
                    <option key={b.key} value={b.key}>
                      {b.label} {t("templates.builder.visibleWhenSuffix")}
                    </option>
                  ))}
              </Select>
            )}
          </FormField>
        )}

        {/* Override de permiso por campo (TemplateFieldRole): vacío = hereda la sección. */}
        <div>
          <div className={styles.configSubLabel}>{t("templates.builder.fieldRoles")}</div>
          <p className={styles.thresholdHint}>{t("templates.builder.fieldRolesHint")}</p>
          {roles.length === 0 ? (
            <p className={styles.modeledNote}>{t("templates.builder.noRoles")}</p>
          ) : (
            <MultiSelect
              options={roles.map((r) => ({ value: r.id, label: r.name, hint: r.key }))}
              value={field.roleIds}
              onChange={(ids) => onUpdateField({ roleIds: ids })}
              ariaLabel={t("templates.builder.fieldRoles")}
              placeholder={t("templates.builder.fieldRolesPlaceholder")}
              searchPlaceholder={t("common.search")}
              selectAllLabel={t("common.selectAll")}
              clearLabel={t("common.clear")}
              noMatchText={t("common.noResults")}
              emptyText={t("templates.builder.noRoles")}
            />
          )}
        </div>
      </div>
    );
  }

  // ── Config de SECCIÓN ──────────────────────────────────────────────────────
  if (section) {
    return (
      <div className={styles.configBody}>
        <FormField label={t("templates.builder.sectionTitle")}>
          {({ id }) => <Input id={id} value={section.title} onChange={(e) => onUpdateSection({ title: e.target.value })} />}
        </FormField>

        <FormField label={t("templates.builder.sectionDescription")}>
          {({ id }) => (
            <Textarea
              id={id}
              rows={2}
              value={section.description ?? ""}
              onChange={(e) => onUpdateSection({ description: e.target.value || null })}
            />
          )}
        </FormField>

        <div>
          <div className={styles.configSubLabel}>{t("templates.builder.sectionRoles")}</div>
          <p className={styles.thresholdHint}>{t("templates.builder.sectionRolesHint")}</p>
          {roles.length === 0 ? (
            <p className={styles.modeledNote}>{t("templates.builder.noRoles")}</p>
          ) : (
            <MultiSelect
              options={roles.map((r) => ({ value: r.id, label: r.name, hint: r.key }))}
              value={section.roleIds}
              onChange={(ids) => onUpdateSection({ roleIds: ids })}
              ariaLabel={t("templates.builder.sectionRoles")}
              placeholder={t("templates.builder.rolesPlaceholder")}
              searchPlaceholder={t("common.search")}
              selectAllLabel={t("common.selectAll")}
              clearLabel={t("common.clear")}
              noMatchText={t("common.noResults")}
              emptyText={t("templates.builder.noRoles")}
            />
          )}
        </div>

        {/* Estado del flujo en que la sección es editable (Fase 2.2). */}
        {hasWorkflow && (
          <FormField label={t("templates.builder.editableInState")} hint={t("templates.builder.editableInStateHint")}>
            {({ id }) => (
              <Select
                id={id}
                value={section.editableInStateKey ?? ""}
                onChange={(e) => onUpdateSection({ editableInStateKey: e.target.value || null })}
              >
                <option value="">{t("templates.builder.editableAlways")}</option>
                {workflowStates.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}

        <div className={styles.inlineCheck}>
          <Toggle
            checked={section.requireSignature}
            onChange={(checked) => onUpdateSection({ requireSignature: checked })}
            aria-label={t("templates.builder.requireSignature")}
          />
          <span>{t("templates.builder.requireSignature")}</span>
        </div>
        <p className={styles.thresholdHint}>{t("templates.builder.requireSignatureHint")}</p>
      </div>
    );
  }

  return <div className={styles.configEmpty}>{t("templates.builder.selectToConfig")}</div>;
}

/**
 * Selector de Lista de Referencia para un campo SELECT/MULTISELECT. Las opciones
 * se resuelven desde la lista en la vista previa (muestra label, guarda code). Si
 * la lista referenciada ya no existe en el catálogo, se conserva y se avisa.
 */
function ReferenceListPicker({ value, onChange }: { value: string; onChange: (listKey: string) => void }) {
  const { t } = useTranslation();
  const { data: lists = [], isLoading } = useReferenceLists();
  const known = lists.some((l) => l.key === value);
  const selected = lists.find((l) => l.key === value);

  const opts = lists.map((l) => ({
    value: l.key,
    label: `${l.name} (${l.itemCount ?? 0})`,
    hint: l.key,
  }));
  if (value && !known) opts.push({ value, label: value, hint: value });

  return (
    <FormField label={t("templates.builder.referenceList")} hint={t("templates.builder.referenceListHint")}>
      {({ id }) => (
        <>
          <Combobox
            id={id}
            value={value}
            onChange={onChange}
            options={opts}
            disabled={isLoading}
            placeholder={t("templates.builder.referenceListPlaceholder")}
            searchPlaceholder={t("referenceData.search")}
            ariaLabel={t("templates.builder.referenceList")}
          />
          {value && !known && !isLoading && (
            <p className={styles.thresholdHint} style={{ color: "var(--color-warning)" }}>
              {t("templates.builder.referenceListMissing", { key: value })}
            </p>
          )}
          {selected && !selected.active && (
            <p className={styles.thresholdHint} style={{ color: "var(--color-warning)" }}>
              {t("templates.builder.referenceListInactive")}
            </p>
          )}
        </>
      )}
    </FormField>
  );
}
