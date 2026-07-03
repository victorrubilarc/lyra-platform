import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  AT_RISK_WINDOW_MINUTES,
  criticalityDimensionLabel,
  defaultBucketForRange,
  defaultDashboardRange,
  type DashboardBucket,
  type DashboardDimensionSlice,
  type DashboardTrendPoint,
  type WorkOrderDashboard,
  type WorkOrderDashboardKpis,
  type WorkOrderDashboardQuery,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ScopeService } from "../authz/scope.service";

/**
 * Zona horaria de PLANTA para el bucketing temporal del dashboard. Single-tenant on-prem
 * ⇒ una sola TZ es lo correcto (no se infiere del navegador). Configurable por entorno;
 * default Chile. Misma constante y decisión que el dashboard de incidencias (4.5).
 */
const PLANT_TIME_ZONE = process.env.PLANT_TIME_ZONE ?? "America/Santiago";

const TOP_DIMENSION_LIMIT = 12;

function emptyKpis(): WorkOrderDashboardKpis {
  return {
    draft: 0,
    open: 0,
    critical: 0,
    unassigned: 0,
    ptw: 0,
    overdue: 0,
    atRisk: 0,
    stalled: 0,
    created: 0,
    closed: 0,
    mttrHours: null,
    slaCompliancePct: null,
  };
}

function emptyDashboard(range: WorkOrderDashboard["range"]): WorkOrderDashboard {
  return {
    range,
    kpis: emptyKpis(),
    trend: [],
    byType: [],
    byCriticality: [],
    byNode: [],
    bySpecialty: [],
    byPriority: [],
    byOrigin: [],
    byState: [],
  };
}

/**
 * Dashboard de ÓRDENES DE TRABAJO (OT · Slice 7a). Analítica READ-ONLY, agregada SIEMPRE
 * en el backend (GROUP BY / agregados SQL; nunca se traen filas al cliente) y con el
 * MISMO ABAC por nodo ∩ estructura activa que la lista (`WorkOrdersService.buildWhere`):
 * un usuario jamás agrega OT fuera de su alcance. ESPEJO de `IncidentDashboardService`
 * (4.5). Las métricas siguen estándares (ISO 55000 / EAM / ISO 14224 / ITIL); nada de
 * estados de workflow hardcodeados (la distribución `byState` los deriva del flujo
 * configurable congelado).
 */
@Injectable()
export class WorkOrderDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  async build(userId: string, q: WorkOrderDashboardQuery, structureId?: string): Promise<WorkOrderDashboard> {
    const now = new Date();
    const fallback = defaultDashboardRange(now);
    const from = q.createdFrom ?? fallback.from;
    const to = q.createdTo ?? now;
    const bucket: DashboardBucket = q.bucket ?? defaultBucketForRange(from, to);
    const range = { from: from.toISOString(), to: to.toISOString(), bucket, timeZone: PLANT_TIME_ZONE };

    // === ABAC: mismo cálculo que `WorkOrdersService.buildWhere` ================
    const nodeIds = await this.scope.getAccessibleNodeIds(userId);
    if (nodeIds && nodeIds.size === 0) return emptyDashboard(range);
    let nodeFilter: string[] | undefined = nodeIds ? [...nodeIds] : undefined;
    if (q.orgNodeIds && q.orgNodeIds.length > 0) {
      nodeFilter = nodeFilter ? nodeFilter.filter((n) => q.orgNodeIds!.includes(n)) : q.orgNodeIds;
      if (nodeFilter.length === 0) return emptyDashboard(range);
    }
    // Aislamiento L1b: intersección con la ESTRUCTURA ACTIVA (resuelta a nodos, una vez).
    if (structureId) {
      const structNodes = await this.prisma.orgNode.findMany({ where: { structureId, deletedAt: null }, select: { id: true } });
      const structIds = structNodes.map((n) => n.id);
      nodeFilter = nodeFilter ? nodeFilter.filter((n) => structIds.includes(n)) : structIds;
      if (nodeFilter.length === 0) return emptyDashboard(range);
    }

