import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowLeft, BarChart3, Download } from "lucide-react";
import type { DashboardDimensionSlice, WorkOrderDashboardQuery } from "@lyra/contracts";
import { paretoOrder } from "@lyra/contracts";
import { Button, Card, Select, Spinner } from "@lyra/ui";
import { formatLocalDate, formatNumber, formatPercent } from "../../lib/format.js";
import { useWorkOrderDashboard, useWorkOrderSpecialties, useWorkOrderTypes } from "./work-orders-queries.js";
import { ORIGIN_META, PRIORITY_META, criticalityColor } from "./work-orders-presentation.js";
import styles from "./dashboard.module.css";

/** Paleta categórica (tokens del DS; tema-aware). Para dimensiones sin color propio. */
const PALETTE = [
  "var(--color-accent-primary)",
  "var(--color-accent-secondary)",
  "#84CC16",
  "#F59E0B",
  "#A855F7",
  "#14B8A6",
  "#F97316",
  "#EC4899",
];

const AXIS = "var(--color-text-muted)";
const GRID = "var(--color-border-subtle)";

const TOOLTIP_STYLE = {
  background: "var(--color-bg-surface-2)",
  border: "1px solid var(--color-border-default)",
  borderRadius: 12,
  color: "var(--color-text-primary)",
  fontSize: 12,
};

function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Etiqueta compacta "dd mmm" de un bucket "YYYY-MM-DD" (regional, sin desfase de TZ). */
function shortBucketLabel(isoDate: string): string {
  return formatLocalDate(isoDate, { day: "2-digit", month: "short" });
}

const QUICK_RANGES = [
  { days: 30, label: "30 días" },
  { days: 90, label: "90 días" },
  { days: 365, label: "12 meses" },
];

