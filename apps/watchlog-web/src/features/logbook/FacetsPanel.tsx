import { useTranslation } from "react-i18next";
import { Filter } from "lucide-react";
import { Skeleton } from "@lyra/ui";
import type { LogEntryFacetBucket, LogEntryFacets } from "@lyra/contracts";
import { formatNumber } from "../../lib/format.js";
import type { LogbookGridState } from "./logbook-filters.js";
import styles from "./Logbook.module.css";

type FacetDim = "status" | "state" | "template" | "equipment" | "band";

interface Props {
  facets: LogEntryFacets | undefined;
  loading: boolean;
  state: LogbookGridState;
  onToggle: (dim: FacetDim, value: string) => void;
}

/** ¿El valor está activo en el filtro actual (para resaltar el bucket)? */
function isActive(dim: FacetDim, value: string, s: LogbookGridState): boolean {
  switch (dim) {
    case "status":
      return s.status === value;
    case "state":
      return s.stateKey === value;
    case "template":
      return s.templateId === value;
    case "equipment":
      return s.equipmentId === value;
    case "band":
      return s.thresholdBand === value;
  }
}

/**
 * Panel de FACETAS con conteo (Fase 2.8.1c, estilo Splunk/Kibana). Conteos de
 * "hermanos" (el backend excluye el propio criterio de cada faceta). Clic en un
 * valor hace toggle del filtro correspondiente (se refleja en la URL/SavedView).
 */
export function FacetsPanel({ facets, loading, state, onToggle }: Props) {
  const { t } = useTranslation();

  const sections: { dim: FacetDim; title: string; buckets: LogEntryFacetBucket[] }[] = facets
    ? [
        { dim: "status", title: t("logbook.list.status"), buckets: facets.status },
        { dim: "band", title: t("logbook.facets.band"), buckets: facets.band },
        { dim: "state", title: t("logbook.list.state"), buckets: facets.state },
        { dim: "template", title: t("logbook.list.template"), buckets: facets.template },
        { dim: "equipment", title: t("logbook.list.equipment"), buckets: facets.equipment },
      ]
    : [];

  return (
    <aside className={styles.facets} aria-label={t("logbook.facets.title")}>
      <div className={styles.facetsHeader}>
        <Filter size={14} />
        <span>{t("logbook.facets.title")}</span>
      </div>
      {loading && !facets ? (
        <div className={styles.facetsLoading}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={14} width="80%" />
          ))}
        </div>
      ) : (
        sections
          .filter((sec) => sec.buckets.length > 0)
          .map((sec) => (
            <section key={sec.dim} className={styles.facetGroup}>
              <h4 className={styles.facetTitle}>{sec.title}</h4>
              <ul className={styles.facetList}>
                {sec.buckets.map((b) => {
                  const active = isActive(sec.dim, b.value, state);
                  // Etiqueta legible: status/band se traducen; el resto viene resuelto del backend.
                  const label =
                    sec.dim === "status"
                      ? t(`logbook.status.${b.value}`)
                      : sec.dim === "band"
                        ? t(`logbook.band.${b.value}`)
                        : b.label;
                  return (
                    <li key={b.value}>
                      <button
                        type="button"
                        className={active ? `${styles.facetItem} ${styles.facetItemActive}` : styles.facetItem}
                        aria-pressed={active}
                        onClick={() => onToggle(sec.dim, b.value)}
                      >
                        {sec.dim === "state" && b.color && (
                          <span className={styles.facetDot} style={{ background: b.color }} />
                        )}
                        <span className={styles.facetLabel} title={label}>
                          {label}
                        </span>
                        <span className={styles.facetCount}>{formatNumber(b.count)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
      {facets && sections.every((s) => s.buckets.length === 0) && (
        <p className={styles.facetsEmpty}>{t("logbook.facets.empty")}</p>
      )}
    </aside>
  );
}
