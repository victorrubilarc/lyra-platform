import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CreateLogEntryRequest,
  FieldForValidation,
  LogEntryDetail,
  LogEntryListItem,
  LogEntryListQuery,
  LogEntrySectionStateDto,
  LogEntryValueDto,
  SaveLogEntrySectionRequest,
  SubmitLogEntryRequest,
  TemplateVersionDto,
} from "@lyra/contracts";
import {
  isEmptyValue,
  isFieldVisible,
  isSectionEditableInState,
  resolveEffectiveAt,
  upgradeFieldConfig,
  validateFieldValue,
} from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { ShiftResolver } from "../operational-calendar/shift-resolver";
import { PrismaService } from "../prisma/prisma.service";

/** Versión completa (secciones → campos → roles) para renderizar y validar. */
const versionInclude = {
  sections: {
    orderBy: { order: "asc" },
    include: {
      roles: { select: { roleId: true } },
      fields: {
        orderBy: { order: "asc" },
        include: { roles: { select: { roleId: true } } },
      },
    },
  },
} satisfies Prisma.TemplateVersionInclude;

type VersionWithGraph = Prisma.TemplateVersionGetPayload<{ include: typeof versionInclude }>;
type LogEntryRow = Prisma.LogEntryGetPayload<Record<string, never>>;

/** Vista normalizada de un campo de la versión (para validar/autorizar). */
interface FieldDef {
  key: string;
  sectionKey: string;
  type: FieldForValidation["type"];
  dataType: FieldForValidation["dataType"];
  label: string;
  required: boolean;
  config: Record<string, unknown>;
  visibleWhen: { fieldKey: string; equals: string | number | boolean } | null;
  /** Override de roles por campo (vacío = hereda la sección). */
  roleIds: string[];
}

/**
 * Llenado de bitácoras (Fase 2.4) — EJECUCIÓN auditada de una plantilla.
 *
 * La autorización (RBAC dim. 1–2) la deciden los guards del controller; este
 * service decide lo que es DATO: editabilidad por SECCIÓN = (sección editable en
 * el estado actual) × (rol con permiso de sección) × (ABAC sobre el nodo), con
 * override de rol por campo. Valida el 100% de los valores en servidor, audita
 * por campo (antes/después) y estampa las dimensiones operacionales vía
 * `ShiftResolver`. Concurrencia optimista por sección (`version` check-and-bump).
 *
 * Límite del slice: la entrada permanece en su estado inicial; las TRANSICIONES
 * de flujo y las firmas Part 11 llegan en 2.5.
 */
