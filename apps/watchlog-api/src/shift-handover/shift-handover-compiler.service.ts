import { Injectable } from "@nestjs/common";
import {
  incidentActionCode,
  incidentReportCode,
  type HandoverCockpit,
  type HandoverScope,
} from "@lyra/contracts";
import { ScopeService } from "../authz/scope.service";
import { PrismaService } from "../prisma/prisma.service";

/** Folio humano de incidencia ("INC-0001"). El contrato lo construye inline; lo replicamos. */
function incidentCode(n: number): string {
  return `INC-${String(n).padStart(4, "0")}`;
}

/** Entrada de compilación: alcance ya resuelto (nodo + ventana del turno). */
export interface CompileScope {
  orgNodeId: string;
  nodeName: string;
  nodePath: string;
  shiftCode: string | null;
  shiftLabel: string | null;
  incomingShiftCode: string | null;
  incomingShiftLabel: string | null;
  operationalDay: string;
  windowStart: Date;
  windowEnd: Date;
  timezone: string;
}

/**
 * Compilador del cockpit del cambio de turno (Capa 2). Junta —SIEMPRE con ABAC
 * por nodo— lo ocurrido en el turno saliente del alcance: registros sellados,
 * excepciones (incluye lecturas fuera de umbral), incidencias activas, acciones
 * CAPA / reportes pendientes o vencidos, y rondas cumplidas/vencidas.
 *
 * Regla de oro: la compilación NUNCA muestra lo que el usuario no puede ver. El
 * alcance efectivo es el SUBÁRBOL del nodo de la entrega ∩ los nodos accesibles
 * del usuario (misma semántica que el resto del sistema). Devuelve el contrato
 * `HandoverCockpit`, que es lo que se congela como snapshot al firmar.
 */
