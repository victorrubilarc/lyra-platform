import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  defaultBucketForRange,
  defaultDashboardRange,
  sumCrossKpis,
  type CrossDashboard,
  type CrossStructureCard,
  type CrossStructureKpis,
  type DashboardBucket,
  type DashboardDimensionSlice,
  type DashboardRecurrenceRow,
  type DashboardTrendPoint,
  type IncidentDashboard,
  type IncidentDashboardKpis,
  type IncidentDashboardQuery,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { ScopeService } from "../authz/scope.service";
import { IncidentsService } from "./incidents.service";

/**
 * Zona horaria de PLANTA para el bucketing temporal del dashboard (4.5). Single-tenant
 * on-prem ⇒ una sola TZ es lo correcto (no se infiere del navegador). Configurable por
 * entorno; default Chile. Decisión 2026-06-17 (DECISIONS).
 */
const PLANT_TIME_ZONE = process.env.PLANT_TIME_ZONE ?? "America/Santiago";

const DEFAULT_RECURRENCE_WINDOW_DAYS = 30;
const TOP_DIMENSION_LIMIT = 12;
const TOP_RECURRENCE_LIMIT = 10;

function emptyKpis(): IncidentDashboardKpis {
  return {
    created: 0,
    closed: 0,
    open: 0,
    critical: 0,
    overdue: 0,
    slaBreached: 0,
    mttrHours: null,
    slaCompliancePct: null,
    capaOpen: 0,
    capaOverdue: 0,
    capaEffectivenessPct: null,
    reportPending: 0,
    reportOverdue: 0,
  };
}

/**
 * Dashboard de incidencias (Fase 4.5). Analítica READ-ONLY, agregada SIEMPRE en el
 * backend (GROUP BY / agregados SQL; nunca se traen filas al cliente) y con el MISMO
 * ABAC por nodo que la lista (`buildWhere`): un usuario jamás agrega nodos fuera de su
 * alcance. Render sin eval. Las métricas siguen estándares (ISO 45001/9001/14224, ITIL);
 * IF/IG quedan diferidos por falta de HH trabajadas (no se inventan).
 */