@Injectable()
export class LogEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly shiftResolver: ShiftResolver,
  ) {}

  // --- Crear (abrir) una entrada ---------------------------------------------

  async create(userId: string, dto: CreateLogEntryRequest, ctx: AuditContext): Promise<LogEntryDetail> {
    const template = await this.prisma.template.findFirst({ where: { id: dto.templateId, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    if (template.status !== "PUBLISHED" || !template.currentVersionId) {
      throw new BadRequestException("La plantilla debe estar publicada para registrar entradas");
    }

    const orgNodeId = dto.orgNodeId ?? template.orgNodeId;
    if (!orgNodeId) {
      throw new BadRequestException("Debe indicar un nodo de la estructura para la entrada");
    }
    await this.assertNodeExists(orgNodeId);
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
    if (dto.equipmentId) await this.assertEquipmentExists(dto.equipmentId);

    const version = await this.prisma.templateVersion.findFirst({
      where: { id: template.currentVersionId },
      include: versionInclude,
    });
    if (!version) throw new BadRequestException("La plantilla no tiene una versión publicada válida");

    // Estado inicial del flujo congelado (si la versión tiene flujo).
    const currentStateKey = await this.initialStateKey(version.workflowDefinitionVersionId);

    const recordedAt = new Date();
    // Sin valores aún → effectiveAt = recordedAt; se recalcula al guardar/enviar.
    const dims = await this.shiftResolver.resolve(recordedAt, orgNodeId);

    const created = await this.prisma.logEntry.create({
      data: {
        templateId: template.id,
        templateVersionId: version.id,
        workflowDefinitionId: version.workflowDefinitionId,
        workflowDefinitionVersionId: version.workflowDefinitionVersionId,
        orgNodeId,
        equipmentId: dto.equipmentId ?? null,
        currentStateKey,
        status: "DRAFT",
        recordedAt,
        effectiveAt: recordedAt,
        shiftCode: dims?.shiftCode ?? null,
        operationalDate: dims?.operationalDate ?? null,
        periodKey: dims?.periodKey ?? null,
        createdById: userId,
        updatedById: userId,
        sections: {
          create: version.sections.map((s) => ({ sectionKey: s.key, state: "PENDING" as const })),
        },
      },
    });

    await this.audit.record({
      ...ctx,
      action: "logentry.created",
      entityType: "LogEntry",
      entityId: created.id,
      after: { templateId: template.id, templateVersionId: version.id, orgNodeId },
    });
    return this.getDetail(userId, created.id);
  }

  // --- Detalle ---------------------------------------------------------------

  async getDetail(userId: string, id: string): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    await this.assertNodeInScope(userId, entry.orgNodeId);

    const version = await this.loadVersion(entry.templateVersionId);
    const template = await this.prisma.template.findUnique({ where: { id: entry.templateId } });
    const [sectionRows, valueRows] = await Promise.all([
      this.prisma.logEntrySection.findMany({ where: { logEntryId: id } }),
      this.prisma.logEntryValue.findMany({ where: { logEntryId: id } }),
    ]);

    const roleIds = await this.userRoleIds(userId);
    const fillerNames = await this.namesByUserId(sectionRows.map((s) => s.filledById));
    const editable = entry.status === "DRAFT";

    const sectionStates: LogEntrySectionStateDto[] = version.sections.map((def) => {
      const row = sectionRows.find((r) => r.sectionKey === def.key);
      return {
        sectionKey: def.key,
        state: row?.state ?? "PENDING",
        filledById: row?.filledById ?? null,
        filledByName: row?.filledById ? (fillerNames.get(row.filledById) ?? null) : null,
        filledAt: row?.filledAt?.toISOString() ?? null,
        version: row?.version ?? 0,
        editable:
          editable &&
          this.isSectionEditableForUser(
            def.key,
            def.editableInStateKey,
            def.roles.map((r) => r.roleId),
            entry.currentStateKey,
            roleIds,
          ),
      };
    });

    const values: LogEntryValueDto[] = valueRows.map((v) => ({
      fieldKey: v.fieldKey,
      value: (v.value ?? null) as unknown,
      updatedAt: v.updatedAt.toISOString(),
      updatedById: v.updatedById,
    }));

    return {
      ...this.mapEntry(entry, template?.name ?? "—"),
      orgNodePath: await this.nodePath(entry.orgNodeId),
      version: this.mapVersion(version),
      sectionStates,
      values,
    };
  }

  // --- Guardar una sección ---------------------------------------------------

  async saveSection(
    userId: string,
    id: string,
    sectionKey: string,
    dto: SaveLogEntrySectionRequest,
    ctx: AuditContext,
  ): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT") throw new BadRequestException("La entrada ya fue enviada o anulada");
    await this.assertNodeInScope(userId, entry.orgNodeId);

    const version = await this.loadVersion(entry.templateVersionId);
    const sectionDef = version.sections.find((s) => s.key === sectionKey);
    if (!sectionDef) throw new NotFoundException("Sección no encontrada en la versión");

    const roleIds = await this.userRoleIds(userId);
    if (
      !this.isSectionEditableForUser(
        sectionDef.key,
        sectionDef.editableInStateKey,
        sectionDef.roles.map((r) => r.roleId),
        entry.currentStateKey,
        roleIds,
      )
    ) {
      throw new ForbiddenException("No puede editar esta sección en el estado actual");
    }

    const sectionRow = await this.prisma.logEntrySection.findUnique({
      where: { logEntryId_sectionKey: { logEntryId: id, sectionKey } },
    });
    if (!sectionRow) throw new NotFoundException("Sección no instanciada");
    if (sectionRow.version !== dto.expectedVersion) {
      throw new ConflictException("La sección fue modificada por otra persona. Recargue para ver los cambios.");
    }

    const fieldsByKey = new Map(sectionDef.fields.map((f) => [f.key, this.toFieldDef(f, sectionKey)]));

    // Solo se aceptan campos de ESTA sección.
    for (const input of dto.values) {
      if (!fieldsByKey.has(input.fieldKey)) {
        throw new BadRequestException(`El campo "${input.fieldKey}" no pertenece a la sección`);
      }
    }

    // Override de rol por campo: si un campo declara roles y el usuario no los
    // tiene, no puede modificar SU valor (granularidad por campo, fork 3).
    for (const input of dto.values) {
      const def = fieldsByKey.get(input.fieldKey)!;
      if (def.roleIds.length > 0 && !def.roleIds.some((r) => roleIds.has(r))) {
        throw new ForbiddenException(`No tiene permiso para editar el campo "${def.label}"`);
      }
    }

    // Snapshot de TODOS los valores actuales (para visibilidad y fecha efectiva).
    const existing = await this.prisma.logEntryValue.findMany({ where: { logEntryId: id } });
    const valuesByKey: Record<string, unknown> = {};
    for (const v of existing) valuesByKey[v.fieldKey] = (v.value ?? null) as unknown;
    for (const input of dto.values) valuesByKey[input.fieldKey] = input.value ?? null;

    // Validación 100% en servidor (tipo/rango/umbral/formato/catálogo), saltando
    // campos ocultos por visibleWhen. Los obligatorios solo se exigen al completar.
    const allowed = await this.resolveAllowedCodes([...fieldsByKey.values()]);
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const input of dto.values) {
      const def = fieldsByKey.get(input.fieldKey)!;
      if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
      const res = validateFieldValue(def, input.value, { allowedCodes: allowed.get(def.key) });
      errors.push(...res.errors);
      warnings.push(...res.warnings);
    }

    if (dto.markComplete) {
      for (const def of fieldsByKey.values()) {
        if (!def.required) continue;
        if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
        if (isEmptyValue(valuesByKey[def.key])) errors.push(`${def.label}: obligatorio`);
      }
    }
    if (errors.length > 0) {
      throw new BadRequestException({ message: "La sección tiene errores de validación", errors });
    }

    const now = new Date();
    const newState = dto.markComplete ? "COMPLETED" : "IN_PROGRESS";

    await this.prisma.$transaction(async (tx) => {
      for (const input of dto.values) {
        const def = fieldsByKey.get(input.fieldKey)!;
        const before = existing.find((e) => e.fieldKey === input.fieldKey);
        const beforeVal = (before?.value ?? null) as unknown;
        const afterVal = input.value ?? null;
        if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) continue; // sin cambio real

        await tx.logEntryValue.upsert({
          where: { logEntryId_fieldKey: { logEntryId: id, fieldKey: input.fieldKey } },
          create: {
            logEntryId: id,
            sectionKey,
            fieldKey: input.fieldKey,
            dataType: def.dataType,
            value: this.toJson(afterVal),
            updatedById: userId,
          },
          update: { value: this.toJson(afterVal), updatedById: userId },
        });
        await tx.logEntryFieldChange.create({
          data: {
            logEntryId: id,
            fieldKey: input.fieldKey,
            before: this.toJson(beforeVal),
            after: this.toJson(afterVal),
            changedById: userId,
          },
        });
      }

      await tx.logEntrySection.update({
        where: { id: sectionRow.id },
        data: { version: { increment: 1 }, state: newState, filledById: userId, filledAt: now },
      });

      // Recalcula effectiveAt + dimensiones mientras la entrada es DRAFT.
      const effectiveAt = resolveEffectiveAt(
        version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
        valuesByKey,
        entry.recordedAt,
      );
      const dims = await this.shiftResolver.resolve(effectiveAt, entry.orgNodeId);
      await tx.logEntry.update({
        where: { id },
        data: {
          effectiveAt,
          shiftCode: dims?.shiftCode ?? null,
          operationalDate: dims?.operationalDate ?? null,
          periodKey: dims?.periodKey ?? null,
          updatedById: userId,
        },
      });
    });

    await this.audit.record({
      ...ctx,
      action: "logentry.section.saved",
      entityType: "LogEntry",
      entityId: id,
      metadata: { sectionKey, complete: Boolean(dto.markComplete), warnings: warnings.length },
    });
    return this.getDetail(userId, id);
  }

  // --- Enviar (sella las dimensiones) ----------------------------------------

  async submit(userId: string, id: string, _dto: SubmitLogEntryRequest, ctx: AuditContext): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT") throw new BadRequestException("La entrada ya fue enviada o anulada");
    await this.assertNodeInScope(userId, entry.orgNodeId);

    const version = await this.loadVersion(entry.templateVersionId);
    const roleIds = await this.userRoleIds(userId);
    const valueRows = await this.prisma.logEntryValue.findMany({ where: { logEntryId: id } });
    const valuesByKey: Record<string, unknown> = {};
    for (const v of valueRows) valuesByKey[v.fieldKey] = (v.value ?? null) as unknown;

    // Valida obligatorios + valores de las secciones editables en el estado actual.
    const errors: string[] = [];
    for (const section of version.sections) {
      const editableNow = this.isSectionEditableForUser(
        section.key,
        section.editableInStateKey,
        section.roles.map((r) => r.roleId),
        entry.currentStateKey,
        roleIds,
      );
      if (!editableNow) continue;
      const defs = section.fields.map((f) => this.toFieldDef(f, section.key));
      const allowed = await this.resolveAllowedCodes(defs);
      for (const def of defs) {
        if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
        const val = valuesByKey[def.key];
        if (def.required && isEmptyValue(val)) {
          errors.push(`${def.label}: obligatorio`);
          continue;
        }
        errors.push(...validateFieldValue(def, val, { allowedCodes: allowed.get(def.key) }).errors);
      }
    }
    if (errors.length > 0) {
      throw new BadRequestException({ message: "No se puede enviar: faltan datos o hay errores", errors });
    }

    const sealedAt = new Date();
    const effectiveAt = resolveEffectiveAt(
      version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
      valuesByKey,
      entry.recordedAt,
    );
    const dims = await this.shiftResolver.resolve(effectiveAt, entry.orgNodeId);

    await this.prisma.logEntry.update({
      where: { id },
      data: {
        status: "SUBMITTED",
        sealedAt,
        effectiveAt,
        shiftCode: dims?.shiftCode ?? null,
        operationalDate: dims?.operationalDate ?? null,
        periodKey: dims?.periodKey ?? null,
        updatedById: userId,
      },
    });
    await this.audit.record({
      ...ctx,
      action: "logentry.submitted",
      entityType: "LogEntry",
      entityId: id,
      after: { effectiveAt: effectiveAt.toISOString(), shiftCode: dims?.shiftCode ?? null, periodKey: dims?.periodKey ?? null },
    });
    return this.getDetail(userId, id);
  }

  // --- Listado ---------------------------------------------------------------

  async list(userId: string, query: LogEntryListQuery): Promise<LogEntryListItem[]> {
    const accessible = await this.scope.getAccessibleNodeIds(userId);
    const where: Prisma.LogEntryWhereInput = { deletedAt: null };
    if (query.templateId) where.templateId = query.templateId;
    if (query.orgNodeId) where.orgNodeId = query.orgNodeId;
    if (query.status) where.status = query.status;
    if (accessible !== null) where.orgNodeId = { in: [...accessible] };

    const rows = await this.prisma.logEntry.findMany({
      where,
      orderBy: { recordedAt: "desc" },
      take: 200,
      include: { template: { select: { name: true } } },
    });
    const paths = await this.nodePaths(new Set(rows.map((r) => r.orgNodeId)));
    return rows.map((r) => ({
      ...this.mapEntry(r, r.template.name),
      orgNodePath: paths.get(r.orgNodeId) ?? null,
    }));
  }

  // --- Helpers ---------------------------------------------------------------

  private async loadEntry(id: string): Promise<LogEntryRow> {
    const entry = await this.prisma.logEntry.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundException("Entrada no encontrada");
    return entry;
  }

  private async loadVersion(versionId: string): Promise<VersionWithGraph> {
    const version = await this.prisma.templateVersion.findUnique({ where: { id: versionId }, include: versionInclude });
    if (!version) throw new NotFoundException("Versión de plantilla no encontrada");
    return version;
  }

  private async initialStateKey(workflowDefinitionVersionId: string | null): Promise<string | null> {
    if (!workflowDefinitionVersionId) return null;
    const initial = await this.prisma.workflowState.findFirst({
      where: { workflowDefinitionVersionId, isInitial: true },
      select: { key: true },
    });
    return initial?.key ?? null;
  }

  private toFieldDef(
    f: VersionWithGraph["sections"][number]["fields"][number],
    sectionKey: string,
  ): FieldDef {
    return {
      key: f.key,
      sectionKey,
      type: f.type,
      dataType: f.dataType,
      label: f.label,
      required: f.required,
      config: upgradeFieldConfig(f.type, (f.config ?? {}) as Record<string, unknown>),
      visibleWhen: (f.visibleWhen as FieldDef["visibleWhen"]) ?? null,
      roleIds: f.roles.map((r) => r.roleId),
    };
  }

  private toFieldDtoLite(f: VersionWithGraph["sections"][number]["fields"][number]) {
    return { key: f.key, semanticRole: f.semanticRole } as TemplateVersionDto["sections"][number]["fields"][number];
  }

  /**
   * Resuelve el conjunto de `code` válidos para los campos SELECT/MULTISELECT
   * (inline desde el config; referenceList consultando los ítems activos). Para
   * `external` (Fase 3) no hay catálogo resoluble: se deja sin restricción.
   */
  private async resolveAllowedCodes(fields: FieldDef[]): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    const listKeyByField = new Map<string, string>();
    const listKeys = new Set<string>();

    for (const f of fields) {
      if (f.type !== "SELECT" && f.type !== "MULTISELECT") continue;
      const source = f.config.optionSource as { kind?: string; items?: { code: string }[]; listKey?: string } | undefined;
      if (source?.kind === "inline") {
        result.set(f.key, new Set((source.items ?? []).map((i) => i.code)));
      } else if (source?.kind === "referenceList" && source.listKey) {
        listKeyByField.set(f.key, source.listKey);
        listKeys.add(source.listKey);
      }
    }

    if (listKeys.size > 0) {
      const lists = await this.prisma.referenceList.findMany({
        where: { key: { in: [...listKeys] }, deletedAt: null },
        select: { key: true, items: { where: { active: true }, select: { code: true } } },
      });
      const codesByKey = new Map(lists.map((l) => [l.key, new Set(l.items.map((i) => i.code))]));
      for (const [fieldKey, listKey] of listKeyByField) {
        result.set(fieldKey, codesByKey.get(listKey) ?? new Set());
      }
    }
    return result;
  }

  private isSectionEditableForUser(
    _sectionKey: string,
    editableInStateKey: string | null,
    sectionRoleIds: string[],
    currentStateKey: string | null,
    userRoleIds: Set<string>,
  ): boolean {
    if (!isSectionEditableInState(editableInStateKey, currentStateKey)) return false;
    // Sin roles declarados = cualquier usuario con permiso de llenado puede.
    if (sectionRoleIds.length > 0 && !sectionRoleIds.some((r) => userRoleIds.has(r))) return false;
    return true;
  }

  private async userRoleIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return new Set(rows.map((r) => r.roleId));
  }

  private async namesByUserId(ids: (string | null)[]): Promise<Map<string, string>> {
    const real = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (real.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }

  private toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }

  private mapEntry(e: LogEntryRow, templateName: string) {
    return {
      id: e.id,
      templateId: e.templateId,
      templateVersionId: e.templateVersionId,
      workflowDefinitionId: e.workflowDefinitionId,
      workflowDefinitionVersionId: e.workflowDefinitionVersionId,
      orgNodeId: e.orgNodeId,
      equipmentId: e.equipmentId,
      currentStateKey: e.currentStateKey,
      status: e.status,
      recordedAt: e.recordedAt.toISOString(),
      effectiveAt: e.effectiveAt.toISOString(),
      shiftCode: e.shiftCode,
      operationalDate: e.operationalDate,
      periodKey: e.periodKey,
      sealedAt: e.sealedAt?.toISOString() ?? null,
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      templateName,
    };
  }

  private mapVersion(version: VersionWithGraph): TemplateVersionDto {
    return {
      id: version.id,
      templateId: version.templateId,
      versionNumber: version.versionNumber,
      status: version.status,
      name: version.name,
      description: version.description,
      workflowDefinitionId: version.workflowDefinitionId,
      workflowDefinitionVersionId: version.workflowDefinitionVersionId,
      requireSignature: version.requireSignature,
      recurrenceKind: version.recurrenceKind,
      recurrenceConfig: version.recurrenceConfig ?? null,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      sections: version.sections.map((s) => ({
        id: s.id,
        key: s.key,
        title: s.title,
        description: s.description,
        order: s.order,
        requireSignature: s.requireSignature,
        editableInStateKey: s.editableInStateKey,
        roleIds: s.roles.map((r) => r.roleId),
        fields: s.fields.map((f) => ({
          id: f.id,
          key: f.key,
          type: f.type,
          dataType: f.dataType,
          semanticRole: f.semanticRole,
          label: f.label,
          help: f.help,
          required: f.required,
          order: f.order,
          config: upgradeFieldConfig(f.type, (f.config ?? {}) as Record<string, unknown>),
          visibleWhen: (f.visibleWhen as TemplateVersionDto["sections"][number]["fields"][number]["visibleWhen"]) ?? null,
          roleIds: f.roles.map((r) => r.roleId),
        })),
      })),
    };
  }

  private async assertNodeExists(orgNodeId: string): Promise<void> {
    const exists = await this.prisma.orgNode.count({ where: { id: orgNodeId, deletedAt: null } });
    if (exists === 0) throw new BadRequestException("El nodo indicado no existe");
  }

  private async assertEquipmentExists(equipmentId: string): Promise<void> {
    const exists = await this.prisma.equipment.count({ where: { id: equipmentId, deletedAt: null } });
    if (exists === 0) throw new BadRequestException("El equipo indicado no existe");
  }

  private async assertNodeInScope(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("La entrada está fuera de su alcance");
    }
  }

  private async nodePath(orgNodeId: string): Promise<string | null> {
    return (await this.nodePaths(new Set([orgNodeId]))).get(orgNodeId) ?? null;
  }

  private async nodePaths(nodeIds: Set<string>): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (nodeIds.size === 0) return result;
    const all = await this.prisma.orgNode.findMany({ select: { id: true, name: true, path: true } });
    const nameById = new Map(all.map((n) => [n.id, n.name]));
    const pathById = new Map(all.map((n) => [n.id, n.path]));
    for (const id of nodeIds) {
      const path = pathById.get(id);
      if (!path) continue;
      const names = path.split("/").filter(Boolean).map((nid) => nameById.get(nid) ?? "—");
      result.set(id, names.join(" › "));
    }
    return result;
  }
}
