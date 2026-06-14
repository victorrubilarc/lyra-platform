import { useTranslation } from "react-i18next";
import { Plus, Trash2, TriangleAlert, Info } from "lucide-react";
import { Card, FormField, Input, Select } from "@lyra/ui";
import type { CrossRule, RuleSeverity } from "@lyra/contracts";
import { ExpressionEditor } from "./ExpressionEditor.js";
import styles from "./TemplateBuilder.module.css";

interface FieldRef {
  key: string;
  label: string;
}

/**
 * Editor de reglas de validación CRUZADA (Req-7) — viven en la versión INMUTABLE.
 * Cada regla: condición de disparo (`when`) → severidad (ERROR bloquea / WARN
 * informa) + mensaje. El backend AUTORIZA; esto solo arma la definición.
 */
export function RulesEditor({
  rules,
  fields,
  canEdit,
  onChange,
}: {
  rules: CrossRule[];
  fields: FieldRef[];
  canEdit: boolean;
  onChange: (rules: CrossRule[]) => void;
}) {
  const { t } = useTranslation();

  function addRule() {
    const n = rules.length + 1;
    const rule: CrossRule = {
      key: `regla_${n}`,
      when: { kind: "op", op: "gt", args: [{ kind: "lit", value: 0 }, { kind: "lit", value: 0 }] },
      severity: "ERROR",
      message: "",
    };
    onChange([...rules, rule]);
  }

  function patchRule(i: number, patch: Partial<CrossRule>) {
    onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className={styles.rulesPanel}>
      <Card className={styles.rulesIntro}>
        <div className={styles.rulesIntroTitle}>{t("templates.rules.title")}</div>
        <p className={styles.thresholdHint}>{t("templates.rules.intro")}</p>
        {canEdit && (
          <button type="button" className={styles.addSectionBtn} onClick={addRule}>
            <Plus size={15} /> {t("templates.rules.add")}
          </button>
        )}
      </Card>

      {rules.length === 0 ? (
        <div className={styles.configEmpty}>{t("templates.rules.empty")}</div>
      ) : (
        rules.map((rule, i) => (
          <Card key={i} className={styles.ruleCard}>
            <div className={styles.ruleHeader}>
              <span className={styles.ruleSeverityIcon}>
                {rule.severity === "ERROR" ? (
                  <TriangleAlert size={16} color="var(--color-error)" />
                ) : (
                  <Info size={16} color="var(--color-warning)" />
                )}
              </span>
              <Input
                aria-label={t("templates.rules.key")}
                value={rule.key}
                disabled={!canEdit}
                className={styles.ruleKeyInput}
                onChange={(e) => patchRule(i, { key: e.target.value })}
              />
              <Select
                aria-label={t("templates.rules.severity")}
                value={rule.severity}
                disabled={!canEdit}
                onChange={(e) => patchRule(i, { severity: e.target.value as RuleSeverity })}
              >
                <option value="ERROR">{t("templates.rules.severityError")}</option>
                <option value="WARN">{t("templates.rules.severityWarn")}</option>
              </Select>
              {canEdit && (
                <button
                  type="button"
                  className={styles.iconBtnDanger}
                  aria-label={t("common.delete")}
                  onClick={() => onChange(rules.filter((_, j) => j !== i))}
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <FormField label={t("templates.rules.when")} hint={t("templates.rules.whenHint")}>
              {() => (
                <ExpressionEditor
                  value={rule.when}
                  fields={fields}
                  onChange={(expr) => patchRule(i, { when: expr })}
                />
              )}
            </FormField>

            <FormField label={t("templates.rules.message")}>
              {({ id }) => (
                <Input
                  id={id}
                  value={rule.message}
                  disabled={!canEdit}
                  placeholder={t("templates.rules.messagePlaceholder")}
                  onChange={(e) => patchRule(i, { message: e.target.value })}
                />
              )}
            </FormField>
          </Card>
        ))
      )}
    </div>
  );
}
