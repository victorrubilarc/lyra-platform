import { useTranslation } from "react-i18next";
import { Checkbox, FormField, Input, MultiSelect, Select, Textarea, Toggle } from "@lyra/ui";
import type { OptionInlineItem, RoleSummary, WorkflowStateDto } from "@lyra/contracts";
import { useReferenceLists } from "../reference-data/reference-data-queries.js";
import { fieldTypeMeta, slugifyKey, type EditField, type EditSection } from "./builder-model.js";
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
  workflowStates,
  hasWorkflow,
  onUpdateSection,
  onUpdateField,
}: BuilderConfigPanelProps) {
  const { t } = useTranslation();

  // ── Config de CAMPO ────────────────────────────────────────────────────────
  if (field) {
    const meta = fieldTypeMeta(field.type);
    const setConfig = (key: string, value: unknown) => {
      const next = { ...field.config };
      if (value === undefined) delete next[key];
      else next[key] = value;
      onUpdateField({ config: next });
    };
    const isOptions = field.type === "SELECT" || field.type === "MULTISELECT";
    const isDateLike = field.type === "DATE" || field.type === "DATETIME";
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

        <div className={styles.inlineCheck}>
          <Checkbox
            checked={field.required}
            onChange={(checked) => onUpdateField({ required: checked })}
            label={t("templates.builder.required")}
          />
        </div>

        {field.type === "NUMBER" && (
          <>
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

  return (
    <FormField label={t("templates.builder.referenceList")} hint={t("templates.builder.referenceListHint")}>
      {({ id }) => (
        <>
          <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={isLoading}>
            <option value="">{t("templates.builder.referenceListPlaceholder")}</option>
            {lists.map((l) => (
              <option key={l.id} value={l.key}>
                {l.name} ({l.itemCount ?? 0})
              </option>
            ))}
            {value && !known && <option value={value}>{value}</option>}
          </Select>
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
