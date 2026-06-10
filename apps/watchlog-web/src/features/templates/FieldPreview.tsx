import { useState } from "react";
import type { EditField, EditState } from "./builder-model.js";
import { FieldControl } from "./FieldControl.js";
import styles from "./TemplateBuilder.module.css";

type Values = Record<string, unknown>;

/**
 * Vista previa del formulario en el Form Builder. Reusa el `FieldControl`
 * compartido (la misma fuente de render que usa el llenado de bitácoras, 2.4),
 * así builder y llenado nunca divergen.
 */
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
            <FieldControl key={f.uid} field={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} />
          ))}
          {s.fields.length === 0 && <div className={styles.previewEmpty}>—</div>}
        </div>
      ))}
    </div>
  );
}
