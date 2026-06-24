import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowUpRight, Clock, Layers, ShieldAlert, TimerOff } from "lucide-react";
import type { CrossStructureCard } from "@lyra/contracts";
import { Card, EmptyState, Spinner } from "@lyra/ui";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../lib/format.js";
import { useCrossDashboard } from "../incidents/incidents-queries.js";
import { useOrgStructures } from "../structure/structure-queries.js";
import { useStructureStore } from "../../shell/structure-store.js";
import { accentCssVar, accentOf, iconComponentOf } from "../structure/structure-identity.js";
import styles from "./panorama.module.css";

const AXIS = "var(--color-text-muted)";
const GRID = "var(--color-border-subtle)";
const TOOLTIP_STYLE = {
  background: "var(--color-bg-surface-2)",
  border: "1px solid var(--color-border-default)",
  borderRadius: 12,
  color: "var(--color-text-primary)",
  fontSize: 12,
};

/**
 * Panorama — vista ejecutiva CROSS-ESTRUCTURA (L3). Consolida KPIs de incidencias de
 * TODAS las estructuras accesibles del gerente a la vez (la EXCEPCIÓN al aislamiento por
 * estructura activa). El ABAC por nodo sigue siendo la frontera: solo aparecen las
 * estructuras donde el usuario tiene nodos accesibles. Drill-down: fija la estructura
 * activa y entra a Incidencias. Read-only.
 */
export function PanoramaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data, isLoading } = useCrossDashboard();
  const { data: structures = [] } = useOrgStructures();
  const setActive = useStructureStore((s) => s.setActiveStructure);

  const defaultById = useMemo(
    () => new Map(structures.map((s) => [s.id, s.isDefault])),
    [structures],
  );

  /** Drill-down: fija la estructura activa (default → null) y navega a Incidencias. */
  function drillDown(card: CrossStructureCard) {
    setActive(defaultById.get(card.structureId) ? null : card.structureId);
    navigate("/incidencias");
  }

  const chartData = useMemo(
    () =>
      (data?.cards ?? []).map((c) => ({
        name: c.name,
        open: c.kpis.open,
        fill: accentCssVar(c),
      })),
    [data],
  );

  const totals = data?.totals;
  const kpiDefs = totals
    ? [
        { key: "open", label: t("panorama.kpi.open"), value: totals.open, icon: AlertTriangle, tone: "" },
        { key: "critical", label: t("panorama.kpi.critical"), value: totals.critical, icon: ShieldAlert, tone: styles.toneCritical },
        { key: "overdue", label: t("panorama.kpi.overdue"), value: totals.overdue, icon: Clock, tone: styles.toneWarn },
        { key: "slaBreached", label: t("panorama.kpi.slaBreached"), value: totals.slaBreached, icon: TimerOff, tone: styles.toneWarn },
      ]
    : [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>
            <Layers size={22} aria-hidden="true" />
            {t("panorama.title")}
          </h1>
          <p className={styles.subtitle}>{t("panorama.subtitle")}</p>
        </div>
      </header>

      {isLoading ? (
        <div className={styles.center}>
          <Spinner />
        </div>
      ) : !data || data.cards.length === 0 ? (
        <EmptyState title={t("panorama.empty")} description={t("panorama.emptyDesc")} />
      ) : (
        <>
          {/* KPIs consolidados (suma de todas las estructuras visibles). */}
          <div className={styles.kpiRow}>
            {kpiDefs.map((k) => {
              const Icon = k.icon;
              return (
                <Card key={k.key} className={styles.kpiCard}>
                  <div className={styles.kpiHead}>
                    <span className={`${styles.kpiIcon} ${k.tone}`}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className={styles.kpiLabel}>{k.label}</span>
                  </div>
                  <div className={styles.kpiValue}>{formatNumber(k.value)}</div>
                </Card>
              );
            })}
          </div>

          {/* Comparativa de incidencias abiertas por estructura. */}
          {chartData.length > 1 && (
            <Card className={styles.chartCard}>
              <h2 className={styles.sectionTitle}>{t("panorama.openByStructure")}</h2>
              <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 46)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
                  <CartesianGrid horizontal={false} stroke={GRID} />
                  <XAxis type="number" allowDecimals={false} stroke={AXIS} fontSize={12} />
                  <YAxis type="category" dataKey="name" width={140} stroke={AXIS} fontSize={12} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--color-hover)" }} />
                  <Bar dataKey="open" name={t("panorama.kpi.open")} radius={[0, 6, 6, 0]}>
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Tarjetas por estructura, con identidad + KPIs + drill-down. */}
          <h2 className={styles.sectionTitle}>{t("panorama.byStructure")}</h2>
          <div className={styles.cardGrid}>
            {data.cards.map((c) => {
              const Icon = iconComponentOf(c);
              return (
                <button
                  key={c.structureId}
                  type="button"
                  className={styles.structureCard}
                  data-accent={accentOf(c)}
                  onClick={() => drillDown(c)}
                  title={t("panorama.openIncidents", { name: c.name })}
                >
                  <div className={styles.cardTop}>
                    <span className={styles.cardIcon}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className={styles.cardName}>{c.name}</span>
                    <ArrowUpRight size={16} className={styles.cardGo} aria-hidden="true" />
                  </div>
                  <div className={styles.cardNodes}>
                    {t("panorama.nodes", { count: c.accessibleNodeCount })}
                  </div>
                  <div className={styles.cardKpis}>
                    <div className={styles.cardKpi}>
                      <span className={styles.cardKpiValue}>{formatNumber(c.kpis.open)}</span>
                      <span className={styles.cardKpiLabel}>{t("panorama.kpi.open")}</span>
                    </div>
                    <div className={styles.cardKpi}>
                      <span className={`${styles.cardKpiValue} ${c.kpis.critical > 0 ? styles.danger : ""}`}>
                        {formatNumber(c.kpis.critical)}
                      </span>
                      <span className={styles.cardKpiLabel}>{t("panorama.kpi.critical")}</span>
                    </div>
                    <div className={styles.cardKpi}>
                      <span className={`${styles.cardKpiValue} ${c.kpis.overdue > 0 ? styles.warn : ""}`}>
                        {formatNumber(c.kpis.overdue)}
                      </span>
                      <span className={styles.cardKpiLabel}>{t("panorama.kpi.overdue")}</span>
                    </div>
                    <div className={styles.cardKpi}>
                      <span className={`${styles.cardKpiValue} ${c.kpis.slaBreached > 0 ? styles.warn : ""}`}>
                        {formatNumber(c.kpis.slaBreached)}
                      </span>
                      <span className={styles.cardKpiLabel}>{t("panorama.kpi.slaBreached")}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
