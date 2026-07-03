import styles from "./date-range-presets.module.css";

/**
 * Atajos de rango por fecha (Hoy · 24h · 7d · 30d), espejo de los presets de
 * Bitácoras. Reutilizable en cualquier grilla con filtro de rango de creación.
 * Entrega el rango ya calculado como ISO (`onApply(fromIso, toIso)`) para que la
 * página lo lleve a su estado de filtros. «Hoy» = desde las 00:00 de hoy; los demás
 * = ahora menos N días.
 */
export function DateRangePresets({ onApply }: { onApply: (fromIso: string, toIso: string) => void }) {
  const apply = (days: number) => {
    const to = new Date();
    const from = new Date();
    if (days === 0) from.setHours(0, 0, 0, 0);
    else from.setDate(from.getDate() - days);
    onApply(from.toISOString(), to.toISOString());
  };
  return (
    <div className={styles.presets}>
      <button type="button" className={styles.presetBtn} onClick={() => apply(0)}>Hoy</button>
      <button type="button" className={styles.presetBtn} onClick={() => apply(1)}>24h</button>
      <button type="button" className={styles.presetBtn} onClick={() => apply(7)}>7d</button>
      <button type="button" className={styles.presetBtn} onClick={() => apply(30)}>30d</button>
    </div>
  );
}
