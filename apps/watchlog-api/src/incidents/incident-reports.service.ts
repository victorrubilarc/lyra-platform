import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  applicableObligationsFor,
  incidentReportCode,
  isReportOverdue,
  type CancelIncidentReportRequest,
  type CreateIncidentReportRequest,
  type IncidentReportDto,
  type MarkIncidentReportNotApplicableRequest,
  type ReportingObligationDto,
  type SubmitIncidentReportRequest,
  type UpdateIncidentReportRequest,
  type UpsertReportingObligationRequest,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";

/**
 * Reportabilidad configurable de incidencias (Fase 4.3). Dos responsabilidades:
 *
 *  1. CATÁLOGO `ReportingObligation`: obligaciones de reporte editables por UI
 *     (gate `incidentcatalog:manage`), espejo de los catálogos de Tipos/Categorías.
 *     Los marcos regulatorios concretos son SEED, nunca lógica.
 *  2. MATERIALIZACIÓN `IncidentReport`: los reportes de cada incidencia (N), con
 *     plazo (`dueAt`), estado y evidencia de envío (folio externo). El alcance de
 *     datos lo HEREDA de la incidencia (ABAC por nodo). Cada mutación deja huella en
 *     el timeline (`IncidentActivity`) y en `AuditLog`. Sin borrado físico.
 *
 * El bloqueo de cierre por reporte OBLIGATORIO pendiente vive en
 * `IncidentsService.transition` (`assertNoBlockingReports`), usando el helper puro
 * `reportsBlockingClose`. SIN permiso nuevo: los reportes sobre una incidencia se
 * gobiernan con `incident:edit` (gestión de su contenido).
 */
