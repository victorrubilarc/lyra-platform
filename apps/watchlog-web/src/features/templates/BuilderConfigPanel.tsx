import { useTranslation } from "react-i18next";
import { Checkbox, FormField, Input, Select, Textarea, Toggle } from "@lyra/ui";
import type { FieldOption, RoleSummary } from "@lyra/contracts";
import { fieldTypeMeta, slugifyKey, type EditField, type EditSection } from "./builder-model.js";
import styles from "./TemplateBuilder.module.css";

interface BooleanFieldRef {
  key: string;
  label: string;
}

interface BuilderConfigPanelProps {
  section: EditSection | null;
  field: EditField | null;
  roles: RoleSummary[];
  booleanFields: BooleanFieldRef[];
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
    const optionLines = ((field.config.options as FieldOption[] | undefined) ?? []).map((o) => o.label).join("\n");

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
          <FormField label={t("templates.builder.options")}>
            {({ id }) => (
              <Textarea
                id={id}
                rows={4}
                value={optionLines}
                placeholder={t("templates.builder.optionsPlaceholder")}
                onChange={(e) => {
                  const used = new Set<string>();
                  const opts: FieldOption[] = e.target.value
                    .split("\n")
                    .map((l) => l.trim())
                    .filter(Boolean)
                    .map((label, i) => {
                      let value = slugifyKey(label, `op_${i + 1}`);
                      while (used.has(value)) value = `${value}_${i}`;
                      used.add(value);
                      return { value, label };
                    });
                  setConfig("options", opts);
                }}
              />
            )}
          </FormField>
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
            <div className={styles.rolesList}>
              {roles.map((r) => {
                const on = section.roleIds.includes(r.id);
                return (
                  <div key={r.id} className={styles.inlineCheck}>
                    <Checkbox
                      checked={on}
                      label={r.name}
                      onChange={(checked) =>
                        onUpdateSection({
                          roleIds: checked
                            ? [...section.roleIds, r.id]
                            : section.roleIds.filter((x) => x !== r.id),
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
