import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  EXCEPTION_DEDUPE_WINDOW_HOURS,
  isExceptionResolved,
  thresholdBandFor,
  upgradeFieldConfig,
  validateFieldValue,
  type AcknowledgeExceptionRequest,
  type AssociateExceptionRequest,
  type ConvertExceptionRequest,
  type CorrectExceptionRequest,
  type CreateManualExceptionRequest,
  type DismissExceptionRequest,
  type ExceptionBandsSnapshot,
  type ExceptionDedupeSuggestion,
  type ExceptionListQuery,
  type ExceptionListResponse,
  type ExceptionSummary,
  type LogEntryExceptionDto,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { PermissionService } from "../authz/permission.service";
import { IncidentsService } from "../incidents/incidents.service";

/** Folio humano de una excepción a partir del correlativo. */
function exceptionCode(number: number): string {
  return `EXC-${String(number).padStart(4, "0")}`;
}

/**
 * Triage de EXCEPCIONES operacionales (Fase 4.1). La materialización (síncrona,
 * al guardar/sellar) la hace `ExceptionGeneratorService`; ESTE servicio gestiona
 * el ciclo de vida humano: reconocer · descartar (con permiso superior si es
 * CRÍTICA) · corregir el valor (preservando el original, GxP) · convertir en
 * incidencia · asociar/agrupar a una incidencia existente · registro manual.
 * ABAC por nodo en todo; auditoría inmutable de cada acción.
 */