@Injectable()
export class ShiftHandoverCompilerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
  ) {}

  /**
   * Nodos efectivos a compilar: subárbol del nodo (por ruta materializada) ∩
   * alcance del usuario. `null` accesible = sin restricción (todo el subárbol).
   */
  async resolveCompileNodeIds(userId: string, orgNodeId: string, nodePath: string): Promise<string[]> {
    const subtree = await this.prisma.orgNode.findMany({
      where: { deletedAt: null, path: { startsWith: nodePath } },
      select: { id: true },
    });
    const subtreeIds = new Set(subtree.map((n) => n.id));
    subtreeIds.add(orgNodeId); // defensivo
    const accessible = await this.scope.getAccessibleNodeIds(userId);
    if (accessible === null) return [...subtreeIds];
    return [...subtreeIds].filter((id) => accessible.has(id));
  }

  async compile(userId: string, scope: CompileScope): Promise<HandoverCockpit> {
    const nodeIds = await this.resolveCompileNodeIds(userId, scope.orgNodeId, scope.nodePath);
    const now = Date.now();
    const window = { gte: scope.windowStart, lt: scope.windowEnd };

    const handoverScope: HandoverScope = {
      orgNodeId: scope.orgNodeId,
      nodeName: scope.nodeName,
      shiftCode: scope.shiftCode,
      shiftLabel: scope.shiftLabel,
      incomingShiftCode: scope.incomingShiftCode,
      incomingShiftLabel: scope.incomingShiftLabel,
      operationalDay: scope.operationalDay,
      windowStart: scope.windowStart.toISOString(),
      windowEnd: scope.windowEnd.toISOString(),
      timezone: scope.timezone,
    };

    if (nodeIds.length === 0) {
      return {
        scope: handoverScope,
        generatedAt: new Date().toISOString(),
        counts: { ENTRIES: 0, EXCEPTIONS: 0, INCIDENTS: 0, FOLLOWUP: 0, ROUNDS: 0 },
        entries: [],
        exceptions: [],
        incidents: [],
        followups: [],
        rounds: [],
      };
    }

    const [entries, exceptions, incidents, rounds] = await Promise.all([
      this.compileEntries(nodeIds, window),
      this.compileExceptions(nodeIds, window),
      this.compileIncidents(nodeIds, now),
      this.compileRounds(nodeIds, window, now),
    ]);
    const followups = await this.compileFollowups(nodeIds, now);

    return {
      scope: handoverScope,
      generatedAt: new Date().toISOString(),
      counts: {
        ENTRIES: entries.length,
        EXCEPTIONS: exceptions.length,
        INCIDENTS: incidents.length,
        FOLLOWUP: followups.length,
        ROUNDS: rounds.length,
      },
      entries,
      exceptions,
      incidents,
      followups,
      rounds,
    };
  }

  /** Registros SELLADOS en la ventana del turno. */
  private async compileEntries(nodeIds: string[], window: { gte: Date; lt: Date }): Promise<HandoverCockpit["entries"]> {
    const rows = await this.prisma.logEntry.findMany({
      where: { orgNodeId: { in: nodeIds }, status: "SUBMITTED", sealedAt: window },
      select: {
        id: true,
        entryNumber: true,
        sealedAt: true,
        createdAt: true,
        createdById: true,
        template: { select: { name: true } },
      },
      orderBy: { sealedAt: "desc" },
      take: 200,
    });
    const names = await this.userNames(rows.map((r) => r.createdById));
    return rows.map((r) => ({
      id: r.id,
      folio: `#${r.entryNumber}`,
      templateName: r.template?.name ?? "—",
      status: "SEALED",
      byName: r.createdById ? (names.get(r.createdById) ?? null) : null,
      at: (r.sealedAt ?? r.createdAt).toISOString(),
      severity: null,
    }));
  }

  /** Excepciones detectadas en la ventana (incluye lecturas fuera de umbral). */
  private async compileExceptions(nodeIds: string[], window: { gte: Date; lt: Date }): Promise<HandoverCockpit["exceptions"]> {
    const rows = await this.prisma.logEntryException.findMany({
      where: { orgNodeId: { in: nodeIds }, detectedAt: window, status: { not: "DISMISSED" } },
      select: {
        id: true,
        triggerKind: true,
        detail: true,
        fieldLabel: true,
        status: true,
        detectedAt: true,
        incidentId: true,
      },
      orderBy: { detectedAt: "desc" },
      take: 200,
    });
    return rows.map((r) => ({
      id: r.id,
      kind: this.exceptionKind(r.triggerKind),
      detail: r.detail ?? r.fieldLabel ?? "Excepción operacional",
      status: r.status,
      fieldLabel: r.fieldLabel,
      at: r.detectedAt.toISOString(),
      incidentId: r.incidentId,
    }));
  }

  private exceptionKind(trigger: string): string {
    switch (trigger) {
      case "THRESHOLD_WARN":
        return "warning";
      case "THRESHOLD_CRIT":
        return "critical";
      case "RULE":
        return "rule";
      default:
        return "manual";
    }
  }

  /** Incidencias ABIERTAS en el alcance (estado a entregar; resalta críticas/vencidas). */
  private async compileIncidents(nodeIds: string[], now: number): Promise<HandoverCockpit["incidents"]> {
    const rows = await this.prisma.incident.findMany({
      where: { orgNodeId: { in: nodeIds }, lifecycle: "OPEN" },
      select: {
        id: true,
        number: true,
        title: true,
        severity: true,
        dueAt: true,
        currentStateKey: true,
        workflowDefinitionVersionId: true,
        type: { select: { name: true } },
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
    const stateNames = await this.stateNames(rows);
    return rows.map((r) => ({
      id: r.id,
      folio: incidentCode(r.number),
      title: r.title,
      typeName: r.type?.name ?? null,
      severity: r.severity,
      stateName:
        r.workflowDefinitionVersionId && r.currentStateKey
          ? (stateNames.get(`${r.workflowDefinitionVersionId}|${r.currentStateKey}`) ?? r.currentStateKey)
          : null,
      dueAt: r.dueAt?.toISOString() ?? null,
      critical: r.severity >= 4,
      overdue: !!r.dueAt && r.dueAt.getTime() < now,
    }));
  }

  /** Acciones CAPA + reportes pendientes o vencidos de las incidencias del alcance. */
  private async compileFollowups(nodeIds: string[], now: number): Promise<HandoverCockpit["followups"]> {
    const incidents = await this.prisma.incident.findMany({
      where: { orgNodeId: { in: nodeIds }, lifecycle: "OPEN" },
      select: { id: true, number: true },
    });
    if (incidents.length === 0) return [];
    const incidentIds = incidents.map((i) => i.id);
    const folioById = new Map(incidents.map((i) => [i.id, incidentCode(i.number)]));

    const [actions, reports] = await Promise.all([
      this.prisma.incidentAction.findMany({
        where: { incidentId: { in: incidentIds }, status: { in: ["OPEN", "IN_PROGRESS"] } },
        select: { id: true, number: true, title: true, dueAt: true, status: true, incidentId: true },
        orderBy: { dueAt: "asc" },
        take: 200,
      }),
      this.prisma.incidentReport.findMany({
        where: { incidentId: { in: incidentIds }, status: "PENDING" },
        select: { id: true, number: true, obligationName: true, authorityName: true, dueAt: true, status: true, incidentId: true },
        orderBy: { dueAt: "asc" },
        take: 200,
      }),
    ]);

    const out: HandoverCockpit["followups"] = [];
    for (const a of actions) {
      out.push({
        id: a.id,
        kind: "ACTION",
        code: incidentActionCode(a.number),
        title: a.title,
        incidentFolio: folioById.get(a.incidentId) ?? "",
        incidentId: a.incidentId,
        dueAt: a.dueAt?.toISOString() ?? null,
        status: a.status,
        overdue: !!a.dueAt && a.dueAt.getTime() < now,
      });
    }
    for (const r of reports) {
      out.push({
        id: r.id,
        kind: "REPORT",
        code: incidentReportCode(r.number),
        title: r.authorityName ? `${r.obligationName} · ${r.authorityName}` : r.obligationName,
        incidentFolio: folioById.get(r.incidentId) ?? "",
        incidentId: r.incidentId,
        dueAt: r.dueAt?.toISOString() ?? null,
        status: r.status,
        overdue: !!r.dueAt && r.dueAt.getTime() < now,
      });
    }
    return out;
  }

  /** Rondas del turno (cumplidas/vencidas/pendientes). */
  private async compileRounds(nodeIds: string[], window: { gte: Date; lt: Date }, now: number): Promise<HandoverCockpit["rounds"]> {
    const rows = await this.prisma.roundOccurrence.findMany({
      where: { orgNodeId: { in: nodeIds }, scheduledFor: window, status: { not: "CANCELED" } },
      select: {
        id: true,
        templateId: true,
        scheduledFor: true,
        dueAt: true,
        status: true,
        schedule: { select: { name: true } },
      },
      orderBy: { scheduledFor: "asc" },
      take: 200,
    });
    // RoundOccurrence no tiene relación `template` (solo templateId): resolvemos en lote.
    const templateNames = await this.templateNames(rows.map((r) => r.templateId));
    return rows.map((r) => ({
      id: r.id,
      name: r.schedule?.name ?? templateNames.get(r.templateId) ?? "Ronda",
      templateName: templateNames.get(r.templateId) ?? "—",
      status: r.status === "PENDING" && r.dueAt.getTime() < now ? "OVERDUE" : r.status,
      scheduledFor: r.scheduledFor.toISOString(),
      dueAt: r.dueAt.toISOString(),
    }));
  }

  // === helpers ===============================================================

  private async userNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }

  private async templateNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.template.findMany({ where: { id: { in: unique } }, select: { id: true, name: true } });
    return new Map(rows.map((t) => [t.id, t.name]));
  }

  private async stateNames(rows: { workflowDefinitionVersionId: string | null; currentStateKey: string | null }[]): Promise<Map<string, string>> {
    const versionIds = [...new Set(rows.map((r) => r.workflowDefinitionVersionId).filter((x): x is string => !!x))];
    if (versionIds.length === 0) return new Map();
    const states = await this.prisma.workflowState.findMany({
      where: { workflowDefinitionVersionId: { in: versionIds } },
      select: { workflowDefinitionVersionId: true, key: true, name: true },
    });
    return new Map(states.map((s) => [`${s.workflowDefinitionVersionId}|${s.key}`, s.name]));
  }
}