@Injectable()
export class IncidentReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  // === Catálogo de obligaciones ==============================================

  async listObligations(includeInactive = false): Promise<ReportingObligationDto[]> {
    const rows = await this.prisma.reportingObligation.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return this.toObligationDtos(rows);
  }

  async upsertObligation(dto: UpsertReportingObligationRequest, ctx: AuditContext, failIfExists = false): Promise<ReportingObligationDto> {
    // Guarda de "crear" (fork colisión de key): el endpoint es upsert por key. Cuando
    // la UI declara `create`, una key ya existente es un conflicto (no sobrescribir).
    if (failIfExists) {
      const existing = await this.prisma.reportingObligation.findUnique({ where: { key: dto.key } });
      if (existing) throw new ConflictException(`Ya existe una obligación de reporte con la clave "${dto.key}".`);
    }
    if (dto.appliesToTypeIds && dto.appliesToTypeIds.length > 0) {
      const found = await this.prisma.incidentType.count({ where: { id: { in: dto.appliesToTypeIds }, deletedAt: null } });
      if (found !== new Set(dto.appliesToTypeIds).size) throw new BadRequestException("Uno o más tipos indicados no existen");
    }
    const data = {
      name: dto.name,
      description: dto.description ?? null,
      authorityName: dto.authorityName ?? null,
      defaultDueMinutes: dto.defaultDueMinutes ?? null,
      appliesToTypeIds: dto.appliesToTypeIds ?? [],
      minSeverity: dto.minSeverity ?? null,
      mandatory: dto.mandatory ?? false,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const row = await this.prisma.reportingObligation.upsert({ where: { key: dto.key }, create: { key: dto.key, ...data }, update: data });
    await this.audit.record({ ...ctx, action: "reportingobligation.upserted", entityType: "ReportingObligation", entityId: row.id, after: { key: row.key, name: row.name, mandatory: row.mandatory } });
    return (await this.toObligationDtos([row]))[0]!;
  }

  // === Reportes de una incidencia ============================================

  async list(userId: string, incidentId: string): Promise<IncidentReportDto[]> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    const rows = await this.prisma.incidentReport.findMany({ where: { incidentId }, orderBy: [{ createdAt: "asc" }] });
    return this.toReportDtos(rows);
  }

  /**
   * Materializa los reportes APLICABLES a la incidencia (los que aún no existen). Se
   * invoca al crear una incidencia reportable y desde el endpoint de re-derivación.
   * Idempotente: no duplica un reporte ya materializado (no anulado) de la misma
   * obligación. Devuelve cuántos reportes nuevos se crearon.
   */
  async materializeForIncident(userId: string, incidentId: string, ctx: AuditContext): Promise<number> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    const obligations = await this.prisma.reportingObligation.findMany({ where: { deletedAt: null, active: true } });
    const applicable = applicableObligationsFor({ typeId: incident.typeId, severity: incident.severity }, obligations);
    if (applicable.length === 0) return 0;

    const existing = await this.prisma.incidentReport.findMany({
      where: { incidentId, status: { not: "CANCELED" } },
      select: { obligationId: true },
    });
    const have = new Set(existing.map((r) => r.obligationId));
    const now = Date.now();
    let created = 0;
    for (const o of applicable) {
      if (have.has(o.id)) continue;
      const row = await this.prisma.incidentReport.create({
        data: {
          incidentId,
          obligationId: o.id,
          obligationName: o.name,
          authorityName: o.authorityName,
          mandatory: o.mandatory,
          status: "PENDING",
          dueAt: o.defaultDueMinutes != null ? new Date(now + o.defaultDueMinutes * 60_000) : null,
          createdById: userId,
          updatedById: userId,
        },
      });
      await this.addActivity(incidentId, "REPORT_ADDED", `Reporte ${incidentReportCode(row.number)} requerido: ${o.name}`, ctx, {
        reportId: row.id,
        obligationId: o.id,
        mandatory: o.mandatory,
      });
      created++;
    }
    if (created > 0) {
      await this.audit.record({ ...ctx, action: "incident.reports.materialized", entityType: "Incident", entityId: incidentId, after: { created } });
    }
    return created;
  }

  /** Agregar manualmente un reporte de una obligación a la incidencia. */
  async create(userId: string, incidentId: string, dto: CreateIncidentReportRequest, ctx: AuditContext): Promise<IncidentReportDto> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("No se pueden agregar reportes a una incidencia cerrada o anulada");
    const obligation = await this.prisma.reportingObligation.findFirst({ where: { id: dto.obligationId, deletedAt: null } });
    if (!obligation || !obligation.active) throw new BadRequestException("La obligación de reporte no existe o está inactiva");
    const dup = await this.prisma.incidentReport.findFirst({ where: { incidentId, obligationId: obligation.id, status: { not: "CANCELED" } }, select: { id: true } });
    if (dup) throw new ConflictException("Esta incidencia ya tiene un reporte (no anulado) de esa obligación");

    const now = Date.now();
    const dueAt = dto.dueAt
      ? new Date(dto.dueAt)
      : obligation.defaultDueMinutes != null
        ? new Date(now + obligation.defaultDueMinutes * 60_000)
        : null;
    const row = await this.prisma.incidentReport.create({
      data: {
        incidentId,
        obligationId: obligation.id,
        obligationName: obligation.name,
        authorityName: obligation.authorityName,
        mandatory: obligation.mandatory,
        status: "PENDING",
        dueAt,
        createdById: userId,
        updatedById: userId,
      },
    });
    await this.addActivity(incidentId, "REPORT_ADDED", `Reporte ${incidentReportCode(row.number)} agregado: ${obligation.name}`, ctx, { reportId: row.id, obligationId: obligation.id, mandatory: obligation.mandatory });
    await this.audit.record({ ...ctx, action: "incident.report.created", entityType: "IncidentReport", entityId: row.id, after: this.snapshot(row) });
    return (await this.toReportDtos([row]))[0]!;
  }

  async update(userId: string, reportId: string, dto: UpdateIncidentReportRequest, ctx: AuditContext): Promise<IncidentReportDto> {
    const before = await this.loadReport(reportId);
    const incident = await this.loadIncident(before.incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (before.status !== "PENDING") throw new BadRequestException("Solo se puede editar un reporte pendiente");
    const row = await this.prisma.incidentReport.update({
      where: { id: reportId },
      data: {
        dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
        notes: dto.notes === undefined ? undefined : dto.notes,
        updatedById: userId,
      },
    });
    await this.audit.record({ ...ctx, action: "incident.report.updated", entityType: "IncidentReport", entityId: reportId, before: this.snapshot(before), after: this.snapshot(row) });
    return (await this.toReportDtos([row]))[0]!;
  }

  /** Marcar enviado (PENDING → SUBMITTED): registra folio externo, fecha y notas. */
  async submit(userId: string, reportId: string, dto: SubmitIncidentReportRequest, ctx: AuditContext): Promise<IncidentReportDto> {
    const before = await this.loadReport(reportId);
    const incident = await this.loadIncident(before.incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (before.status !== "PENDING") throw new BadRequestException("Solo se puede enviar un reporte pendiente");
    const row = await this.prisma.incidentReport.update({
      where: { id: reportId },
      data: {
        status: "SUBMITTED",
        submittedAt: dto.submittedAt ? new Date(dto.submittedAt) : new Date(),
        submittedById: userId,
        externalFolio: dto.externalFolio ?? null,
        notes: dto.notes === undefined ? undefined : dto.notes,
        updatedById: userId,
      },
    });
    await this.addActivity(before.incidentId, "REPORT_SUBMITTED", `Reporte ${incidentReportCode(row.number)} enviado${row.externalFolio ? ` (folio ${row.externalFolio})` : ""}: ${row.obligationName}`, ctx, { reportId, externalFolio: row.externalFolio });
    await this.audit.record({ ...ctx, action: "incident.report.submitted", entityType: "IncidentReport", entityId: reportId, after: { status: "SUBMITTED", externalFolio: row.externalFolio } });
    return (await this.toReportDtos([row]))[0]!;
  }

  /** Marcar NO APLICA (PENDING → NOT_APPLICABLE) con motivo auditado. */
  async markNotApplicable(userId: string, reportId: string, dto: MarkIncidentReportNotApplicableRequest, ctx: AuditContext): Promise<IncidentReportDto> {
    const before = await this.loadReport(reportId);
    const incident = await this.loadIncident(before.incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (before.status !== "PENDING") throw new BadRequestException("Solo se puede marcar 'no aplica' un reporte pendiente");
    const row = await this.prisma.incidentReport.update({
      where: { id: reportId },
      data: { status: "NOT_APPLICABLE", notes: dto.reason, updatedById: userId },
    });
    await this.addActivity(before.incidentId, "REPORT_NOT_APPLICABLE", `Reporte ${incidentReportCode(row.number)} marcado como No aplica: ${dto.reason}`, ctx, { reportId });
    await this.audit.record({ ...ctx, action: "incident.report.not-applicable", entityType: "IncidentReport", entityId: reportId, after: { status: "NOT_APPLICABLE", reason: dto.reason } });
    return (await this.toReportDtos([row]))[0]!;
  }

  /** Anular un reporte materializado por error (sin borrado físico). */
  async cancel(userId: string, reportId: string, dto: CancelIncidentReportRequest, ctx: AuditContext): Promise<IncidentReportDto> {
    const before = await this.loadReport(reportId);
    const incident = await this.loadIncident(before.incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (before.status === "CANCELED") throw new BadRequestException("El reporte ya está anulado");
    const row = await this.prisma.incidentReport.update({
      where: { id: reportId },
      data: { status: "CANCELED", canceledAt: new Date(), canceledById: userId, cancelReason: dto.reason, updatedById: userId },
    });
    await this.addActivity(before.incidentId, "REPORT_CANCELED", `Reporte ${incidentReportCode(row.number)} anulado: ${dto.reason}`, ctx, { reportId });
    await this.audit.record({ ...ctx, action: "incident.report.canceled", entityType: "IncidentReport", entityId: reportId, after: { reason: dto.reason } });
    return (await this.toReportDtos([row]))[0]!;
  }

  // === Helpers ================================================================

  private async toObligationDtos(rows: ReportingObligationRow[]): Promise<ReportingObligationDto[]> {
    const typeIds = [...new Set(rows.flatMap((r) => r.appliesToTypeIds))];
    const typeNames = typeIds.length
      ? new Map((await this.prisma.incidentType.findMany({ where: { id: { in: typeIds } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]))
      : new Map<string, string>();
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      authorityName: r.authorityName,
      defaultDueMinutes: r.defaultDueMinutes,
      appliesToTypeIds: r.appliesToTypeIds,
      appliesToTypeNames: r.appliesToTypeIds.map((id) => typeNames.get(id)).filter((n): n is string => !!n),
      minSeverity: r.minSeverity,
      mandatory: r.mandatory,
      active: r.active,
      sortOrder: r.sortOrder,
    }));
  }

  private async toReportDtos(rows: IncidentReportRow[]): Promise<IncidentReportDto[]> {
    if (rows.length === 0) return [];
    const userNames = await this.resolveUserNames(rows.map((r) => r.submittedById));
    const now = Date.now();
    return rows.map((r) => ({
      id: r.id,
      code: incidentReportCode(r.number),
      incidentId: r.incidentId,
      obligationId: r.obligationId,
      obligationName: r.obligationName,
      authorityName: r.authorityName,
      mandatory: r.mandatory,
      status: r.status,
      dueAt: r.dueAt?.toISOString() ?? null,
      overdue: isReportOverdue({ status: r.status, dueAt: r.dueAt }, now),
      submittedAt: r.submittedAt?.toISOString() ?? null,
      submittedById: r.submittedById,
      submittedByName: r.submittedById ? userNames.get(r.submittedById) ?? null : null,
      externalFolio: r.externalFolio,
      notes: r.notes,
      canceledAt: r.canceledAt?.toISOString() ?? null,
      cancelReason: r.cancelReason,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async loadReport(id: string): Promise<IncidentReportRow> {
    const row = await this.prisma.incidentReport.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Reporte no encontrado");
    return row;
  }

  private async loadIncident(id: string): Promise<{ id: string; orgNodeId: string; lifecycle: string; typeId: string; severity: number }> {
    const row = await this.prisma.incident.findUnique({ where: { id }, select: { id: true, orgNodeId: true, lifecycle: true, typeId: true, severity: true } });
    if (!row) throw new NotFoundException("Incidencia no encontrada");
    return row;
  }

  private async addActivity(incidentId: string, kind: string, summary: string, ctx: AuditContext, metadata?: Record<string, unknown>): Promise<void> {
    await this.prisma.incidentActivity.create({
      data: { incidentId, kind, summary, actorId: ctx.actorId ?? null, actorName: null, metadata: (metadata ?? null) as Prisma.InputJsonValue },
    });
  }

  private async resolveUserNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("La incidencia está fuera de su alcance");
    }
  }

  private snapshot(row: IncidentReportRow): Prisma.InputJsonValue {
    return { obligationName: row.obligationName, mandatory: row.mandatory, status: row.status, externalFolio: row.externalFolio };
  }
}

type ReportingObligationRow = Prisma.ReportingObligationGetPayload<Record<string, never>>;
type IncidentReportRow = Prisma.IncidentReportGetPayload<Record<string, never>>;
