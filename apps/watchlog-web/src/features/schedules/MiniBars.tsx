import styles from "./MiniBars.module.css";

export interface BarItem {
  label: string;
  value: number;
  tone?: "accent" | "error" | "warn" | "success";
}

/**
 * Gráfica de barras horizontal mínima (sin dependencias, on-prem). Escala al máximo
 * del conjunto; valores con formato regional simple. Para los paneles de análisis del
 * planificador (distribución por área / recurrencia / cumplimiento).
 */
export function MiniBars({ items, empty = "Sin datos" }: { items: BarItem[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (items.length === 0) return <p className={styles.empty}>{empty}</p>;
  return (
    <ul className={styles.bars}>
      {items.map((it) => (
        <li key={it.label} className={styles.row}>
          <span className={styles.label} title={it.label}>{it.label}</span>
          <span className={styles.track}>
            <span className={`${styles.fill} ${styles[`tone_${it.tone ?? "accent"}`]}`} style={{ width: `${(it.value / max) * 100}%` }} />
          </span>
          <span className={styles.value}>{it.value.toLocaleString("es-CL")}</span>
        </li>
      ))}
    </ul>
  );
}