    // WHERE de alcance LIVE (ABAC + filtros categóricos; SIN lifecycle ni fecha):
    // base de los KPIs de estado vivo (open/critical/overdue/permanencia/…).
    const liveWhere = this.categoricalWhere(nodeFilter, q, { withLifecycle: false });
    // WHERE acotado al RANGO por createdAt (+ lifecycle si el usuario lo filtró):
    // base de las distribuciones y la tendencia ("qué pasó en el periodo").
    const rangeWhere: Prisma.WorkOrderWhereInput = {
      ...this.categoricalWhere(nodeFilter, q, { withLifecycle: true }),
      createdAt: { gte: from, lte: to },
    };

    const [kpis, trend, byType, byCriticality, byNode, bySpecialty, byPriority, byOrigin, byState] = await Promise.all([
      this.computeKpis(nodeFilter, q, liveWhere, from, to, now),
      this.computeTrend(nodeFilter, q, bucket, from, to),
      this.byType(rangeWhere),
      this.byCriticality(rangeWhere),
      this.byNode(rangeWhere),
      this.bySpecialty(rangeWhere),
      this.byPriority(rangeWhere),
      this.byOrigin(rangeWhere),
      this.byState(rangeWhere),
    ]);

    return { range, kpis, trend, byType, byCriticality, byNode, bySpecialty, byPriority, byOrigin, byState };
  }

  // === WHERE builders ========================================================

  /** Subconsulta reutilizable: OT con ≥1 actividad del plan VENCIDA (fin baseline/planned pasado, no cerrada). */
  private overdueActivityWhere(now: Date): Prisma.WorkOrderWhereInput {
    return {
      activities: {
        some: {
          status: { notIn: ["DONE", "CANCELED"] },
          OR: [{ baselineEnd: { lt: now } }, { AND: [{ baselineEnd: null }, { plannedEnd: { lt: now } }] }],
        },
      },
    };
  }

  /** WHERE Prisma de filtros categóricos + ABAC (opcionalmente con lifecycle). Espejo de la lista. */
  private categoricalWhere(
    nodeFilter: string[] | undefined,
    q: WorkOrderDashboardQuery,
    opts: { withLifecycle: boolean },
  ): Prisma.WorkOrderWhereInput {
    return {
      deletedAt: null,
      ...(nodeFilter ? { orgNodeId: { in: nodeFilter } } : {}),
      ...(opts.withLifecycle && q.lifecycle ? { lifecycle: q.lifecycle } : {}),
      ...(q.typeId ? { typeId: q.typeId } : {}),
      ...(q.criticality ? { criticality: q.criticality } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.originType ? { originType: q.originType } : {}),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.specialtyId ? { specialties: { some: { specialtyId: q.specialtyId } } } : {}),
    };
  }

  /** Fragmento SQL de ABAC + filtros categóricos para las consultas crudas (espejo de `categoricalWhere`). */
  private rawScope(nodeFilter: string[] | undefined, q: WorkOrderDashboardQuery): Prisma.Sql {
    const conds: Prisma.Sql[] = [Prisma.sql`wo."deletedAt" IS NULL`];
    if (nodeFilter) conds.push(Prisma.sql`wo."orgNodeId" IN (${Prisma.join(nodeFilter)})`);
    if (q.typeId) conds.push(Prisma.sql`wo."typeId" = ${q.typeId}`);
    if (q.criticality) conds.push(Prisma.sql`wo."criticality" = ${q.criticality}`);
    if (q.priority) conds.push(Prisma.sql`wo."priority"::text = ${q.priority}`);
    if (q.originType) conds.push(Prisma.sql`wo."originType"::text = ${q.originType}`);
    if (q.equipmentId) conds.push(Prisma.sql`wo."equipmentId" = ${q.equipmentId}`);
    if (q.lifecycle) conds.push(Prisma.sql`wo."lifecycle"::text = ${q.lifecycle}`);
    if (q.specialtyId)
      conds.push(
        Prisma.sql`EXISTS (SELECT 1 FROM "WorkOrderSpecialty" wos WHERE wos."workOrderId" = wo."id" AND wos."specialtyId" = ${q.specialtyId})`,
      );
    return Prisma.join(conds, " AND ");
  }

  // === KPIs ==================================================================

  private async computeKpis(
    nodeFilter: string[] | undefined,
    q: WorkOrderDashboardQuery,
    liveWhere: Prisma.WorkOrderWhereInput,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<WorkOrderDashboardKpis> {
    const openWhere: Prisma.WorkOrderWhereInput = { ...liveWhere, lifecycle: "OPEN" };
    const overdueActivity = this.overdueActivityWhere(now);
    const window = new Date(now.getTime() + AT_RISK_WINDOW_MINUTES * 60_000);
    const stalledIds = await this.stalledIds(nodeFilter, q);

    const [draft, open, critical, unassigned, ptw, overdue, atRisk, stalled, created, closed, mttrRow] = await Promise.all([
      this.prisma.workOrder.count({ where: { ...liveWhere, lifecycle: "DRAFT" } }),
      this.prisma.workOrder.count({ where: openWhere }),
      this.prisma.workOrder.count({ where: { ...openWhere, criticality: 5 } }),
      this.prisma.workOrder.count({ where: { ...openWhere, ownerId: null } }),
      this.prisma.workOrder.count({ where: { ...liveWhere, requiresPtw: true, lifecycle: { in: ["DRAFT", "OPEN"] } } }),
      this.prisma.workOrder.count({ where: { ...openWhere, OR: [{ dueAt: { lt: now } }, overdueActivity] } }),
      this.prisma.workOrder.count({ where: { ...openWhere, dueAt: { gte: now, lte: window }, NOT: overdueActivity } }),
      this.prisma.workOrder.count({ where: { ...openWhere, id: { in: stalledIds } } }),
      this.prisma.workOrder.count({ where: { ...this.categoricalWhere(nodeFilter, q, { withLifecycle: true }), createdAt: { gte: from, lte: to } } }),
      this.prisma.workOrder.count({ where: { ...liveWhere, lifecycle: "CLOSED", closedAt: { gte: from, lte: to } } }),
      this.mttrAndCompliance(nodeFilter, q, from, to),
    ]);

    return {
      draft,
      open,
      critical,
      unassigned,
      ptw,
      overdue,
      atRisk,
      stalled,
      created,
      closed,
      mttrHours: mttrRow.mttrHours,
      slaCompliancePct: mttrRow.slaCompliancePct,
    };
  }

  /**
   * IDs de OT ABIERTAS con la PERMANENCIA de estado excedida (now − currentStateSince >
   * maxStayMinutes del estado de la versión CONGELADA), acotados al alcance ABAC/filtros.
   * Mismo cálculo que el "vigía" (`WorkOrdersService.findStalledIds`), aquí intersectado
   * con el conjunto accesible del dashboard.
   */
  private async stalledIds(nodeFilter: string[] | undefined, q: WorkOrderDashboardQuery): Promise<string[]> {
    const scope = this.rawScope(nodeFilter, q);
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT wo."id"
      FROM "WorkOrder" wo
      JOIN "WorkflowState" ws
        ON ws."workflowDefinitionVersionId" = wo."workflowDefinitionVersionId"
       AND ws."key" = wo."currentStateKey"
      WHERE ${scope}
        AND wo."lifecycle" = 'OPEN'
        AND wo."currentStateKey" IS NOT NULL
        AND ws."maxStayMinutes" IS NOT NULL
        AND wo."currentStateSince" + (ws."maxStayMinutes" * interval '1 minute') < now()
      LIMIT 2000`;
    return rows.map((r) => r.id);
  }

  /** MTTR (horas, creación→cierre) y cumplimiento de SLA (% cerradas dentro de `dueAt`) de las cerradas en el rango. */
  private async mttrAndCompliance(
    nodeFilter: string[] | undefined,
    q: WorkOrderDashboardQuery,
    from: Date,
    to: Date,
  ): Promise<{ mttrHours: number | null; slaCompliancePct: number | null }> {
    const scope = this.rawScope(nodeFilter, q);
    const rows = await this.prisma.$queryRaw<
      Array<{ mttr_hours: number | null; closed_count: number; within_due: number; with_due: number }>
    >`
      SELECT
        AVG(EXTRACT(EPOCH FROM (wo."closedAt" - wo."createdAt")) / 3600.0)::float8 AS mttr_hours,
        COUNT(*)::int AS closed_count,
        COUNT(*) FILTER (WHERE wo."dueAt" IS NOT NULL AND wo."closedAt" <= wo."dueAt")::int AS within_due,
        COUNT(*) FILTER (WHERE wo."dueAt" IS NOT NULL)::int AS with_due
      FROM "WorkOrder" wo
      WHERE ${scope}
        AND wo."lifecycle" = 'CLOSED'
        AND wo."closedAt" IS NOT NULL
        AND wo."closedAt" >= ${from}
        AND wo."closedAt" <= ${to}`;
    const r = rows[0];
    if (!r || r.closed_count === 0) return { mttrHours: null, slaCompliancePct: null };
    return {
      mttrHours: r.mttr_hours === null ? null : Math.round(r.mttr_hours * 10) / 10,
      slaCompliancePct: r.with_due === 0 ? null : Math.round((r.within_due / r.with_due) * 1000) / 10,
    };
  }

  // === Tendencia (creación vs cierre por bucket, en TZ de planta) =============

  private async computeTrend(
    nodeFilter: string[] | undefined,
    q: WorkOrderDashboardQuery,
    bucket: DashboardBucket,
    from: Date,
    to: Date,
  ): Promise<DashboardTrendPoint[]> {
    const scope = this.rawScope(nodeFilter, q);
    const createdRows = await this.bucketCounts(scope, bucket, "createdAt", from, to);
    const closedRows = await this.bucketCounts(scope, bucket, "closedAt", from, to);

    const map = new Map<string, DashboardTrendPoint>();
    for (const r of createdRows) map.set(r.bucket, { bucket: r.bucket, created: r.n, closed: 0 });
    for (const r of closedRows) {
      const cur = map.get(r.bucket) ?? { bucket: r.bucket, created: 0, closed: 0 };
      cur.closed = r.n;
      map.set(r.bucket, cur);
    }
    return [...map.values()].sort((a, b) => a.bucket.localeCompare(b.bucket));
  }

  private async bucketCounts(
    scope: Prisma.Sql,
    bucket: DashboardBucket,
    column: "createdAt" | "closedAt",
    from: Date,
    to: Date,
  ): Promise<Array<{ bucket: string; n: number }>> {
    const col = Prisma.raw(`wo."${column}"`);
    // El cierre solo cuenta a las efectivamente cerradas dentro del rango.
    const lifecycleClause = column === "closedAt" ? Prisma.sql`AND wo."lifecycle" = 'CLOSED'` : Prisma.empty;
    return this.prisma.$queryRaw<Array<{ bucket: string; n: number }>>`
      SELECT to_char(date_trunc(${bucket}, ${col} AT TIME ZONE ${PLANT_TIME_ZONE}), 'YYYY-MM-DD') AS bucket,
             COUNT(*)::int AS n
      FROM "WorkOrder" wo
      WHERE ${scope}
        AND ${col} IS NOT NULL
        AND ${col} >= ${from}
        AND ${col} <= ${to}
        ${lifecycleClause}
      GROUP BY 1
      ORDER BY 1`;
  }

  // === Distribuciones (Prisma groupBy; sin filas crudas al cliente) ==========

  private async byType(where: Prisma.WorkOrderWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.workOrder.groupBy({ by: ["typeId"], where, _count: { _all: true } });
    if (groups.length === 0) return [];
    const types = await this.prisma.workOrderType.findMany({
      where: { id: { in: groups.map((g) => g.typeId) } },
      select: { id: true, name: true, color: true },
    });
    const byId = new Map(types.map((t) => [t.id, t]));
    return groups
      .map((g) => ({ key: g.typeId, label: byId.get(g.typeId)?.name ?? "—", count: g._count._all, color: byId.get(g.typeId)?.color ?? null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_DIMENSION_LIMIT);
  }

  private async byCriticality(where: Prisma.WorkOrderWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.workOrder.groupBy({ by: ["criticality"], where, _count: { _all: true } });
    return groups
      // color = null: el web mapea criticidad→token (`criticalityColor`), como bySeverity en incidencias.
      .map((g) => ({ key: String(g.criticality), label: criticalityDimensionLabel(g.criticality), count: g._count._all, color: null }))
      .sort((a, b) => Number(a.key) - Number(b.key));
  }

  private async byNode(where: Prisma.WorkOrderWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.workOrder.groupBy({ by: ["orgNodeId"], where, _count: { _all: true } });
    if (groups.length === 0) return [];
    const nodes = await this.prisma.orgNode.findMany({ where: { id: { in: groups.map((g) => g.orgNodeId) } }, select: { id: true, name: true } });
    const byId = new Map(nodes.map((n) => [n.id, n.name]));
    return groups
      .map((g) => ({ key: g.orgNodeId, label: byId.get(g.orgNodeId) ?? "—", count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_DIMENSION_LIMIT);
  }

  /** Distribución por ESPECIALIDAD (relación M:N): se agrupa el join, no la OT. */
  private async bySpecialty(where: Prisma.WorkOrderWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.workOrderSpecialty.groupBy({
      by: ["specialtyId"],
      where: { workOrder: where },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const specialties = await this.prisma.specialty.findMany({
      where: { id: { in: groups.map((g) => g.specialtyId) } },
      select: { id: true, name: true, color: true },
    });
    const byId = new Map(specialties.map((s) => [s.id, s]));
    return groups
      .map((g) => ({ key: g.specialtyId, label: byId.get(g.specialtyId)?.name ?? "—", count: g._count._all, color: byId.get(g.specialtyId)?.color ?? null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_DIMENSION_LIMIT);
  }

  private async byPriority(where: Prisma.WorkOrderWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.workOrder.groupBy({ by: ["priority"], where, _count: { _all: true } });
    return groups.map((g) => ({ key: g.priority, label: g.priority, count: g._count._all })).sort((a, b) => b.count - a.count);
  }

  private async byOrigin(where: Prisma.WorkOrderWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.workOrder.groupBy({ by: ["originType"], where, _count: { _all: true } });
    return groups.map((g) => ({ key: g.originType, label: g.originType, count: g._count._all })).sort((a, b) => b.count - a.count);
  }

  /**
   * Distribución por ESTADO del workflow. Los estados son CONFIGURABLES y viven en la
   * versión CONGELADA de cada OT (no hay estado hardcodeado): se agrupa por (versión,
   * clave de estado) y se resuelven nombre/color desde `WorkflowState`, fusionando por
   * NOMBRE (estados homónimos de distintas versiones cuentan juntos). No drill-able (la
   * lista no filtra por estado). OT sin flujo (borrador sin versión) → "Sin estado".
   */
  private async byState(where: Prisma.WorkOrderWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.workOrder.groupBy({
      by: ["workflowDefinitionVersionId", "currentStateKey"],
      where,
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    // Estados con flujo: resolver nombre/color por (versión, clave).
    const pairs = groups.filter((g) => g.workflowDefinitionVersionId && g.currentStateKey);
    const versionIds = [...new Set(pairs.map((g) => g.workflowDefinitionVersionId!).filter(Boolean))];
    const states = versionIds.length
      ? await this.prisma.workflowState.findMany({
          where: { workflowDefinitionVersionId: { in: versionIds } },
          select: { workflowDefinitionVersionId: true, key: true, name: true, color: true, order: true },
        })
      : [];
    const stateByPair = new Map(states.map((s) => [`${s.workflowDefinitionVersionId}:${s.key}`, s]));

    // Fusión por NOMBRE del estado (mantiene el orden mínimo para ordenar el eje).
    const merged = new Map<string, { label: string; count: number; color: string | null; order: number }>();
    for (const g of groups) {
      const st =
        g.workflowDefinitionVersionId && g.currentStateKey
          ? stateByPair.get(`${g.workflowDefinitionVersionId}:${g.currentStateKey}`)
          : undefined;
      const label = st?.name ?? "Sin estado";
      const cur = merged.get(label) ?? { label, count: 0, color: st?.color ?? null, order: st?.order ?? 999 };
      cur.count += g._count._all;
      if (st?.order != null) cur.order = Math.min(cur.order, st.order);
      merged.set(label, cur);
    }
    return [...merged.values()]
      .sort((a, b) => a.order - b.order || b.count - a.count)
      .map((m) => ({ key: m.label, label: m.label, count: m.count, color: m.color }))
      .slice(0, TOP_DIMENSION_LIMIT);
  }
}
