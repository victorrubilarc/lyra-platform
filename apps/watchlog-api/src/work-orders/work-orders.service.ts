import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  workOrderCode,
  type AreaDto,
  type AssignWorkOrderRequest,
  type CancelWorkOrderRequest,
  type CreateWorkOrderRequest,
  type SpecialtyDto,
  type UpdateWorkOrderRequest,
  type UpsertAreaRequest,
  type UpsertSpecialtyRequest,
  type UpsertWorkOrderTypeRequest,
  type WorkOrderDetail,
  type WorkOrderListItem,
  type WorkOrderListQuery,
  type WorkOrderListResponse,
  type WorkOrderStats,
  type WorkOrderTypeDto,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";

/**
 * Órdenes de Trabajo / Work Orders (OT / PTW) — Sesión 1: CIMIENTOS.
 * ESPEJO de `IncidentsService`, acotado a la SOLICITUD: crear/listar/ver/editar/
 * asignar/anular con ABAC por nodo ∩ estructura (single-tenant). El WORKFLOW (4
 * puertas), el FOLIO gapless (al aprobar), los CHECKLISTS y las ACTIVIDADES llegan
 * en S2–S5. No hay borrado físico (anulación = lifecycle CANCELED con motivo).
 */
@Injectable()
export class WorkOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  // === Listado / KPIs ========================================================

  async list(userId: string, q: WorkOrderListQuery, structureId?: string): Promise<WorkOrderListResponse> {
    const where = await this.buildWhere(userId, q, structureId);
    if (where === null) return { items: [], total: 0, page: q.page ?? 1, pageSize: q.pageSize ?? 25 };

    const page = q.page ?? 1;
    const pageSize = q.pageSize ?? 25;
    const [rows, total] = await Promise.all([
      this.prisma.workOrder.findMany({
        where,
        include: this.listInclude,
        orderBy: this.orderByFor(q.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.workOrder.count({ where }),
    ]);
    const items = await this.toListItems(rows);
    return { items, total, page, pageSize };
  }

  async stats(userId: string, structureId?: string): Promise<WorkOrderStats> {
    const base = await this.buildWhere(userId, {}, structureId);
    if (base === null) return { draft: 0, open: 0, critical: 0, unassigned: 0, ptw: 0 };
    const openBase: Prisma.WorkOrderWhereInput = { ...base, lifecycle: "OPEN" };
    const [draft, open, critical, unassigned, ptw] = await Promise.all([
      this.prisma.workOrder.count({ where: { ...base, lifecycle: "DRAFT" } }),
      this.prisma.workOrder.count({ where: openBase }),
      this.prisma.workOrder.count({ where: { ...openBase, criticality: 5 } }),
      this.prisma.workOrder.count({ where: { ...openBase, ownerId: null } }),
      this.prisma.workOrder.count({ where: { ...base, requiresPtw: true, lifecycle: { in: ["DRAFT", "OPEN"] } } }),
    ]);
    return { draft, open, critical, unassigned, ptw };
  }

  // === Detalle ================================================================

  async getDetail(userId: string, id: string): Promise<WorkOrderDetail> {
    const row = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    const item = (await this.toListItems([row]))[0]!;
    const type = await this.prisma.workOrderType.findUnique({ where: { id: row.typeId }, select: { criticalityDefault: true } });
    return {
      ...item,
      description: row.description,
      criticalityDefault: type?.criticalityDefault ?? null,
      riskProbability: row.riskProbability,
      riskConsequence: row.riskConsequence,
      locationDetail: row.locationDetail,
      shiftCode: row.shiftCode,
      detectedAt: row.detectedAt?.toISOString() ?? null,
      plannedStart: row.plannedStart?.toISOString() ?? null,
      plannedEnd: row.plannedEnd?.toISOString() ?? null,
      originIncidentId: row.originIncidentId,
      originLogEntryId: row.originLogEntryId,
      originExceptionId: row.originExceptionId,
      canceledAt: row.canceledAt?.toISOString() ?? null,
      cancelReason: row.cancelReason,
    };
  }

  // === Creación ===============================================================

  async create(userId: string, dto: CreateWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const node = await this.prisma.orgNode.findFirst({ where: { id: dto.orgNodeId, deletedAt: null }, select: { id: true } });
    if (!node) throw new BadRequestException("El nodo indicado no existe");
    await this.assertNodeAccess(userId, dto.orgNodeId);

    const type = await this.prisma.workOrderType.findFirst({ where: { id: dto.typeId, deletedAt: null } });
    if (!type || !type.active) throw new BadRequestException("El tipo de OT no existe o está inactivo");

    if (dto.equipmentId) await this.assertEquipmentInNode(dto.equipmentId, dto.orgNodeId);
    if (dto.ownerId) await this.assertUserExists(dto.ownerId);
    const areaIds = await this.assertTagsActive("area", dto.areaIds);
    const specialtyIds = await this.assertTagsActive("specialty", dto.specialtyIds);

    // Origen: la incidencia manda sobre la excepción; si no, DIRECT (bitácora se liga
    // por ref. blanda pero no cambia el origen — no hay LOG_ENTRY en el enum de OT).
    const originType = dto.originIncidentId ? "INCIDENT" : dto.originExceptionId ? "EXCEPTION" : "DIRECT";

    const row = await this.prisma.workOrder.create({
      data: {
        title: dto.title,
        description: dto.description ?? null,
        typeId: dto.typeId,
        // S1 sin workflow: la solicitud nace ABIERTA (a la cola). DRAFT queda reservado
        // para el estado `borrador` del flujo configurable (S2).
        lifecycle: "OPEN",
        originType,
        criticality: dto.criticality,
        priority: dto.priority ?? "MEDIUM",
        requiresPtw: dto.requiresPtw ?? type.requiresPtwDefault,
        riskProbability: dto.riskProbability ?? null,
        riskConsequence: dto.riskConsequence ?? null,
        orgNodeId: dto.orgNodeId,
        equipmentId: dto.equipmentId ?? null,
        locationDetail: dto.locationDetail ?? null,
        requesterId: userId,
        ownerId: dto.ownerId ?? null,
        detectedAt: dto.detectedAt ? new Date(dto.detectedAt) : null,
        plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
        plannedEnd: dto.plannedEnd ? new Date(dto.plannedEnd) : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        originIncidentId: dto.originIncidentId ?? null,
        originLogEntryId: dto.originLogEntryId ?? null,
        originExceptionId: dto.originExceptionId ?? null,
        createdById: userId,
        updatedById: userId,
        areas: { create: areaIds.map((areaId) => ({ areaId })) },
        specialties: { create: specialtyIds.map((specialtyId) => ({ specialtyId })) },
      },
    });
    await this.audit.record({ ...ctx, action: "workorder.created", entityType: "WorkOrder", entityId: row.id, after: this.snapshot(row) });
    return this.getDetail(userId, row.id);
  }

  // === Edición de atributos ==================================================

  async update(userId: string, id: string, dto: UpdateWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const before = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, before.orgNodeId);
    if (before.lifecycle === "CLOSED" || before.lifecycle === "CANCELED") {
      throw new BadRequestException("La orden de trabajo ya está cerrada o anulada");
    }
    if (dto.typeId) {
      const type = await this.prisma.workOrderType.findFirst({ where: { id: dto.typeId, deletedAt: null } });
      if (!type || !type.active) throw new BadRequestException("El tipo de OT no existe o está inactivo");
    }
    if (dto.equipmentId) await this.assertEquipmentInNode(dto.equipmentId, before.orgNodeId);
    const areaIds = dto.areaIds !== undefined ? await this.assertTagsActive("area", dto.areaIds) : undefined;
    const specialtyIds = dto.specialtyIds !== undefined ? await this.assertTagsActive("specialty", dto.specialtyIds) : undefined;

    await this.prisma.$transaction(async (tx) => {
      await tx.workOrder.update({
        where: { id },
        data: {
          title: dto.title === undefined ? undefined : dto.title,
          description: dto.description === undefined ? undefined : dto.description,
          typeId: dto.typeId === undefined ? undefined : dto.typeId,
          criticality: dto.criticality === undefined ? undefined : dto.criticality,
          priority: dto.priority === undefined ? undefined : dto.priority,
          requiresPtw: dto.requiresPtw === undefined ? undefined : dto.requiresPtw,
          riskProbability: dto.riskProbability === undefined ? undefined : dto.riskProbability,
          riskConsequence: dto.riskConsequence === undefined ? undefined : dto.riskConsequence,
          equipmentId: dto.equipmentId === undefined ? undefined : dto.equipmentId,
          locationDetail: dto.locationDetail === undefined ? undefined : dto.locationDetail,
          detectedAt: dto.detectedAt === undefined ? undefined : dto.detectedAt ? new Date(dto.detectedAt) : null,
          plannedStart: dto.plannedStart === undefined ? undefined : dto.plannedStart ? new Date(dto.plannedStart) : null,
          plannedEnd: dto.plannedEnd === undefined ? undefined : dto.plannedEnd ? new Date(dto.plannedEnd) : null,
          dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
          updatedById: userId,
        },
      });
      // N:N: reemplazo total cuando se envía la lista (patrón set).
      if (areaIds !== undefined) {
        await tx.workOrderArea.deleteMany({ where: { workOrderId: id } });
        if (areaIds.length) await tx.workOrderArea.createMany({ data: areaIds.map((areaId) => ({ workOrderId: id, areaId })) });
      }
      if (specialtyIds !== undefined) {
        await tx.workOrderSpecialty.deleteMany({ where: { workOrderId: id } });
        if (specialtyIds.length) await tx.workOrderSpecialty.createMany({ data: specialtyIds.map((specialtyId) => ({ workOrderId: id, specialtyId })) });
      }
    });
    const after = await this.loadWorkOrder(id);
    await this.audit.record({ ...ctx, action: "workorder.updated", entityType: "WorkOrder", entityId: id, before: this.snapshot(before), after: this.snapshot(after) });
    return this.getDetail(userId, id);
  }

  async assign(userId: string, id: string, dto: AssignWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const before = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, before.orgNodeId);
    if (before.lifecycle === "CLOSED" || before.lifecycle === "CANCELED") {
      throw new BadRequestException("La orden de trabajo ya está cerrada o anulada");
    }
    if (dto.ownerId) await this.assertUserExists(dto.ownerId);
    await this.prisma.workOrder.update({ where: { id }, data: { ownerId: dto.ownerId, updatedById: userId } });
    await this.audit.record({ ...ctx, action: "workorder.assigned", entityType: "WorkOrder", entityId: id, after: { ownerId: dto.ownerId } });
    return this.getDetail(userId, id);
  }

  async cancel(userId: string, id: string, dto: CancelWorkOrderRequest, ctx: AuditContext): Promise<WorkOrderDetail> {
    const row = await this.loadWorkOrder(id);
    await this.assertNodeAccess(userId, row.orgNodeId);
    if (row.lifecycle === "CANCELED") throw new BadRequestException("La orden de trabajo ya está anulada");
    const now = new Date();
    await this.prisma.workOrder.update({
      where: { id },
      data: { lifecycle: "CANCELED", canceledAt: now, cancelReason: dto.reason, canceledById: userId, updatedById: userId },
    });
    await this.audit.record({ ...ctx, action: "workorder.canceled", entityType: "WorkOrder", entityId: id, after: { reason: dto.reason } });
    return this.getDetail(userId, id);
  }

  // === Catálogos (tipos / áreas / especialidades) ============================

  async listTypes(includeInactive = false): Promise<WorkOrderTypeDto[]> {
    const rows = await this.prisma.workOrderType.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const wfIds = rows.map((r) => r.defaultWorkflowId).filter((x): x is string => !!x);
    const wfNames = wfIds.length
      ? new Map((await this.prisma.workflowDefinition.findMany({ where: { id: { in: wfIds } }, select: { id: true, name: true } })).map((w) => [w.id, w.name]))
      : new Map<string, string>();
    return rows.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      color: r.color,
      defaultWorkflowId: r.defaultWorkflowId,
      defaultWorkflowName: r.defaultWorkflowId ? wfNames.get(r.defaultWorkflowId) ?? null : null,
      requiresPtwDefault: r.requiresPtwDefault,
      criticalityDefault: r.criticalityDefault,
      active: r.active,
      sortOrder: r.sortOrder,
    }));
  }

  async upsertType(dto: UpsertWorkOrderTypeRequest, ctx: AuditContext, failIfExists = false): Promise<WorkOrderTypeDto> {
    if (failIfExists) {
      const existing = await this.prisma.workOrderType.findUnique({ where: { key: dto.key } });
      if (existing) throw new ConflictException(`Ya existe un tipo de OT con la clave "${dto.key}".`);
    }
    if (dto.defaultWorkflowId) {
      const wf = await this.prisma.workflowDefinition.findFirst({ where: { id: dto.defaultWorkflowId, deletedAt: null } });
      if (!wf) throw new BadRequestException("El flujo por defecto indicado no existe");
      if (wf.status !== "PUBLISHED" || !wf.currentVersionId) throw new BadRequestException("El flujo por defecto debe estar publicado");
    }
    const data = {
      name: dto.name,
      description: dto.description ?? null,
      color: dto.color ?? null,
      defaultWorkflowId: dto.defaultWorkflowId ?? null,
      requiresPtwDefault: dto.requiresPtwDefault ?? false,
      criticalityDefault: dto.criticalityDefault ?? null,
      active: dto.active ?? true,
      sortOrder: dto.sortOrder ?? 0,
    };
    const row = await this.prisma.workOrderType.upsert({ where: { key: dto.key }, create: { key: dto.key, ...data }, update: data });
    await this.audit.record({ ...ctx, action: "workordertype.upserted", entityType: "WorkOrderType", entityId: row.id, after: { key: row.key, name: row.name } });
    return (await this.listTypes(true)).find((t) => t.id === row.id)!;
  }

  async listAreas(includeInactive = false): Promise<AreaDto[]> {
    const rows = await this.prisma.area.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, color: r.color, active: r.active, sortOrder: r.sortOrder }));
  }

  async listSpecialties(includeInactive = false): Promise<SpecialtyDto[]> {
    const rows = await this.prisma.specialty.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, color: r.color, active: r.active, sortOrder: r.sortOrder }));
  }

  async upsertArea(dto: UpsertAreaRequest, ctx: AuditContext, failIfExists = false): Promise<AreaDto> {
    if (failIfExists) {
      const existing = await this.prisma.area.findUnique({ where: { key: dto.key } });
      if (existing) throw new ConflictException(`Ya existe un área con la clave "${dto.key}".`);
    }
    const data = { name: dto.name, description: dto.description ?? null, color: dto.color ?? null, active: dto.active ?? true, sortOrder: dto.sortOrder ?? 0 };
    const row = await this.prisma.area.upsert({ where: { key: dto.key }, create: { key: dto.key, ...data }, update: data });
    await this.audit.record({ ...ctx, action: "workorderarea.upserted", entityType: "Area", entityId: row.id, after: { key: row.key, name: row.name } });
    return { id: row.id, key: row.key, name: row.name, description: row.description, color: row.color, active: row.active, sortOrder: row.sortOrder };
  }

  async upsertSpecialty(dto: UpsertSpecialtyRequest, ctx: AuditContext, failIfExists = false): Promise<SpecialtyDto> {
    if (failIfExists) {
      const existing = await this.prisma.specialty.findUnique({ where: { key: dto.key } });
      if (existing) throw new ConflictException(`Ya existe una especialidad con la clave "${dto.key}".`);
    }
    const data = { name: dto.name, description: dto.description ?? null, color: dto.color ?? null, active: dto.active ?? true, sortOrder: dto.sortOrder ?? 0 };
    const row = await this.prisma.specialty.upsert({ where: { key: dto.key }, create: { key: dto.key, ...data }, update: data });
    await this.audit.record({ ...ctx, action: "workorderspecialty.upserted", entityType: "Specialty", entityId: row.id, after: { key: row.key, name: row.name } });
    return { id: row.id, key: row.key, name: row.name, description: row.description, color: row.color, active: row.active, sortOrder: row.sortOrder };
  }

  /** Usuarios ACTIVOS (id+nombre) para el selector de responsable. */
  async assignableUsers(): Promise<Array<{ id: string; name: string }>> {
    const users = await this.prisma.user.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, displayName: true, email: true },
      orderBy: { displayName: "asc" },
    });
    return users.map((u) => ({ id: u.id, name: u.displayName ?? u.email }));
  }

  /** Equipos/activos del nodo (ABAC por nodo). Self-contained (gate `workorder:create/view`). */
  async equipmentOptions(userId: string, nodeId: string): Promise<Array<{ id: string; name: string; tag: string | null }>> {
    await this.assertNodeAccess(userId, nodeId);
    const rows = await this.prisma.equipment.findMany({
      where: { orgNodeId: nodeId, deletedAt: null, active: true },
      select: { id: true, name: true, tag: true },
      orderBy: [{ reportOrder: "asc" }, { name: "asc" }],
    });
    return rows.map((r) => ({ id: r.id, name: r.name, tag: r.tag }));
  }

  // === Helpers ================================================================

  private readonly listInclude = {
    type: { select: { name: true, color: true } },
    orgNode: { select: { name: true } },
    equipment: { select: { tag: true } },
    areas: { include: { area: { select: { id: true, name: true, color: true } } } },
    specialties: { include: { specialty: { select: { id: true, name: true, color: true } } } },
  } satisfies Prisma.WorkOrderInclude;

  private orderByFor(sort: WorkOrderListQuery["sort"]): Prisma.WorkOrderOrderByWithRelationInput[] {
    switch (sort) {
      case "criticality":
        return [{ criticality: "desc" }, { createdAt: "desc" }];
      case "priority":
        return [{ priority: "desc" }, { createdAt: "desc" }];
      case "due":
        return [{ dueAt: "asc" }, { createdAt: "desc" }];
      default:
        return [{ createdAt: "desc" }, { id: "desc" }];
    }
  }

  /**
   * WHERE con ABAC por nodo ∩ estructura + filtros. `null` = el usuario no alcanza
   * ningún nodo. Si se pasa `structureId` (estructura activa), se intersecta en AND
   * vía `orgNode.structureId` (aislamiento L1b): un usuario acotado a otra estructura
   * obtiene intersección vacía ⇒ lista vacía.
   */
  private async buildWhere(userId: string, q: WorkOrderListQuery, structureId?: string): Promise<Prisma.WorkOrderWhereInput | null> {
    const nodeIds = await this.scope.getAccessibleNodeIds(userId);
    if (nodeIds && nodeIds.size === 0) return null;
    let nodeFilter: string[] | undefined = nodeIds ? [...nodeIds] : undefined;
    if (q.orgNodeIds && q.orgNodeIds.length > 0) {
      nodeFilter = nodeFilter ? nodeFilter.filter((n) => q.orgNodeIds!.includes(n)) : q.orgNodeIds;
      if (nodeFilter.length === 0) return null;
    }
    const where: Prisma.WorkOrderWhereInput = {
      deletedAt: null,
      ...(nodeFilter ? { orgNodeId: { in: nodeFilter } } : {}),
      ...(structureId ? { orgNode: { structureId } } : {}),
      ...(q.lifecycle ? { lifecycle: q.lifecycle } : {}),
      ...(q.typeId ? { typeId: q.typeId } : {}),
      ...(q.criticality ? { criticality: q.criticality } : {}),
      ...(q.priority ? { priority: q.priority } : {}),
      ...(q.originType ? { originType: q.originType } : {}),
      ...(q.equipmentId ? { equipmentId: q.equipmentId } : {}),
      ...(q.ownerId ? { ownerId: q.ownerId } : {}),
      ...(q.areaId ? { areas: { some: { areaId: q.areaId } } } : {}),
      ...(q.specialtyId ? { specialties: { some: { specialtyId: q.specialtyId } } } : {}),
      ...(q.requiresPtw ? { requiresPtw: true } : {}),
      ...(q.unassignedOnly ? { ownerId: null } : {}),
      ...(q.mine ? { OR: [{ ownerId: userId }, { requesterId: userId }] } : {}),
      ...(q.createdFrom || q.createdTo
        ? { createdAt: { ...(q.createdFrom ? { gte: q.createdFrom } : {}), ...(q.createdTo ? { lte: q.createdTo } : {}) } }
        : {}),
    };
    if (q.search && q.search.trim()) {
      const term = q.search.trim();
      const numMatch = term.match(/(\d+)/);
      where.AND = [
        {
          OR: [
            { title: { contains: term, mode: "insensitive" } },
            { description: { contains: term, mode: "insensitive" } },
            { folio: { contains: term, mode: "insensitive" } },
            ...(numMatch ? [{ number: Number(numMatch[1]) }] : []),
          ],
        },
      ];
    }
    return where;
  }

  private async toListItems(rows: WorkOrderRow[]): Promise<WorkOrderListItem[]> {
    if (rows.length === 0) return [];
    const userNames = await this.resolveUserNames(rows.flatMap((r) => [r.ownerId, r.requesterId]));
    return rows.map((r) => ({
      id: r.id,
      code: workOrderCode(r.folio, r.number),
      folio: r.folio,
      title: r.title,
      typeId: r.typeId,
      typeName: r.type?.name ?? null,
      typeColor: r.type?.color ?? null,
      criticality: r.criticality,
      priority: r.priority,
      requiresPtw: r.requiresPtw,
      originType: r.originType,
      lifecycle: r.lifecycle,
      currentStateKey: r.currentStateKey,
      orgNodeId: r.orgNodeId,
      orgNodeName: r.orgNode?.name ?? null,
      equipmentId: r.equipmentId,
      equipmentTag: r.equipment?.tag ?? null,
      ownerId: r.ownerId,
      ownerName: r.ownerId ? userNames.get(r.ownerId) ?? null : null,
      requesterId: r.requesterId,
      requesterName: r.requesterId ? userNames.get(r.requesterId) ?? null : null,
      areas: r.areas.map((a) => ({ id: a.area.id, name: a.area.name, color: a.area.color })),
      specialties: r.specialties.map((s) => ({ id: s.specialty.id, name: s.specialty.name, color: s.specialty.color })),
      dueAt: r.dueAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  private async loadWorkOrder(id: string): Promise<WorkOrderRow> {
    const row = await this.prisma.workOrder.findFirst({ where: { id, deletedAt: null }, include: this.listInclude });
    if (!row) throw new NotFoundException("Orden de trabajo no encontrada");
    return row;
  }

  private async resolveUserNames(ids: (string | null)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
  }

  private async assertEquipmentInNode(equipmentId: string, orgNodeId: string): Promise<void> {
    const eq = await this.prisma.equipment.findFirst({ where: { id: equipmentId, deletedAt: null }, select: { orgNodeId: true, active: true } });
    if (!eq || !eq.active) throw new BadRequestException("El equipo indicado no existe o está inactivo");
    if (eq.orgNodeId !== orgNodeId) throw new BadRequestException("El equipo no pertenece al nodo de la orden de trabajo");
  }

  private async assertUserExists(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException("El usuario indicado no existe");
  }

  /** Valida que los ids de Área/Especialidad existan y estén activos; devuelve la lista deduplicada. */
  private async assertTagsActive(kind: "area" | "specialty", ids: string[] | undefined): Promise<string[]> {
    if (!ids || ids.length === 0) return [];
    const unique = [...new Set(ids)];
    const found =
      kind === "area"
        ? await this.prisma.area.findMany({ where: { id: { in: unique }, deletedAt: null, active: true }, select: { id: true } })
        : await this.prisma.specialty.findMany({ where: { id: { in: unique }, deletedAt: null, active: true }, select: { id: true } });
    if (found.length !== unique.length) {
      throw new BadRequestException(kind === "area" ? "Alguna área no existe o está inactiva" : "Alguna especialidad no existe o está inactiva");
    }
    return unique;
  }

  private snapshot(row: { title: string; typeId: string; criticality: number; priority: string; lifecycle: string; ownerId: string | null }): Prisma.InputJsonValue {
    return { title: row.title, typeId: row.typeId, criticality: row.criticality, priority: row.priority, lifecycle: row.lifecycle, ownerId: row.ownerId };
  }
}

/** Fila de OT con los includes del listado. */
type WorkOrderRow = Prisma.WorkOrderGetPayload<{
  include: {
    type: { select: { name: true; color: true } };
    orgNode: { select: { name: true } };
    equipment: { select: { tag: true } };
    areas: { include: { area: { select: { id: true; name: true; color: true } } } };
    specialties: { include: { specialty: { select: { id: true; name: true; color: true } } } };
  };
}>;