export function WorkOrderDashboardPage() {
  const navigate = useNavigate();
  const { data: types = [] } = useWorkOrderTypes();
  const { data: specialties = [] } = useWorkOrderSpecialties();

  const todayStr = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(todayMinus(90));
  const [to, setTo] = useState(todayStr);
  const [typeId, setTypeId] = useState("");
  const [criticality, setCriticality] = useState("");
  const [specialtyId, setSpecialtyId] = useState("");
  const [origin, setOrigin] = useState("");

  const query: WorkOrderDashboardQuery = useMemo(
    () => ({
      createdFrom: from ? new Date(from + "T00:00:00") : undefined,
      createdTo: to ? new Date(to + "T23:59:59") : undefined,
      typeId: typeId || undefined,
      criticality: criticality ? Number(criticality) : undefined,
      specialtyId: specialtyId || undefined,
      originType: (origin || undefined) as WorkOrderDashboardQuery["originType"],
    }),
    [from, to, typeId, criticality, specialtyId, origin],
  );

  const { data, isLoading } = useWorkOrderDashboard(query);

  /** Navega a la lista con el rango activo + el filtro de la dimensión clicada (drill-down). */
  function drill(extra: Record<string, string>) {
    const p = new URLSearchParams();
    if (from) p.set("createdFrom", new Date(from + "T00:00:00").toISOString());
    if (to) p.set("createdTo", new Date(to + "T23:59:59").toISOString());
    if (typeId) p.set("typeId", typeId);
    if (criticality) p.set("criticality", criticality);
    if (specialtyId) p.set("specialtyId", specialtyId);
    if (origin) p.set("originType", origin);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    navigate(`/ordenes-trabajo?${p.toString()}`);
  }

  const kpis = data?.kpis;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.crumb}>
            <Link to="/ordenes-trabajo" className={styles.back}>
              <ArrowLeft size={14} /> Órdenes de trabajo
            </Link>
          </div>
          <h1 className={styles.h1}>
            <BarChart3 size={22} /> Dashboard de órdenes de trabajo
          </h1>
          <p className={styles.sub}>Tendencias e indicadores de gestión. Solo lo que puedes ver (alcance por nodo).</p>
        </div>
        <Button
          variant="secondary"
          leftIcon={<Download size={16} />}
          disabled={!data}
          onClick={() => data && exportCsv(data)}
        >
          Exportar CSV
        </Button>
      </header>

      {/* Filtros en UNA línea: rangos rápidos + fechas + dimensiones */}
      <div className={styles.toolbar}>
        <div className={styles.quickRanges}>
          {QUICK_RANGES.map((r) => {
            const active = from === todayMinus(r.days) && to === todayStr;
            return (
              <button
                key={r.days}
                type="button"
                className={active ? styles.rangeActive : styles.range}
                onClick={() => { setFrom(todayMinus(r.days)); setTo(todayStr); }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
        <span className={styles.vsep} />
        <label className={styles.dateField}>
          Desde
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={styles.dateInput} />
        </label>
        <label className={styles.dateField}>
          Hasta
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={styles.dateInput} />
        </label>
        <span className={styles.spacer} />
        <Select value={typeId} onChange={(e) => setTypeId(e.target.value)} aria-label="Tipo" className={styles.sel}>
          <option value="">Todos los tipos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        <Select value={criticality} onChange={(e) => setCriticality(e.target.value)} aria-label="Criticidad" className={styles.selSm}>
          <option value="">Toda criticidad</option>
          {[5, 4, 3, 2, 1].map((c) => (
            <option key={c} value={c}>Criticidad {c}</option>
          ))}
        </Select>
        <Select value={specialtyId} onChange={(e) => setSpecialtyId(e.target.value)} aria-label="Especialidad" className={styles.selSm}>
          <option value="">Toda especialidad</option>
          {specialties.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        <Select value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Origen" className={styles.selSm}>
          <option value="">Todo origen</option>
          {Object.entries(ORIGIN_META).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </Select>
      </div>

      {isLoading && !data ? (
        <div className={styles.loading}><Spinner /></div>
      ) : !data ? null : (
        <>
          {/* === KPIs: estado vivo vs. periodo === */}
          {kpis && (
            <>
              <section className={styles.kpiSection}>
                <div className={styles.kpiGroupLabel}>Estado actual <span>en vivo</span></div>
                <div className={styles.kpis}>
                  <Kpi label="Borradores" value={kpis.draft} color="#9AA3B8" onClick={() => drill({ lifecycle: "DRAFT" })} />
                  <Kpi label="Abiertas" value={kpis.open} color="#6366F1" onClick={() => drill({ lifecycle: "OPEN" })} />
                  <Kpi label="Críticas" value={kpis.critical} color="#EF4444" onClick={() => drill({ lifecycle: "OPEN", criticality: "5" })} />
                  <Kpi label="Sin responsable" value={kpis.unassigned} color="#EAB308" onClick={() => drill({ lifecycle: "OPEN", unassignedOnly: "true" })} />
                  <Kpi label="Plazo vencido" value={kpis.overdue} color="#F97316" onClick={() => drill({ slaStatus: "overdue" })} />
                  <Kpi label="Por vencer" value={kpis.atRisk} color="#EAB308" onClick={() => drill({ slaStatus: "atRisk" })} />
                  <Kpi label="Estancadas" value={kpis.stalled} color="#EF4444" onClick={() => drill({ slaStatus: "stalled" })} />
                  <Kpi label="Con PTW" value={kpis.ptw} color="#06B6D4" onClick={() => drill({ requiresPtw: "true" })} />
                </div>
              </section>

              <section className={styles.kpiSection}>
                <div className={styles.kpiGroupLabel}>En el periodo</div>
                <div className={styles.kpis}>
                  <Kpi label="Creadas" value={kpis.created} color="#6366F1" />
                  <Kpi label="Cerradas" value={kpis.closed} color="#22C55E" />
                  <Kpi label="MTTR" value={kpis.mttrHours === null ? "—" : `${formatNumber(kpis.mttrHours, { maximumFractionDigits: 1 })} h`} color="#A855F7" />
                  <Kpi label="Cumplimiento SLA" value={kpis.slaCompliancePct === null ? "—" : formatPercent(kpis.slaCompliancePct / 100)} color="#22C55E" />
                </div>
              </section>
            </>
          )}

          {/* === Tendencia creación vs cierre === */}
          <Card className={styles.chartCard}>
            <div className={styles.chartHead}>
              <h2 className={styles.chartTitle}>Tendencia: creación vs. cierre</h2>
              <span className={styles.legend}>
                <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "#6366F1" }} /> Creadas</span>
                <span className={styles.legendItem}><span className={styles.legendDot} style={{ background: "#22C55E" }} /> Cerradas</span>
              </span>
            </div>
            {data.trend.length === 0 ? (
              <p className={styles.empty}>Sin datos en el periodo.</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={data.trend} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="woCreated" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="woClosed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22C55E" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#22C55E" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="bucket" stroke={AXIS} fontSize={11} tickFormatter={(b) => shortBucketLabel(String(b))} />
                  <YAxis stroke={AXIS} fontSize={11} width={32} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(b) => formatLocalDate(String(b))} />
                  <Area type="monotone" dataKey="created" name="Creadas" stroke="#6366F1" strokeWidth={2.5} fill="url(#woCreated)" />
                  <Area type="monotone" dataKey="closed" name="Cerradas" stroke="#22C55E" strokeWidth={2.5} fill="url(#woClosed)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </Card>

          <div className={styles.grid2}>
            {/* Pareto por tipo */}
            <Card className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Por tipo (Pareto)</h2>
              <ParetoChart slices={data.byType} onSelect={(key) => drill({ typeId: key })} />
            </Card>

            {/* Dona por criticidad */}
            <Card className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Por criticidad</h2>
              {data.byCriticality.length === 0 ? (
                <p className={styles.empty}>Sin datos.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={data.byCriticality}
                      dataKey="count"
                      nameKey="label"
                      innerRadius={56}
                      outerRadius={88}
                      paddingAngle={3}
                      onClick={(e: { key?: string }) => e.key && drill({ criticality: e.key })}
                      cursor="pointer"
                    >
                      {data.byCriticality.map((s) => (
                        <Cell key={s.key} fill={criticalityColor(Number(s.key))} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, _n, p: { payload?: DashboardDimensionSlice }) => [v, `Criticidad ${p?.payload?.key}`]} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            {/* Por nodo */}
            <Card className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Por nodo</h2>
              <DimensionBars slices={data.byNode} onSelect={(key) => drill({ orgNodeIds: key })} />
            </Card>

            {/* Por especialidad */}
            <Card className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Por especialidad</h2>
              <DimensionBars slices={data.bySpecialty} onSelect={(key) => drill({ specialtyId: key })} />
            </Card>

            {/* Por estado del workflow */}
            <Card className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Por estado</h2>
              <DimensionBars slices={data.byState} />
            </Card>

            {/* Por prioridad */}
            <Card className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Por prioridad</h2>
              <DimensionBars
                slices={data.byPriority.map((s) => ({
                  ...s,
                  label: PRIORITY_META[s.key as keyof typeof PRIORITY_META]?.label ?? s.label,
                  color: PRIORITY_META[s.key as keyof typeof PRIORITY_META]?.color ?? s.color ?? null,
                }))}
                onSelect={(key) => drill({ priority: key })}
              />
            </Card>

            {/* Por origen */}
            <Card className={styles.chartCard}>
              <h2 className={styles.chartTitle}>Por origen</h2>
              <DimensionBars
                slices={data.byOrigin.map((s) => ({ ...s, label: ORIGIN_META[s.key as keyof typeof ORIGIN_META]?.label ?? s.label }))}
                onSelect={(key) => drill({ originType: key })}
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, color, onClick }: { label: string; value: number | string; color: string; onClick?: () => void }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={onClick ? `${styles.kpi} ${styles.kpiClickable}` : styles.kpi}
      onClick={onClick}
      style={{ ["--kpi" as string]: color }}
    >
      <span className={styles.kpiValue}>{typeof value === "number" ? formatNumber(value) : value}</span>
      <span className={styles.kpiLabel}>{label}</span>
    </Tag>
  );
}

/** Barras horizontales por dimensión (top-N), clicables para drill-down. */
function DimensionBars({ slices, onSelect }: { slices: DashboardDimensionSlice[]; onSelect?: (key: string) => void }) {
  if (slices.length === 0) return <p className={styles.empty}>Sin datos.</p>;
  const height = Math.max(160, slices.length * 34 + 24);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={slices} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={GRID} horizontal={false} />
        <XAxis type="number" stroke={AXIS} fontSize={11} allowDecimals={false} />
        <YAxis type="category" dataKey="label" stroke={AXIS} fontSize={11} width={120} tickFormatter={(s: string) => (s.length > 16 ? s.slice(0, 15) + "…" : s)} />
        <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--color-border-subtle)" }} />
        <Bar dataKey="count" name="Órdenes" radius={[0, 6, 6, 0]} onClick={(e: { key?: string }) => onSelect && e.key && onSelect(e.key)} cursor={onSelect ? "pointer" : "default"}>
          {slices.map((s, i) => (
            <Cell key={s.key} fill={s.color ?? PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Pareto: barras desc + línea de % acumulado (80/20). */
function ParetoChart({ slices, onSelect }: { slices: DashboardDimensionSlice[]; onSelect?: (key: string) => void }) {
  const ordered = useMemo(() => paretoOrder(slices), [slices]);
  if (ordered.length === 0) return <p className={styles.empty}>Sin datos.</p>;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={ordered} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="label" stroke={AXIS} fontSize={10} interval={0} angle={-18} textAnchor="end" height={56} tickFormatter={(s: string) => (s.length > 12 ? s.slice(0, 11) + "…" : s)} />
        <YAxis yAxisId="l" stroke={AXIS} fontSize={11} width={32} allowDecimals={false} />
        <YAxis yAxisId="r" orientation="right" stroke={AXIS} fontSize={11} width={36} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
        <Tooltip contentStyle={TOOLTIP_STYLE} />
        <Bar yAxisId="l" dataKey="count" name="Órdenes" radius={[6, 6, 0, 0]} onClick={(e: { key?: string }) => onSelect && e.key && onSelect(e.key)} cursor={onSelect ? "pointer" : "default"}>
          {ordered.map((s, i) => (
            <Cell key={s.key} fill={s.color ?? PALETTE[i % PALETTE.length]} />
          ))}
        </Bar>
        <Line yAxisId="r" type="monotone" dataKey="cumulativePct" name="% acumulado" stroke="var(--color-accent-secondary)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

/** Exporta las tablas agregadas a CSV (datos crudos para hoja de cálculo). */
function exportCsv(data: NonNullable<ReturnType<typeof useWorkOrderDashboard>["data"]>): void {
  const lines: string[] = [];
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  lines.push(`Dashboard de órdenes de trabajo,${data.range.from},${data.range.to}`);
  lines.push("");
  lines.push("Indicador,Valor");
  const k = data.kpis;
  const kpiRows: Array<[string, number | string]> = [
    ["Borradores (ahora)", k.draft],
    ["Abiertas (ahora)", k.open],
    ["Críticas (ahora)", k.critical],
    ["Sin responsable (ahora)", k.unassigned],
    ["Con PTW (ahora)", k.ptw],
    ["Plazo vencido", k.overdue],
    ["Por vencer", k.atRisk],
    ["Estancadas", k.stalled],
    ["Creadas (periodo)", k.created],
    ["Cerradas (periodo)", k.closed],
    ["MTTR (horas)", k.mttrHours ?? ""],
    ["Cumplimiento SLA (%)", k.slaCompliancePct ?? ""],
  ];
  for (const [n, v] of kpiRows) lines.push(`${esc(n)},${esc(v)}`);

  const section = (title: string, slices: DashboardDimensionSlice[]) => {
    lines.push("");
    lines.push(`${esc(title)},Órdenes`);
    for (const s of slices) lines.push(`${esc(s.label)},${s.count}`);
  };
  section("Por tipo", data.byType);
  section("Por criticidad", data.byCriticality);
  section("Por nodo", data.byNode);
  section("Por especialidad", data.bySpecialty);
  section("Por estado", data.byState);
  section("Por prioridad", data.byPriority);
  section("Por origen", data.byOrigin);

  lines.push("");
  lines.push("Tendencia,Creadas,Cerradas");
  for (const p of data.trend) lines.push(`${p.bucket},${p.created},${p.closed}`);

  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ordenes-trabajo-dashboard-${data.range.from.slice(0, 10)}_${data.range.to.slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