@Injectable()
export class ExceptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly permissions: PermissionService,
    private readonly incidents: IncidentsService,
  ) {}

  // === Listado / resumen ======================================================

  async list(userId: string, q: ExceptionListQuery): Promise<ExceptionListResponse> {
    const where = await this.buildWhere(userId, q);
    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    if (where === null) {
      return { items: [], total: 0, page, pageSize, summary: this.emptySummary() };
    }
    const orderBy: Prisma.LogEntryExceptionOrderByWithRelationInput[] =
      q.sort === "severity" ? [{ thresholdType: "asc" }, { detectedAt: "desc" }] : [{ detectedAt: "desc" }, { id: "desc" }];
    const [rows, total, summaryRows] = await Promise.all([
      this.prisma.logEntryException.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.logEntryException.count({ where }),
      this.prisma.logEntryException.findMany({ where, select: { status: true, thresholdType: true } }),
    ]);
    const items = await this.toDtos(rows);
    return { items, total, page, pageSize, summary: this.summarize(summaryRows) };
  }

  async getDetail(userId: string, id: string): Promise<LogEntryExceptionDto> {
    const row = await this.load(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    return (await this.toDtos([row]))[0]!;
  }

  /** Resumen para el panel de revisión de UNA entrada de bitácora. */
  async summaryForEntry(userId: string, logEntryId: string): Promise<ExceptionSummary> {
    const entry = await this.prisma.logEntry.findUnique({ where: { id: logEntryId }, select: { orgNodeId: true } });
    if (!entry) throw new NotFoundException("Entrada no encontrada");
    await this.assertNodeAccess(userId, entry.orgNodeId);
    const rows = await this.prisma.logEntryException.findMany({
      where: { logEntryId },
      select: { status: true, thresholdType: true },
    });
    return this.summarize(rows);
  }

  // === Triage =================================================================

  async acknowledge(userId: string, id: string, dto: AcknowledgeExceptionRequest, ctx: AuditContext): Promise<LogEntryExceptionDto> {
    const row = await this.load(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    this.assertTriageable(row.status);
    await this.prisma.logEntryException.update({
      where: { id },
      data: { status: "ACKNOWLEDGED", triagedById: userId, triagedAt: new Date(), updatedById: userId },
    });
    await this.audit.record({
      ...ctx,
      action: "exception.acknowledged",
      entityType: "LogEntryException",
      entityId: id,
      after: { note: dto.note ?? null },
    });
    return this.getDetail(userId, id);
  }

  async dismiss(userId: string, id: string, dto: DismissExceptionRequest, ctx: AuditContext): Promise<LogEntryExceptionDto> {
    const row = await this.load(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    this.assertTriageable(row.status);
    // El descarte de una excepción CRÍTICA exige un permiso superior (gobernanza HSE).
    const perms = await this.permissions.getEffectivePermissions(userId);
    const needed = row.thresholdType === "critical" ? "exception:dismiss-critical" : "exception:dismiss";
    if (!perms.has(needed)) {
      throw new ForbiddenException(
        row.thresholdType === "critical"
          ? "Descartar una excepción crítica requiere un permiso superior"
          : "No tiene permiso para descartar excepciones",
      );
    }
    await this.prisma.logEntryException.update({
      where: { id },
      data: { status: "DISMISSED", dismissReason: dto.reason, triagedById: userId, triagedAt: new Date(), updatedById: userId },
    });
    await this.audit.record({
      ...ctx,
      action: "exception.dismissed",
      entityType: "LogEntryException",
      entityId: id,
      after: { reason: dto.reason, thresholdType: row.thresholdType },
    });
    return this.getDetail(userId, id);
  }

  /**
   * Corrige el valor que originó la excepción, PRESERVANDO el original (GxP/ALCOA+).
   * Escribe el `LogEntryValue` + un `LogEntryFieldChange` con el motivo (trazabilidad),
   * re-estampa la banda de umbral y marca la excepción CORRECTED. El registro
   * criptográfico Part 11 de la corrección = deuda de 4.2 (igual que en incidencias).
   */
  async correct(userId: string, id: string, dto: CorrectExceptionRequest, ctx: AuditContext): Promise<LogEntryExceptionDto> {
    const row = await this.load(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    if (isExceptionResolved(row.status)) {
      throw new BadRequestException("La excepción ya fue resuelta (descartada/convertida/corregida)");
    }
    // Las excepciones de REGLA cruzada (Fase 4.1.2) no atan un campo único: no hay
    // un valor que reescribir. La corrección es field-specific (solo umbral/manual).
    const { sectionKey, fieldKey } = row;
    if (!sectionKey || !fieldKey) {
      throw new BadRequestException("Esta excepción (de regla) no está ligada a un campo: no admite corrección de valor");
    }
    const def = await this.loadFieldDef(row.templateVersionId, sectionKey, fieldKey);
    if (!def) throw new BadRequestException("No se pudo resolver el campo de la excepción para validar la corrección");

    const res = validateFieldValue(def, dto.correctedValue, {});
    if (res.errors.length > 0) {
      throw new BadRequestException({ message: "El valor corregido no es válido", errors: res.errors });
    }

    const now = new Date();
    const band = thresholdBandFor(def, dto.correctedValue);
    await this.prisma.$transaction(async (tx) => {
      // Escribe el nuevo valor en la entrada (re-estampa la banda) y deja huella de
      // cambio por campo con el motivo (patrón GxP del canal normal de edición).
      const existing = await tx.logEntryValue.findUnique({
        where: { logEntryId_fieldKey: { logEntryId: row.logEntryId, fieldKey } },
      });
      await tx.logEntryValue.update({
        where: { logEntryId_fieldKey: { logEntryId: row.logEntryId, fieldKey } },
        data: { value: this.toJson(dto.correctedValue), thresholdBand: band, updatedById: userId },
      });
      await tx.logEntryFieldChange.create({
        data: {
          logEntryId: row.logEntryId,
          fieldKey,
          before: this.toJson((existing?.value ?? null) as unknown),
          after: this.toJson(dto.correctedValue),
          reason: dto.reason,
          changedById: userId,
          changedAt: now,
        },
      });
      await tx.logEntryException.update({
        where: { id },
        data: {
          status: "CORRECTED",
          correctedValue: this.toJson(dto.correctedValue),
          correctionReason: dto.reason,
          correctedById: userId,
          correctedAt: now,
          triagedById: userId,
          triagedAt: now,
          updatedById: userId,
        },
      });
    });
    await this.audit.record({
      ...ctx,
      action: "exception.corrected",
      entityType: "LogEntryException",
      entityId: id,
      before: { value: row.originalValue },
      after: { value: dto.correctedValue as Prisma.InputJsonValue, reason: dto.reason },
    });
    return this.getDetail(userId, id);
  }

  // === Conversión / asociación a incidencia ===================================

  async convert(userId: string, dto: ConvertExceptionRequest, ctx: AuditContext): Promise<{ incidentId: string }> {
    const rows = await this.loadMany(dto.exceptionIds);
    for (const r of rows) await this.assertNodeAccess(userId, r.orgNodeId);
    this.assertSameNode(rows);
    for (const r of rows) {
      if (isExceptionResolved(r.status)) throw new BadRequestException(`La excepción ${exceptionCode(r.number)} ya fue resuelta`);
    }
    const anchor = rows[0]!;
    // La incidencia hereda nodo/equipo/turno del contexto congelado de la excepción.
    const detail = await this.incidents.create(
      userId,
      {
        title: dto.title,
        description: dto.description,
        typeId: dto.typeId,
        categoryId: dto.categoryId ?? null,
        severity: dto.severity,
        priority: dto.priority,
        orgNodeId: anchor.orgNodeId,
        equipmentId: anchor.equipmentId ?? null,
        originLogEntryId: anchor.logEntryId,
        ownerId: dto.ownerId ?? null,
      },
      ctx,
    );
    // La incidencia nace de una EXCEPCIÓN (no de un link manual de entrada): el
    // `incidents.create` la marcó LOG_ENTRY por traer `originLogEntryId`; aquí se
    // afina el origen real (se conserva el enlace a la entrada para la trazabilidad).
    await this.prisma.incident.update({ where: { id: detail.id }, data: { originType: "EXCEPTION" } });
    await this.linkExceptions(rows, detail.id, userId, "EXCEPTION", ctx);
    await this.audit.record({
      ...ctx,
      action: "exception.converted",
      entityType: "Incident",
      entityId: detail.id,
      after: { exceptionIds: dto.exceptionIds, count: rows.length },
    });
    return { incidentId: detail.id };
  }

  async associate(userId: string, dto: AssociateExceptionRequest, ctx: AuditContext): Promise<{ incidentId: string }> {
    const rows = await this.loadMany(dto.exceptionIds);
    for (const r of rows) await this.assertNodeAccess(userId, r.orgNodeId);
    const incident = await this.prisma.incident.findUnique({ where: { id: dto.incidentId }, select: { id: true, orgNodeId: true, lifecycle: true } });
    if (!incident) throw new NotFoundException("Incidencia no encontrada");
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    for (const r of rows) {
      if (isExceptionResolved(r.status)) throw new BadRequestException(`La excepción ${exceptionCode(r.number)} ya fue resuelta`);
    }
    await this.linkExceptions(rows, incident.id, userId, "ASSOCIATED", ctx);
    await this.audit.record({
      ...ctx,
      action: "exception.associated",
      entityType: "Incident",
      entityId: incident.id,
      after: { exceptionIds: dto.exceptionIds, count: rows.length },
    });
    return { incidentId: incident.id };
  }

  /** Sugerencias de deduplicación: incidencias ABIERTAS del mismo (nodo, equipo, ventana 24h). */
  async dedupeSuggestions(userId: string, exceptionId: string): Promise<ExceptionDedupeSuggestion[]> {
    const row = await this.load(exceptionId);
    await this.assertNodeAccess(userId, row.orgNodeId);
    const since = new Date(Date.now() - EXCEPTION_DEDUPE_WINDOW_HOURS * 3600_000);
    const candidates = await this.prisma.incident.findMany({
      where: {
        lifecycle: "OPEN",
        orgNodeId: row.orgNodeId,
        ...(row.equipmentId ? { equipmentId: row.equipmentId } : {}),
        createdAt: { gte: since },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    if (candidates.length === 0) return [];
    const versionIds = [...new Set(candidates.map((c) => c.workflowDefinitionVersionId).filter((x): x is string => !!x))];
    const stateNames = new Map<string, string>();
    if (versionIds.length) {
      const states = await this.prisma.workflowState.findMany({
        where: { workflowDefinitionVersionId: { in: versionIds } },
        select: { workflowDefinitionVersionId: true, key: true, name: true },
      });
      for (const s of states) stateNames.set(`${s.workflowDefinitionVersionId}:${s.key}`, s.name);
    }
    return candidates.map((c) => ({
      incidentId: c.id,
      code: `INC-${String(c.number).padStart(4, "0")}`,
      title: c.title,
      currentStateName:
        c.workflowDefinitionVersionId && c.currentStateKey
          ? stateNames.get(`${c.workflowDefinitionVersionId}:${c.currentStateKey}`) ?? null
          : null,
      severity: c.severity,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  // === Registro manual ========================================================

  async createManual(userId: string, dto: CreateManualExceptionRequest, ctx: AuditContext): Promise<LogEntryExceptionDto> {
    const entry = await this.prisma.logEntry.findUnique({
      where: { id: dto.logEntryId },
      select: { id: true, orgNodeId: true, equipmentId: true, shiftCode: true, templateId: true, templateVersionId: true, createdById: true, sealedAt: true },
    });
    if (!entry) throw new NotFoundException("Entrada no encontrada");
    await this.assertNodeAccess(userId, entry.orgNodeId);
    let sectionLabel: string | null = null;
    let fieldLabel: string | null = null;
    if (entry.templateVersionId) {
      const def = dto.fieldKey ? await this.loadFieldDef(entry.templateVersionId, dto.sectionKey, dto.fieldKey) : null;
      fieldLabel = def?.label ?? null;
      const section = await this.prisma.templateSection.findFirst({
        where: { templateVersionId: entry.templateVersionId, key: dto.sectionKey },
        select: { title: true },
      });
      sectionLabel = section?.title ?? null;
    }
    const row = await this.prisma.logEntryException.create({
      data: {
        logEntryId: entry.id,
        templateId: entry.templateId,
        templateVersionId: entry.templateVersionId,
        sectionKey: dto.sectionKey,
        sectionLabel,
        fieldKey: dto.fieldKey ?? null,
        fieldLabel,
        triggerKind: "MANUAL",
        thresholdType: "warning",
        detail: dto.detail,
        orgNodeId: entry.orgNodeId,
        equipmentId: entry.equipmentId,
        shiftCode: entry.shiftCode,
        operatorId: entry.createdById,
        entrySealedAt: entry.sealedAt,
        createdById: userId,
      },
    });
    await this.audit.record({
      ...ctx,
      action: "exception.created-manual",
      entityType: "LogEntryException",
      entityId: row.id,
      after: { logEntryId: entry.id, detail: dto.detail },
    });
    return this.getDetail(userId, row.id);
  }

  // === Helpers ================================================================

  private async linkExceptions(
    rows: ExcRow[],
    incidentId: string,
    userId: string,
    kind: "EXCEPTION" | "ASSOCIATED",
    ctx: AuditContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        await tx.incidentExceptionLink.upsert({
          where: { exceptionId: r.id },
          create: { incidentId, exceptionId: r.id, linkedById: userId },
          update: { incidentId, linkedById: userId },
        });
        await tx.logEntryException.update({
          where: { id: r.id },
          data: { status: "CONVERTED", incidentId, triagedById: userId, triagedAt: new Date(), updatedById: userId },
        });
        await tx.incidentActivity.create({
          data: {
            incidentId,
            kind: "FIELD_CHANGED",
            summary:
              kind === "EXCEPTION"
                ? `Excepción ${exceptionCode(r.number)} convertida en esta incidencia`
                : `Excepción ${exceptionCode(r.number)} asociada a esta incidencia`,
            actorId: ctx.actorId ?? null,
            metadata: { exceptionId: r.id, exceptionCode: exceptionCode(r.number) },
          },
        });
      }
    });
  }

  private assertTriageable(status: ExcRow["status"]): void {
    if (status !== "OPEN" && status !== "ACKNOWLEDGED") {
      throw new BadRequestException("La excepción ya fue resuelta (descartada/convertida/corregida)");
    }
  }

  private assertSameNode(rows: ExcRow[]): void {
    const node = rows[0]?.orgNodeId;
    if (rows.some((r) => r.orgNodeId !== node)) {
      throw new BadRequestException("Solo se pueden agrupar excepciones del mismo nodo");
    }
  }

  /** WHERE con ABAC por nodo + filtros. `null` = el usuario no alcanza ningún nodo. */
  private async buildWhere(userId: string, q: ExceptionListQuery): Promise<Prisma.LogEntryExceptionWhereInput | null> {
    const nodeIds = await this.scope.getAccessibleNodeIds(userId);
    if (nodeIds && nodeIds.size === 0) return null;
    let nodeFilter: string[] | undefined = nodeIds ? [...nodeIds] : undefined;
    if (q.orgNodeIds && q.orgNodeIds.length > 0) {
      nodeFilter = nodeFilter ? nodeFilter.filter((n) => q.orgNodeIds!.includes(n)) : q.orgNodeIds;
      if (nodeFilter.length === 0) return null;
    }
    const where: Prisma.LogEntryExceptionWhereInput = {
      ...(nodeFilter ? { orgNodeId: { in: nodeFilter } } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.openOnly ? { status: { in: ["OPEN", "ACKNOWLEDGED"] } } : {}),
      ...(q.thresholdType ? { thresholdType: q.thresholdType } : {}),
      ...(q.triggerKind ? { triggerKind: q.triggerKind } : {}),
      ...(q.logEntryId ? { logEntryId: q.logEntryId } : {}),
      ...(q.incidentId ? { incidentId: q.incidentId } : {}),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.unlinkedOnly ? { incidentId: null } : {}),
    };
    if (q.search && q.search.trim()) {
      const term = q.search.trim();
      where.OR = [
        { fieldLabel: { contains: term, mode: "insensitive" } },
        { sectionLabel: { contains: term, mode: "insensitive" } },
        { detail: { contains: term, mode: "insensitive" } },
      ];
    }
    return where;
  }

  private summarize(rows: { status: string; thresholdType: string }[]): ExceptionSummary {
    const open = rows.filter((r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED");
    return {
      total: rows.length,
      open: open.length,
      critical: open.filter((r) => r.thresholdType === "critical").length,
      warning: open.filter((r) => r.thresholdType === "warning").length,
      invalid: open.filter((r) => r.thresholdType === "invalid").length,
    };
  }

  private emptySummary(): ExceptionSummary {
    return { total: 0, open: 0, critical: 0, warning: 0, invalid: 0 };
  }

  private async toDtos(rows: ExcRow[]): Promise<LogEntryExceptionDto[]> {
    if (rows.length === 0) return [];
    const userIds = [...new Set(rows.flatMap((r) => [r.operatorId, r.triagedById, r.correctedById]).filter((x): x is string => !!x))];
    const nodeIds = [...new Set(rows.map((r) => r.orgNodeId))];
    const equipmentIds = [...new Set(rows.map((r) => r.equipmentId).filter((x): x is string => !!x))];
    const entryIds = [...new Set(rows.map((r) => r.logEntryId))];
    const templateIds = [...new Set(rows.map((r) => r.templateId).filter((x): x is string => !!x))];
    const incidentIds = [...new Set(rows.map((r) => r.incidentId).filter((x): x is string => !!x))];
    const [users, nodes, equipment, entries, templates, incidentsRows] = await Promise.all([
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true, email: true } }) : [],
      this.prisma.orgNode.findMany({ where: { id: { in: nodeIds } }, select: { id: true, name: true } }),
      equipmentIds.length ? this.prisma.equipment.findMany({ where: { id: { in: equipmentIds } }, select: { id: true, tag: true } }) : [],
      this.prisma.logEntry.findMany({ where: { id: { in: entryIds } }, select: { id: true, entryNumber: true } }),
      templateIds.length ? this.prisma.template.findMany({ where: { id: { in: templateIds } }, select: { id: true, name: true } }) : [],
      incidentIds.length ? this.prisma.incident.findMany({ where: { id: { in: incidentIds } }, select: { id: true, number: true, title: true } }) : [],
    ]);
    const userName = new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
    const nodeName = new Map(nodes.map((n) => [n.id, n.name]));
    const equipTag = new Map(equipment.map((e) => [e.id, e.tag]));
    const entryNum = new Map(entries.map((e) => [e.id, e.entryNumber]));
    const templateName = new Map(templates.map((t) => [t.id, t.name]));
    const incidentInfo = new Map(incidentsRows.map((i) => [i.id, i]));
    return rows.map((r) => {
      const inc = r.incidentId ? incidentInfo.get(r.incidentId) : undefined;
      return {
        id: r.id,
        code: exceptionCode(r.number),
        logEntryId: r.logEntryId,
        logEntryNumber: entryNum.get(r.logEntryId) ?? null,
        templateId: r.templateId,
        templateName: r.templateId ? templateName.get(r.templateId) ?? null : null,
        templateVersionId: r.templateVersionId,
        sectionKey: r.sectionKey,
        sectionLabel: r.sectionLabel,
        fieldKey: r.fieldKey,
        fieldLabel: r.fieldLabel,
        fieldType: r.fieldType,
        unit: r.unit,
        occurrenceRef: r.occurrenceRef,
        originalValue: (r.originalValue ?? null) as unknown,
        bandsSnapshot: (r.bandsSnapshot as ExceptionBandsSnapshot | null) ?? null,
        triggerKind: r.triggerKind,
        thresholdType: r.thresholdType,
        ruleKey: r.ruleKey,
        ruleVersionId: r.ruleVersionId,
        ruleSeverity: r.ruleSeverity,
        detail: r.detail,
        orgNodeId: r.orgNodeId,
        orgNodeName: nodeName.get(r.orgNodeId) ?? null,
        equipmentId: r.equipmentId,
        equipmentTag: r.equipmentId ? equipTag.get(r.equipmentId) ?? null : null,
        shiftCode: r.shiftCode,
        operatorId: r.operatorId,
        operatorName: r.operatorId ? userName.get(r.operatorId) ?? null : null,
        detectedAt: r.detectedAt.toISOString(),
        entrySealedAt: r.entrySealedAt?.toISOString() ?? null,
        status: r.status,
        triagedById: r.triagedById,
        triagedByName: r.triagedById ? userName.get(r.triagedById) ?? null : null,
        triagedAt: r.triagedAt?.toISOString() ?? null,
        dismissReason: r.dismissReason,
        correctedValue: (r.correctedValue ?? null) as unknown,
        correctionReason: r.correctionReason,
        correctedById: r.correctedById,
        correctedByName: r.correctedById ? userName.get(r.correctedById) ?? null : null,
        correctedAt: r.correctedAt?.toISOString() ?? null,
        incidentId: r.incidentId,
        incidentCode: inc ? `INC-${String(inc.number).padStart(4, "0")}` : null,
        incidentTitle: inc?.title ?? null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    });
  }

  /** Carga la def de campo (key/type/dataType/label/config) de la versión congelada. */
  private async loadFieldDef(
    templateVersionId: string | null,
    sectionKey: string,
    fieldKey: string,
  ): Promise<{ key: string; type: never; dataType: never; label: string; config: Record<string, unknown> } | null> {
    if (!templateVersionId) return null;
    const field = await this.prisma.templateField.findFirst({
      where: { key: fieldKey, section: { templateVersionId, key: sectionKey } },
      select: { key: true, type: true, dataType: true, label: true, config: true },
    });
    if (!field) return null;
    return {
      key: field.key,
      type: field.type as never,
      dataType: field.dataType as never,
      label: field.label,
      config: upgradeFieldConfig(field.type, (field.config ?? {}) as Record<string, unknown>),
    };
  }

  private async load(id: string): Promise<ExcRow> {
    const row = await this.prisma.logEntryException.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Excepción no encontrada");
    return row;
  }

  private async loadMany(ids: string[]): Promise<ExcRow[]> {
    const rows = await this.prisma.logEntryException.findMany({ where: { id: { in: ids } } });
    if (rows.length !== new Set(ids).size) throw new NotFoundException("Una o más excepciones no existen");
    return rows;
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return (value ?? null) as Prisma.InputJsonValue;
  }
}

type ExcRow = Prisma.LogEntryExceptionGetPayload<Record<string, never>>;