@Injectable()
export class IncidentDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly incidents: IncidentsService,
  ) {}

  async build(userId: string, q: IncidentDashboardQuery, structureId?: string): Promise<IncidentDashboard> {
    const now = new Date();
    const fallback = defaultDashboardRange(now);
    const from = q.createdFrom ?? fallback.from;
    const to = q.createdTo ?? now;
    const bucket: DashboardBucket = q.bucket ?? defaultBucketForRange(from, to);
    const recurrenceWindowDays = q.recurrenceWindowDays ?? DEFAULT_RECURRENCE_WINDOW_DAYS;
    const recurrenceFrom = new Date(Math.max(from.getTime(), to.getTime() - recurrenceWindowDays * 86_400_000));

    const range = {
      from: from.toISOString(),
      to: to.toISOString(),
      bucket,
      timeZone: PLANT_TIME_ZONE,
      recurrenceWindowDays,
    };

    // === ABAC: mismo cálculo que `IncidentsService.buildWhere` ===============
    const nodeIds = await this.scope.getAccessibleNodeIds(userId);
    if (nodeIds && nodeIds.size === 0) {
      return { range, kpis: emptyKpis(), trend: [], byType: [], bySeverity: [], byNode: [], byEquipment: [], byShift: [], byOrigin: [], recurrence: [] };
    }
    let nodeFilter: string[] | undefined = nodeIds ? [...nodeIds] : undefined;
    if (q.orgNodeIds && q.orgNodeIds.length > 0) {
      nodeFilter = nodeFilter ? nodeFilter.filter((n) => q.orgNodeIds!.includes(n)) : q.orgNodeIds;
      if (nodeFilter.length === 0) {
        return { range, kpis: emptyKpis(), trend: [], byType: [], bySeverity: [], byNode: [], byEquipment: [], byShift: [], byOrigin: [], recurrence: [] };
      }
    }
    // === Aislamiento L1b: intersección con la ESTRUCTURA ACTIVA ===============
    // Se resuelve aquí (una vez) a su conjunto de nodos y se intersecta con el ABAC,
    // de modo que TODA la analítica de abajo (Prisma groupBy y SQL crudo) queda acotada
    // sin tocar `categoricalWhere`/`rawScope`. Intersección vacía ⇒ dashboard vacío.
    if (structureId) {
      const structNodes = await this.prisma.orgNode.findMany({ where: { structureId, deletedAt: null }, select: { id: true } });
      const structIds = structNodes.map((n) => n.id);
      nodeFilter = nodeFilter ? nodeFilter.filter((n) => structIds.includes(n)) : structIds;
      if (nodeFilter.length === 0) {
        return { range, kpis: emptyKpis(), trend: [], byType: [], bySeverity: [], byNode: [], byEquipment: [], byShift: [], byOrigin: [], recurrence: [] };
      }
    }

    // WHERE de alcance LIVE (ABAC + filtros categóricos; SIN lifecycle ni fecha):
    // base de los KPIs de estado vivo (open/critical/overdue/permanencia/CAPA/reportes).
    const liveWhere = this.categoricalWhere(nodeFilter, q, { withLifecycle: false });
    // WHERE acotado al RANGO por createdAt (+ lifecycle si el usuario lo filtró):
    // base de las distribuciones y la tendencia ("qué pasó en el periodo").
    const rangeWhere: Prisma.IncidentWhereInput = {
      ...this.categoricalWhere(nodeFilter, q, { withLifecycle: true }),
      createdAt: { gte: from, lte: to },
    };

    const [kpis, trend, byType, bySeverity, byNode, byEquipment, byShift, byOrigin, recurrence] = await Promise.all([
      this.computeKpis(nodeFilter, q, liveWhere, rangeWhere, from, to, now),
      this.computeTrend(nodeFilter, q, bucket, from, to),
      this.byType(rangeWhere),
      this.bySeverity(rangeWhere),
      this.byNode(rangeWhere),
      this.byEquipment(rangeWhere),
      this.byShift(rangeWhere),
      this.byOrigin(rangeWhere),
      this.recurrence(nodeFilter, q, recurrenceFrom, to),
    ]);

    return { range, kpis, trend, byType, bySeverity, byNode, byEquipment, byShift, byOrigin, recurrence };
  }

  // === Vista ejecutiva CROSS-ESTRUCTURA (L3) =================================

  /**
   * Consolida KPIs de incidencias de TODAS las estructuras accesibles del usuario a
   * la vez (no solo la activa). Es la EXCEPCIÓN EXPLÍCITA al aislamiento por estructura
   * activa (L1): cruza la estructura, pero el ABAC por nodo SIGUE siendo la frontera de
   * datos. Se aplica intersecando, por estructura, sus nodos vivos con los nodos
   * accesibles del usuario (`null` = sin restricción ⇒ ve todos): una estructura sin
   * nodos accesibles NO aparece (un gerente acotado solo ve lo suyo). Read-only, agregado.
   */
  async buildCross(userId: string): Promise<CrossDashboard> {
    const empty: CrossStructureKpis = { open: 0, critical: 0, overdue: 0, slaBreached: 0 };
    const nodeIds = await this.scope.getAccessibleNodeIds(userId); // null = sin restricción
    if (nodeIds && nodeIds.size === 0) return { cards: [], totals: empty };

    // Estructuras candidatas: las vivas; si el usuario está acotado, solo las que alcanza.
    const accessibleStructures = await this.scope.getAccessibleStructureIds(userId); // null = todas
    const structures = await this.prisma.orgStructure.findMany({
      where: {
        deletedAt: null,
        ...(accessibleStructures ? { id: { in: [...accessibleStructures] } } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { reportOrder: "asc" }, { name: "asc" }],
    });
    if (structures.length === 0) return { cards: [], totals: empty };

    // Nodos vivos de esas estructuras (una sola consulta), intersectados con el ABAC.
    const nodes = await this.prisma.orgNode.findMany({
      where: { structureId: { in: structures.map((s) => s.id) }, deletedAt: null },
      select: { id: true, structureId: true },
    });
    const accessibleByStructure = new Map<string, string[]>();
    for (const n of nodes) {
      if (nodeIds && !nodeIds.has(n.id)) continue; // frontera ABAC por nodo
      const arr = accessibleByStructure.get(n.structureId) ?? [];
      arr.push(n.id);
      accessibleByStructure.set(n.structureId, arr);
    }

    const cards: CrossStructureCard[] = [];
    for (const s of structures) {
      const accessibleNodes = accessibleByStructure.get(s.id) ?? [];
      if (accessibleNodes.length === 0) continue; // sin nodos accesibles ⇒ no se muestra
      cards.push({
        structureId: s.id,
        key: s.key,
        name: s.name,
        color: s.color,
        icon: s.icon,
        accessibleNodeCount: accessibleNodes.length,
        kpis: await this.crossKpis(accessibleNodes),
      });
    }
    return { cards, totals: sumCrossKpis(cards) };
  }

  /** KPIs vivos de incidencias acotados a un conjunto de nodos (ya filtrado por ABAC). */
  private async crossKpis(nodeFilter: string[]): Promise<CrossStructureKpis> {
    const now = new Date();
    const scopeWhere: Prisma.IncidentWhereInput = { orgNodeId: { in: nodeFilter } };
    const openWhere: Prisma.IncidentWhereInput = { ...scopeWhere, lifecycle: "OPEN" };
    const [open, critical, overdue, slaBreached] = await Promise.all([
      this.prisma.incident.count({ where: openWhere }),
      this.prisma.incident.count({ where: { ...openWhere, severity: 5 } }),
      this.prisma.incident.count({ where: { ...openWhere, dueAt: { lt: now } } }),
      this.incidents.openSlaBreachedCount(scopeWhere),
    ]);
    return { open, critical, overdue, slaBreached };
  }

  // === WHERE builders ========================================================

  /** WHERE Prisma de filtros categóricos + ABAC (opcionalmente con lifecycle). */
  private categoricalWhere(
    nodeFilter: string[] | undefined,
    q: IncidentDashboardQuery,
    opts: { withLifecycle: boolean },
  ): Prisma.IncidentWhereInput {
    return {
      ...(nodeFilter ? { orgNodeId: { in: nodeFilter } } : {}),
      ...(opts.withLifecycle && q.lifecycle ? { lifecycle: q.lifecycle } : {}),
      ...(q.typeId ? { typeId: q.typeId } : {}),
      ...(q.categoryId ? { categoryId: q.categoryId } : {}),
      ...(q.severity ? { severity: q.severity } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.originType ? { originType: q.originType } : {}),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
    };
  }

  /** Fragmento SQL de ABAC + filtros categóricos para las consultas crudas (espejo de `categoricalWhere`). */
  private rawScope(nodeFilter: string[] | undefined, q: IncidentDashboardQuery): Prisma.Sql {
    const conds: Prisma.Sql[] = [];
    if (nodeFilter) conds.push(Prisma.sql`i."orgNodeId" IN (${Prisma.join(nodeFilter)})`);
    if (q.typeId) conds.push(Prisma.sql`i."typeId" = ${q.typeId}`);
    if (q.categoryId) conds.push(Prisma.sql`i."categoryId" = ${q.categoryId}`);
    if (q.severity) conds.push(Prisma.sql`i."severity" = ${q.severity}`);
    if (q.priority) conds.push(Prisma.sql`i."priority"::text = ${q.priority}`);
    if (q.originType) conds.push(Prisma.sql`i."originType"::text = ${q.originType}`);
    if (q.equipmentId) conds.push(Prisma.sql`i."equipmentId" = ${q.equipmentId}`);
    if (q.lifecycle) conds.push(Prisma.sql`i."lifecycle"::text = ${q.lifecycle}`);
    return conds.length ? Prisma.sql`${Prisma.join(conds, " AND ")}` : Prisma.sql`TRUE`;
  }

  // === KPIs ==================================================================

  private async computeKpis(
    nodeFilter: string[] | undefined,
    q: IncidentDashboardQuery,
    liveWhere: Prisma.IncidentWhereInput,
    rangeWhere: Prisma.IncidentWhereInput,
    from: Date,
    to: Date,
    now: Date,
  ): Promise<IncidentDashboardKpis> {
    const openWhere: Prisma.IncidentWhereInput = { ...liveWhere, lifecycle: "OPEN" };
    const incidentScope: Prisma.IncidentWhereInput = liveWhere; // para relaciones CAPA/reportes

    const [created, closed, open, critical, overdue, slaBreached, capaOpen, capaOverdue, capaVerified, reportPending, reportOverdue, mttrRow] =
      await Promise.all([
        this.prisma.incident.count({ where: rangeWhere }),
        this.prisma.incident.count({ where: { ...liveWhere, lifecycle: "CLOSED", closedAt: { gte: from, lte: to } } }),
        this.prisma.incident.count({ where: openWhere }),
        this.prisma.incident.count({ where: { ...openWhere, severity: 5 } }),
        this.prisma.incident.count({ where: { ...openWhere, dueAt: { lt: now } } }),
        this.incidents.openSlaBreachedCount(liveWhere),
        this.prisma.incidentAction.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, incident: incidentScope } }),
        this.prisma.incidentAction.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] }, dueAt: { lt: now }, incident: incidentScope } }),
        this.prisma.incidentAction.groupBy({
          by: ["effectivenessOutcome"],
          where: { status: "VERIFIED", effectivenessOutcome: { not: null }, incident: incidentScope },
          _count: { _all: true },
        }),
        this.prisma.incidentReport.count({ where: { status: "PENDING", incident: incidentScope } }),
        this.prisma.incidentReport.count({ where: { status: "PENDING", dueAt: { lt: now }, incident: incidentScope } }),
        this.mttrAndCompliance(nodeFilter, q, from, to),
      ]);

    const effective = capaVerified.find((r) => r.effectivenessOutcome === "EFFECTIVE")?._count._all ?? 0;
    const notEffective = capaVerified.find((r) => r.effectivenessOutcome === "NOT_EFFECTIVE")?._count._all ?? 0;
    const verifiedTotal = effective + notEffective;

    return {
      created,
      closed,
      open,
      critical,
      overdue,
      slaBreached,
      mttrHours: mttrRow.mttrHours,
      slaCompliancePct: mttrRow.slaCompliancePct,
      capaOpen,
      capaOverdue,
      capaEffectivenessPct: verifiedTotal === 0 ? null : Math.round((effective / verifiedTotal) * 1000) / 10,
      reportPending,
      reportOverdue,
    };
  }

  /** MTTR (horas) y cumplimiento de SLA (% cerradas dentro de `dueAt`) sobre las cerradas en el rango. */
  private async mttrAndCompliance(
    nodeFilter: string[] | undefined,
    q: IncidentDashboardQuery,
    from: Date,
    to: Date,
  ): Promise<{ mttrHours: number | null; slaCompliancePct: number | null }> {
    const scope = this.rawScope(nodeFilter, q);
    const rows = await this.prisma.$queryRaw<
      Array<{ mttr_hours: number | null; closed_count: number; within_due: number; with_due: number }>
    >`
      SELECT
        AVG(EXTRACT(EPOCH FROM (i."closedAt" - i."createdAt")) / 3600.0)::float8 AS mttr_hours,
        COUNT(*)::int AS closed_count,
        COUNT(*) FILTER (WHERE i."dueAt" IS NOT NULL AND i."closedAt" <= i."dueAt")::int AS within_due,
        COUNT(*) FILTER (WHERE i."dueAt" IS NOT NULL)::int AS with_due
      FROM "Incident" i
      WHERE ${scope}
        AND i."lifecycle" = 'CLOSED'
        AND i."closedAt" IS NOT NULL
        AND i."closedAt" >= ${from}
        AND i."closedAt" <= ${to}`;
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
    q: IncidentDashboardQuery,
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
    const col = Prisma.raw(`i."${column}"`);
    // El cierre solo cuenta a las efectivamente cerradas dentro del rango.
    const lifecycleClause = column === "closedAt" ? Prisma.sql`AND i."lifecycle" = 'CLOSED'` : Prisma.empty;
    return this.prisma.$queryRaw<Array<{ bucket: string; n: number }>>`
      SELECT to_char(date_trunc(${bucket}, ${col} AT TIME ZONE ${PLANT_TIME_ZONE}), 'YYYY-MM-DD') AS bucket,
             COUNT(*)::int AS n
      FROM "Incident" i
      WHERE ${scope}
        AND ${col} IS NOT NULL
        AND ${col} >= ${from}
        AND ${col} <= ${to}
        ${lifecycleClause}
      GROUP BY 1
      ORDER BY 1`;
  }

  // === Distribuciones (Prisma groupBy; sin filas crudas al cliente) ==========

  private async byType(where: Prisma.IncidentWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.incident.groupBy({ by: ["typeId"], where, _count: { _all: true } });
    if (groups.length === 0) return [];
    const types = await this.prisma.incidentType.findMany({
      where: { id: { in: groups.map((g) => g.typeId) } },
      select: { id: true, name: true, color: true },
    });
    const byId = new Map(types.map((t) => [t.id, t]));
    return groups
      .map((g) => ({ key: g.typeId, label: byId.get(g.typeId)?.name ?? "—", count: g._count._all, color: byId.get(g.typeId)?.color ?? null }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_DIMENSION_LIMIT);
  }

  private async bySeverity(where: Prisma.IncidentWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.incident.groupBy({ by: ["severity"], where, _count: { _all: true } });
    return groups
      .map((g) => ({ key: String(g.severity), label: `S${g.severity}`, count: g._count._all, color: null }))
      .sort((a, b) => Number(a.key) - Number(b.key));
  }

  private async byNode(where: Prisma.IncidentWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.incident.groupBy({ by: ["orgNodeId"], where, _count: { _all: true } });
    if (groups.length === 0) return [];
    const nodes = await this.prisma.orgNode.findMany({
      where: { id: { in: groups.map((g) => g.orgNodeId) } },
      select: { id: true, name: true },
    });
    const byId = new Map(nodes.map((n) => [n.id, n.name]));
    return groups
      .map((g) => ({ key: g.orgNodeId, label: byId.get(g.orgNodeId) ?? "—", count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_DIMENSION_LIMIT);
  }

  private async byEquipment(where: Prisma.IncidentWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.incident.groupBy({
      by: ["equipmentId"],
      where: { ...where, equipmentId: { not: null } },
      _count: { _all: true },
    });
    if (groups.length === 0) return [];
    const ids = groups.map((g) => g.equipmentId).filter((x): x is string => !!x);
    const equipment = await this.prisma.equipment.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    const byId = new Map(equipment.map((e) => [e.id, e.name]));
    return groups
      .filter((g) => g.equipmentId)
      .map((g) => ({ key: g.equipmentId!, label: byId.get(g.equipmentId!) ?? "—", count: g._count._all }))
      .sort((a, b) => b.count - a.count)
      .slice(0, TOP_DIMENSION_LIMIT);
  }

  private async byShift(where: Prisma.IncidentWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.incident.groupBy({
      by: ["shiftCode"],
      where: { ...where, shiftCode: { not: null } },
      _count: { _all: true },
    });
    return groups
      .filter((g) => g.shiftCode)
      .map((g) => ({ key: g.shiftCode!, label: g.shiftCode!, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  private async byOrigin(where: Prisma.IncidentWhereInput): Promise<DashboardDimensionSlice[]> {
    const groups = await this.prisma.incident.groupBy({ by: ["originType"], where, _count: { _all: true } });
    return groups
      .map((g) => ({ key: g.originType, label: g.originType, count: g._count._all }))
      .sort((a, b) => b.count - a.count);
  }

  // === Reincidencia (mismo tipo+equipo en la ventana) ========================

  private async recurrence(
    nodeFilter: string[] | undefined,
    q: IncidentDashboardQuery,
    fromWindow: Date,
    to: Date,
  ): Promise<DashboardRecurrenceRow[]> {
    const groups = await this.prisma.incident.groupBy({
      by: ["typeId", "equipmentId"],
      where: {
        ...this.categoricalWhere(nodeFilter, q, { withLifecycle: true }),
        equipmentId: { not: null },
        createdAt: { gte: fromWindow, lte: to },
      },
      _count: { _all: true },
    });
    const recurring = groups
      .filter((g) => g.equipmentId && g._count._all >= 2)
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, TOP_RECURRENCE_LIMIT);
    if (recurring.length === 0) return [];

    const typeIds = [...new Set(recurring.map((g) => g.typeId))];
    const equipIds = [...new Set(recurring.map((g) => g.equipmentId).filter((x): x is string => !!x))];
    const [types, equipment] = await Promise.all([
      this.prisma.incidentType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } }),
      this.prisma.equipment.findMany({ where: { id: { in: equipIds } }, select: { id: true, name: true } }),
    ]);
    const typeName = new Map(types.map((t) => [t.id, t.name]));
    const equipName = new Map(equipment.map((e) => [e.id, e.name]));
    return recurring.map((g) => ({
      typeId: g.typeId,
      typeName: typeName.get(g.typeId) ?? "—",
      equipmentId: g.equipmentId,
      equipmentName: g.equipmentId ? equipName.get(g.equipmentId) ?? null : null,
      count: g._count._all,
    }));
  }
}
