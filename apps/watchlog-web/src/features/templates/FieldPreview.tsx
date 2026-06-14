import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { TriangleAlert, Info } from "lucide-react";
import { deriveDataType, evaluateCrossRules, recomputeComputedValues, type FieldForRules } from "@lyra/contracts";
import type { EditField, EditState } from "./builder-model.js";
import { FieldControl } from "./FieldControl.js";
import { FieldGrid, FieldGridCell } from "./FieldGrid.js";
import styles from "./TemplateBuilder.module.css";

type Values = Record<string, unknown>;

/**
 * Vista previa del formulario en el Form Builder. Reusa el `FieldControl`
 * compartido (la misma fuente de render que usa el llenado de bitácoras, 2.4),
 * así builder y llenado nunca divergen. Recomputa EN VIVO los campos FORMULADOS
 * (Req-7) con la misma función pura del backend y dispara la validación CRUZADA.
 */
export function PreviewForm({ state }: { state: EditState }) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Values>({});
  const setValue = (k: string, v: unknown) => setValues((p) => ({ ...p, [k]: v }));

  const fieldsForRules: FieldForRules[] = useMemo(
    () =>
      state.sections.flatMap((s) =>
        s.fields.map((f) => ({ key: f.key, dataType: deriveDataType(f.type), computed: f.computed })),
      ),
    [state],
  );

  // Foto con los formulados recomputados (idéntica al servidor).
  const display = useMemo(
    () => recomputeComputedValues(fieldsForRules, values),
    [fieldsForRules, values],
  );

  // Reglas cruzadas que dispararían con esta foto (ERROR bloquea / WARN informa).
  const ruleHits = useMemo(
    () => evaluateCrossRules(state.rules, display),
    [state.rules, display],
  );

  const isVisible = (field: EditField): boolean => {
    if (!field.visibleWhen) return true;
    return display[field.visibleWhen.fieldKey] === field.visibleWhen.equals;
  };

  return (
    <div className={styles.previewForm}>
      {(ruleHits.errors.length > 0 || ruleHits.warnings.length > 0) && (
        <div className={styles.previewRuleHits}>
          {ruleHits.errors.map((e) => (
            <div key={`e-${e.ruleKey}`} className={styles.previewRuleError}>
              <TriangleAlert size={14} /> {e.message}
            </div>
          ))}
          {ruleHits.warnings.map((w) => (
            <div key={`w-${w.ruleKey}`} className={styles.previewRuleWarn}>
              <Info size={14} /> {w.message}
            </div>
          ))}
        </div>
      )}
      {state.sections.map((s) => (
        <div key={s.uid} className={styles.previewSection}>
          <div className={styles.previewSectionTitle}>{s.title}</div>
          {s.description && <div className={styles.previewSectionDesc}>{s.description}</div>}
          <FieldGrid>
            {s.fields.filter(isVisible).map((f) => (
              <FieldGridCell key={f.uid} span={f.colSpan}>
                <FieldControl field={f} value={display[f.key]} onChange={(v) => setValue(f.key, v)} />
              </FieldGridCell>
            ))}
          </FieldGrid>
          {s.fields.length === 0 && <div className={styles.previewEmpty}>—</div>}
        </div>
      ))}
      {state.rules.length > 0 && ruleHits.errors.length === 0 && ruleHits.warnings.length === 0 && (
        <p className={styles.thresholdHint}>{t("templates.rules.noneFiring")}</p>
      )}
    </div>
  );
}
