import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CrossRule,
  CreateTemplateRequest,
  PublishTemplateRequest,
  SaveTemplateDraftRequest,
  TemplateDetail,
  TemplateListItem,
  TemplateListQuery,
  TemplateNodeAssignmentDto,
  TemplateNodeAssignmentInput,
  TemplateRoleScope,
  TemplateScopeOption,
  TemplateVersionDto,
  UpdateTemplateRequest,
} from "@lyra/contracts";
import { deriveDataType, upgradeFieldConfig } from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { PrismaService } from "../prisma/prisma.service";

/** Asignación de nodo con la ruta materializada (para el chequeo de subárbol). */
type AssignmentRow = { orgNodeId: string; includeDescendants: boolean; orgNode: { path: string } };

/** Cambio de asignaciones de nodo resuelto desde un request (null = no tocar). */
type AssignmentChange = { assignments: TemplateNodeAssignmentInput[]; orgNodeId: string | null };

/** Proyecta las filas de asignación a la forma que consume `ScopeService` (ruta materializada). */
function toScopeAssignments(
  rows: AssignmentRow[],
): Array<{ orgNodeId: string; includeDescendants: boolean; orgNodePath: string }> {
  return rows.map((a) => ({
    orgNodeId: a.orgNodeId,
    includeDescendants: a.includeDescendants,
    orgNodePath: a.orgNode.path,
  }));
}

/** Proyecta las asignaciones a la forma de respuesta (ruta LEGIBLE para mostrar). */
function mapAssignmentsDto(
  rows: Array<{ orgNodeId: string; includeDescendants: boolean }>,
  readablePaths: Map<string, string>,
): TemplateNodeAssignmentDto[] {
  return rows.map((a) => ({
    orgNodeId: a.orgNodeId,
    includeDescendants: a.includeDescendants,
    orgNodePath: readablePaths.get(a.orgNodeId) ?? null,
  }));
}

/** Incluye la versión completa (secciones → campos → roles) para el detalle. */
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

/**
 * Plantillas / Form Builder (Fase 2.1) — lado DEFINICIÓN.
 *
 * `Template` (contenedor mutable) 1—N `TemplateVersion` (INMUTABLE al publicar,
 * patrón MMR de 21 CFR Part 11). El builder siempre edita una versión en
 * BORRADOR; editar una plantilla publicada CLONA la versión publicada en un
 * nuevo borrador (las versiones publicadas nunca se mutan → auditabilidad).
 *
 * El LLENADO y las tablas de EJECUCIÓN (LogEntry…) llegan en 2.4; aquí no se
 * construyen. La autorización (RBAC) la deciden los guards del controller; este
 * service aplica además el alcance ABAC (ScopeService) al listar.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  // --- Listado ---------------------------------------------------------------

  /**
   * Lista de plantillas con alcance ABAC de NODO. `applyTemplateScope` (Fase 2.8)
   * añade el 2.º eje (alcance por PLANTILLA) y SOLO debe activarse en superficies
   * OPERACIONALES (picker de llenado), NO en el admin de plantillas: un diseñador
   * con `template:view` debe seguir viendo todas las plantillas de su nodo para
   * editarlas. Por defecto `false` ⇒ el módulo admin queda idéntico.
   */
  async list(
    userId: string,
    query: TemplateListQuery,
    opts: { applyTemplateScope?: boolean; structureId?: string } = {},
  ): Promise<TemplateListItem[]> {
    const access = await this.scope.getAccessibleNodes(userId);
    const accessibleTemplates = opts.applyTemplateScope
      ? await this.scope.getAccessibleTemplateIds(userId)
      : null;

    const where: Prisma.TemplateWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    // Filtro explícito por nodo: la plantilla tiene una asignación a ese nodo.
    if (query.orgNodeId) where.nodeAssignments = { some: { orgNodeId: query.orgNodeId } };
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const templates = await this.prisma.template.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        versions: { select: { id: true, versionNumber: true, status: true } },
        nodeAssignments: {
          select: {
            orgNodeId: true,
            includeDescendants: true,
            orgNode: { select: { path: true, structureId: true } },
          },
        },
      },
    });

    // Coherencia de ESTRUCTURA ACTIVA (L1c): al CREAR, el picker debe respetar la
    // estructura del workspace, espejo del aislamiento L1b de los listados. Es
    // ADITIVO al ABAC (no lo reemplaza): una plantilla CON asignación aparece solo
    // si ≥1 de sus nodos vive en la estructura activa; una plantilla GLOBAL (sin
    // asignación) es "de toda la instalación" y aparece SIEMPRE (decisión 2026-06-24).
    const inActiveStructure = (assignments: Array<{ orgNode: { structureId: string } }>): boolean =>
      !opts.structureId ||
      assignments.length === 0 ||
      assignments.some((a) => a.orgNode.structureId === opts.structureId);

    // Alcance ABAC en AND de dos ejes:
    //  - NODO (multi-nodo 2.8.0): las globales (sin asignaciones) son visibles para
    //    todos; con asignaciones, basta que ALGUNA intersecte el alcance del usuario.
    //  - PLANTILLA (opt-in operacional): si el usuario tiene allow-list de
    //    plantillas, la plantilla debe estar en ella (incluidas las globales).
    const scoped = templates.filter(
      (t) =>
        this.scope.isTemplateVisibleByNode(toScopeAssignments(t.nodeAssignments), access) &&
        (accessibleTemplates === null || accessibleTemplates.has(t.id)) &&
        inActiveStructure(t.nodeAssignments),
    );

    // Versión "a mostrar" por plantilla: la publicada si existe, si no el borrador.
    const displayVersionId = new Map<string, string>(); // versionId -> templateId
    const nodeIds = new Set<string>();
    for (const t of scoped) {
      if (t.orgNodeId) nodeIds.add(t.orgNodeId);
      for (const a of t.nodeAssignments) nodeIds.add(a.orgNodeId);
      const published = t.versions.find((v) => v.id === t.currentVersionId);
      const latestDraft = [...t.versions]
        .filter((v) => v.status === "DRAFT")
        .sort((a, b) => b.versionNumber - a.versionNumber)[0];
      const display = published ?? latestDraft ?? t.versions[0];
      if (display) displayVersionId.set(display.id, t.id);
    }

    // Conteos de secciones/campos de las versiones a mostrar (1 query).
    const sectionRows = await this.prisma.templateSection.findMany({
      where: { templateVersionId: { in: [...displayVersionId.keys()] } },
      select: { templateVersionId: true, _count: { select: { fields: true } } },
    });
    const counts = new Map<string, { sections: number; fields: number }>();
    for (const s of sectionRows) {
      const tid = displayVersionId.get(s.templateVersionId);
      if (!tid) continue;
      const c = counts.get(tid) ?? { sections: 0, fields: 0 };
      c.sections += 1;
      c.fields += s._count.fields;
      counts.set(tid, c);
    }

    const nodePaths = await this.buildNodePaths(nodeIds);

    return scoped.map((t) => {
      const published = t.versions.find((v) => v.id === t.currentVersionId);
      const latestDraft = [...t.versions]
        .filter((v) => v.status === "DRAFT")
        .sort((a, b) => b.versionNumber - a.versionNumber)[0];
      const c = counts.get(t.id) ?? { sections: 0, fields: 0 };
      return {
        id: t.id,
        name: t.name,
        description: t.description,
        orgNodeId: t.orgNodeId,
        purpose: t.purpose,
        status: t.status,
        currentVersionId: t.currentVersionId,
        editWindowAnchor: t.editWindowAnchor,
        editWindowMinutes: t.editWindowMinutes,
        equipmentMode: t.equipmentMode,
        gridFieldKeys: t.gridFieldKeys,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        orgNodePath: t.orgNodeId ? (nodePaths.get(t.orgNodeId) ?? null) : null,
        nodeAssignments: mapAssignmentsDto(t.nodeAssignments, nodePaths),
        sectionCount: c.sections,
        fieldCount: c.fields,
        draftVersionNumber: latestDraft?.versionNumber ?? null,
        publishedVersionNumber: published?.versionNumber ?? null,
      };
    });
  }

  /**
   * Plantillas asignables como ALCANCE por plantilla (Fase 2.8). Reusa `list`
   * (respeta el alcance de NODO del admin que asigna, incluye todos los estados)
   * y proyecta la forma ligera del selector. NO aplica el eje de plantilla: el
   * admin debe ver el universo asignable.
   */
  async listScopeOptions(userId: string): Promise<TemplateScopeOption[]> {
    const items = await this.list(userId, {});
    return items.map((t) => ({ id: t.id, name: t.name, orgNodePath: t.orgNodePath }));
  }

  /**
   * Acceso por ROL de UNA plantilla (vista recíproca del alcance por plantilla,
   * Fase 2.8): lista de roles asignables + cuáles tienen esta plantilla en su
   * alcance. Pensado para gobernar la audiencia desde la pantalla de Plantillas.
   */
  async getRoleScope(id: string): Promise<TemplateRoleScope> {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    const [roles, assigned] = await Promise.all([
      this.prisma.role.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, key: true } }),
      this.prisma.templateScope.findMany({ where: { templateId: id, NOT: { roleId: null } }, select: { roleId: true } }),
    ]);
    return {
      roles,
      assignedRoleIds: assigned.map((s) => s.roleId).filter((r): r is string => r !== null),
    };
  }

  /**
   * Reemplaza el conjunto de ROLES que tienen ESTA plantilla en su alcance.
   * SOLO toca las filas de esta plantilla (templateId=id, roleId no nulo): el
   * resto del alcance de cada rol y las asignaciones por usuario quedan intactos.
   */
  async setRoleScope(id: string, roleIds: string[], ctx: AuditContext): Promise<TemplateRoleScope> {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");

    const unique = [...new Set(roleIds)];
    if (unique.length > 0) {
      const found = await this.prisma.role.count({ where: { id: { in: unique } } });
      if (found !== unique.length) throw new BadRequestException("Uno o más roles no existen");
    }

    await this.prisma.$transaction([
      this.prisma.templateScope.deleteMany({ where: { templateId: id, NOT: { roleId: null } } }),
      this.prisma.templateScope.createMany({ data: unique.map((roleId) => ({ templateId: id, roleId })) }),
    ]);
    await this.audit.record({ ...ctx, action: "template.rolescope.assigned", entityType: "Template", entityId: id, after: { roleIds: unique } });
    return this.getRoleScope(id);
  }

  // --- Detalle ---------------------------------------------------------------

  /** Detalle con la versión editable (borrador) o, si se pide, una versión concreta. */
  async getDetail(userId: string, id: string, versionId?: string): Promise<TemplateDetail> {
    const template = await this.prisma.template.findFirst({
      where: { id, deletedAt: null },
      include: {
        nodeAssignments: {
          select: { orgNodeId: true, includeDescendants: true, orgNode: { select: { path: true } } },
        },
      },
    });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    await this.assertTemplateNodeVisible(userId, template.nodeAssignments);

    const versions = await this.prisma.templateVersion.findMany({
      where: { templateId: id },
      orderBy: { versionNumber: "desc" },
    });
    const draft = versions.find((v) => v.status === "DRAFT");

    let target: string | undefined = versionId;
    if (!target) target = draft?.id ?? template.currentVersionId ?? versions[0]?.id;
    if (!target) throw new NotFoundException("La plantilla no tiene versiones");

    const version = await this.prisma.templateVersion.findFirst({
      where: { id: target, templateId: id },
      include: versionInclude,
    });
    if (!version) throw new NotFoundException("Versión no encontrada");

    const nodeIds = new Set<string>(template.nodeAssignments.map((a) => a.orgNodeId));
    if (template.orgNodeId) nodeIds.add(template.orgNodeId);
    const nodePaths = await this.buildNodePaths(nodeIds);

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      orgNodeId: template.orgNodeId,
      purpose: template.purpose,
      status: template.status,
      currentVersionId: template.currentVersionId,
      editWindowAnchor: template.editWindowAnchor,
      editWindowMinutes: template.editWindowMinutes,
      equipmentMode: template.equipmentMode,
      gridFieldKeys: template.gridFieldKeys,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      version: this.mapVersion(version),
      hasDraft: Boolean(draft),
      nodeAssignments: mapAssignmentsDto(template.nodeAssignments, nodePaths),
    };
  }

  // --- Crear -----------------------------------------------------------------

  async create(userId: string, dto: CreateTemplateRequest, ctx: AuditContext): Promise<TemplateDetail> {
    // Alcance de estructura (2.8.0): nodeAssignments es la fuente de verdad; un
    // orgNodeId suelto (legacy) se traduce a una asignación simple. Sin nada = global.
    const change = this.resolveAssignmentChange(dto) ?? { assignments: [], orgNodeId: null };
    await this.assertAssignmentNodesExist(change.assignments);

    const template = await this.prisma.template.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        orgNodeId: change.orgNodeId,
        purpose: dto.purpose ?? null,
        status: "DRAFT",
        editWindowAnchor: dto.editWindowAnchor ?? null,
        editWindowMinutes: dto.editWindowMinutes ?? null,
        equipmentMode: dto.equipmentMode ?? undefined, // undefined ⇒ default OPTIONAL del schema
        gridFieldKeys: dto.gridFieldKeys ?? undefined, // undefined ⇒ default [] del schema
        createdById: userId,
        updatedById: userId,
        nodeAssignments: {
          create: change.assignments.map((a) => ({ orgNodeId: a.orgNodeId, includeDescendants: a.includeDescendants })),
        },
        versions: {
          create: { versionNumber: 1, status: "DRAFT", name: dto.name, description: dto.description ?? null },
        },
      },
    });
    await this.audit.record({
      ...ctx,
      action: "template.created",
      entityType: "Template",
      entityId: template.id,
      after: { name: template.name, orgNodeId: template.orgNodeId, nodeAssignments: change.assignments },
    });
    return this.getDetail(userId, template.id);
  }

  // --- Editar metadata -------------------------------------------------------

  async updateMeta(userId: string, id: string, dto: UpdateTemplateRequest, ctx: AuditContext): Promise<TemplateDetail> {
    const before = await this.prisma.template.findFirst({
      where: { id, deletedAt: null },
      include: { nodeAssignments: { select: { orgNodeId: true, includeDescendants: true } } },
    });
    if (!before) throw new NotFoundException("Plantilla no encontrada");
    // Alcance de estructura (2.8.0): null = no tocar; si viene, reemplaza el set.
    const change = this.resolveAssignmentChange(dto);
    if (change) await this.assertAssignmentNodesExist(change.assignments);
    // Campos de resumen de grilla (2.8.1a): si viene, valida que cada `key` exista
    // en alguna versión de la plantilla (evita typos/órfanos; tolera cross-versión).
    if (dto.gridFieldKeys !== undefined) await this.assertGridFieldKeysExist(id, dto.gridFieldKeys);

    const updated = await this.prisma.$transaction(async (tx) => {
      const t = await tx.template.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description === undefined ? undefined : dto.description,
          orgNodeId: change ? change.orgNodeId : undefined,
          // Propósito/marcador de UX (fork W5): editable en el contenedor mutable.
          purpose: dto.purpose === undefined ? undefined : dto.purpose,
          // Ventana de edición (2.7.2): gobernanza viva, editable sin republicar.
          editWindowAnchor: dto.editWindowAnchor === undefined ? undefined : dto.editWindowAnchor,
          editWindowMinutes: dto.editWindowMinutes === undefined ? undefined : dto.editWindowMinutes,
          // Modo de equipo (2.8.0.2): gobernanza viva, editable sin republicar.
          equipmentMode: dto.equipmentMode === undefined ? undefined : dto.equipmentMode,
          // Campos de resumen de grilla (2.8.1a): gobernanza viva, editable sin republicar.
          gridFieldKeys: dto.gridFieldKeys === undefined ? undefined : dto.gridFieldKeys,
          updatedById: userId,
        },
      });
      if (change) await this.replaceNodeAssignments(tx, id, change.assignments);
      // Si hay borrador abierto, refleja el nombre/descripción en su snapshot.
      const draft = await tx.templateVersion.findFirst({ where: { templateId: id, status: "DRAFT" } });
      if (draft && (dto.name !== undefined || dto.description !== undefined)) {
        await tx.templateVersion.update({
          where: { id: draft.id },
          data: {
            name: dto.name ?? undefined,
            description: dto.description === undefined ? undefined : dto.description,
          },
        });
      }
      return t;
    });
    await this.audit.record({
      ...ctx,
      action: "template.updated",
      entityType: "Template",
      entityId: id,
      // La ventana de edición y el alcance de nodo son config de GOBERNANZA: su cambio queda con before/after.
      before: {
        name: before.name,
        orgNodeId: before.orgNodeId,
        nodeAssignments: before.nodeAssignments,
        editWindowAnchor: before.editWindowAnchor,
        editWindowMinutes: before.editWindowMinutes,
        equipmentMode: before.equipmentMode,
        gridFieldKeys: before.gridFieldKeys,
      },
      after: {
        name: updated.name,
        orgNodeId: updated.orgNodeId,
        nodeAssignments: change ? change.assignments : before.nodeAssignments,
        editWindowAnchor: updated.editWindowAnchor,
        editWindowMinutes: updated.editWindowMinutes,
        equipmentMode: updated.equipmentMode,
        gridFieldKeys: updated.gridFieldKeys,
      },
    });
    return this.getDetail(userId, id);
  }

  // --- Guardar borrador (estructura del builder) -----------------------------

  async saveDraft(userId: string, id: string, dto: SaveTemplateDraftRequest, ctx: AuditContext): Promise<TemplateDetail> {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");

    // Alcance de estructura (2.8.0): el builder envía nodeAssignments; null = no tocar.
    const change = this.resolveAssignmentChange(dto);
    if (change) await this.assertAssignmentNodesExist(change.assignments);
    await this.assertRolesExist(dto);
    // Valida el binding del flujo (existe/publicado/versión congelada) y que las
    // claves de estado de sección pertenezcan a esa versión de flujo.
    const workflowBinding = await this.resolveWorkflowBinding(dto);
    // Valida que cada campo con optionSource.referenceList apunte a una lista viva.
    await this.assertReferenceListsExist(dto);
    // Valida las ACCIONES de las reglas (Fase 4.1.2): severidad WARN + tipo/categoría vivos.
    await this.assertRuleActionsValid(dto);

    const draft = await this.ensureDraft(id);

    await this.prisma.$transaction(async (tx) => {
      // Metadata de la plantilla + snapshot del borrador.
      await tx.template.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description === undefined ? undefined : dto.description,
          orgNodeId: change ? change.orgNodeId : undefined,
          // Ventana de edición (2.7.2): config del contenedor, viaja con el builder.
          editWindowAnchor: dto.editWindowAnchor === undefined ? undefined : dto.editWindowAnchor,
          editWindowMinutes: dto.editWindowMinutes === undefined ? undefined : dto.editWindowMinutes,
          // Modo de equipo (2.8.0.2): config del contenedor, viaja con el builder.
          equipmentMode: dto.equipmentMode === undefined ? undefined : dto.equipmentMode,
          updatedById: userId,
        },
      });
      if (change) await this.replaceNodeAssignments(tx, id, change.assignments);
      await tx.templateVersion.update({
        where: { id: draft.id },
        data: {
          name: dto.name ?? template.name,
          description: dto.description === undefined ? template.description : dto.description,
          requireSignature: dto.requireSignature ?? undefined,
          recurrenceKind: dto.recurrenceKind ?? undefined,
          recurrenceConfig:
            dto.recurrenceConfig === undefined
              ? undefined
              : dto.recurrenceConfig === null
                ? Prisma.DbNull
                : (dto.recurrenceConfig as Prisma.InputJsonValue),
          // Flujo asignado (null = sin flujo). Solo se toca si el cliente lo envía.
          workflowDefinitionId: workflowBinding === undefined ? undefined : workflowBinding.definitionId,
          workflowDefinitionVersionId: workflowBinding === undefined ? undefined : workflowBinding.versionId,
          // Reglas de validación cruzada (Req-7): si se envía, reemplaza el set.
          rules: dto.rules === undefined ? undefined : (dto.rules as Prisma.InputJsonValue),
        },
      });

      // Reemplazo total de la estructura del borrador (cascade borra hijos).
      await tx.templateSection.deleteMany({ where: { templateVersionId: draft.id } });
      let sOrder = 0;
      for (const section of dto.sections) {
        sOrder += 1;
        const createdSection = await tx.templateSection.create({
          data: {
            templateVersionId: draft.id,
            key: section.key,
            title: section.title,
            description: section.description ?? null,
            order: sOrder,
            requireSignature: section.requireSignature ?? false,
            editableInStateKey: section.editableInStateKey ?? null,
            roles: section.roleIds?.length
              ? { create: section.roleIds.map((roleId) => ({ roleId })) }
              : undefined,
          },
        });
        let fOrder = 0;
        for (const field of section.fields) {
          fOrder += 1;
          await tx.templateField.create({
            data: {
              sectionId: createdSection.id,
              key: field.key,
              type: field.type,
              // Capa 2: derivada del tipo (el cliente no la envía). Capa 3: opcional.
              dataType: deriveDataType(field.type),
              semanticRole: field.semanticRole ?? null,
              label: field.label,
              help: field.help ?? null,
              required: field.required ?? false,
              order: fOrder,
              config: upgradeFieldConfig(field.type, field.config ?? {}) as Prisma.InputJsonValue,
              visibleWhen: field.visibleWhen
                ? (field.visibleWhen as Prisma.InputJsonValue)
                : Prisma.DbNull,
              // Campo formulado (Req-7): AST de la fórmula. null = tecleado normal.
              computed: field.computed ? (field.computed as Prisma.InputJsonValue) : Prisma.DbNull,
              // Ancho en columnas de la grilla de 12 (2.1.3). Ausente = 12 (completo).
              colSpan: field.colSpan ?? 12,
              // Geometría del lienzo (2.1.7): columna/fila/alto. Ausente = null
              // (legacy/sin geometría); el editor la deriva al abrir y la persiste.
              gridX: field.gridX ?? null,
              gridY: field.gridY ?? null,
              gridH: field.gridH ?? null,
              roles: field.roleIds?.length
                ? { create: field.roleIds.map((roleId) => ({ roleId })) }
                : undefined,
            },
          });
        }
      }
    });

    await this.audit.record({ ...ctx, action: "template.draft.saved", entityType: "TemplateVersion", entityId: draft.id, after: { sections: dto.sections.length } });
    return this.getDetail(userId, id);
  }

  // --- Publicar (congela la versión) -----------------------------------------

  async publish(userId: string, id: string, _dto: PublishTemplateRequest, ctx: AuditContext): Promise<TemplateDetail> {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");

    const draft = await this.prisma.templateVersion.findFirst({
      where: { templateId: id, status: "DRAFT" },
      include: { _count: { select: { sections: true } } },
    });
    if (!draft) throw new BadRequestException("No hay un borrador para publicar");
    if (draft._count.sections === 0) {
      throw new BadRequestException("La plantilla debe tener al menos una sección para publicarse");
    }

    await this.prisma.$transaction([
      this.prisma.templateVersion.update({
        where: { id: draft.id },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: userId },
      }),
      this.prisma.template.update({
        where: { id },
        data: { status: "PUBLISHED", currentVersionId: draft.id, updatedById: userId },
      }),
    ]);
    await this.audit.record({ ...ctx, action: "template.published", entityType: "TemplateVersion", entityId: draft.id, after: { versionNumber: draft.versionNumber } });
    return this.getDetail(userId, id);
  }

  // --- Eliminar (lógico) -----------------------------------------------------

  async remove(id: string, ctx: AuditContext): Promise<void> {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    await this.prisma.template.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ ...ctx, action: "template.deleted", entityType: "Template", entityId: id, before: { name: template.name } });
  }

  // --- Helpers ---------------------------------------------------------------

  /**
   * Devuelve la versión en BORRADOR editable. Si la plantilla solo tiene
   * versiones publicadas, CLONA la publicada actual en un nuevo borrador
   * (las publicadas son inmutables).
   */
  private async ensureDraft(templateId: string): Promise<{ id: string }> {
    const existing = await this.prisma.templateVersion.findFirst({
      where: { templateId, status: "DRAFT" },
      select: { id: true },
    });
    if (existing) return existing;

    const template = await this.prisma.template.findUniqueOrThrow({ where: { id: templateId } });
    const last = await this.prisma.templateVersion.findFirst({
      where: { templateId },
      orderBy: { versionNumber: "desc" },
    });
    const source = template.currentVersionId
      ? await this.prisma.templateVersion.findUnique({ where: { id: template.currentVersionId }, include: versionInclude })
      : null;

    const draft = await this.prisma.templateVersion.create({
      data: {
        templateId,
        versionNumber: (last?.versionNumber ?? 0) + 1,
        status: "DRAFT",
        name: source?.name ?? template.name,
        description: source?.description ?? template.description,
        requireSignature: source?.requireSignature ?? false,
        recurrenceKind: source?.recurrenceKind ?? "NONE",
        // Preserva las reglas cruzadas al clonar (editar publicada → nuevo borrador).
        rules: (source?.rules ?? []) as Prisma.InputJsonValue,
        // Preserva el flujo congelado al clonar (editar publicada → nuevo borrador).
        workflowDefinitionId: source?.workflowDefinitionId ?? null,
        workflowDefinitionVersionId: source?.workflowDefinitionVersionId ?? null,
      },
    });

    // Clona la estructura de la versión publicada hacia el nuevo borrador.
    if (source) {
      for (const section of source.sections) {
        const createdSection = await this.prisma.templateSection.create({
          data: {
            templateVersionId: draft.id,
            key: section.key,
            title: section.title,
            description: section.description,
            order: section.order,
            requireSignature: section.requireSignature,
            editableInStateKey: section.editableInStateKey,
            roles: section.roles.length ? { create: section.roles.map((r) => ({ roleId: r.roleId })) } : undefined,
          },
        });
        for (const field of section.fields) {
          await this.prisma.templateField.create({
            data: {
              sectionId: createdSection.id,
              key: field.key,
              type: field.type,
              dataType: field.dataType,
              semanticRole: field.semanticRole,
              label: field.label,
              help: field.help,
              required: field.required,
              order: field.order,
              config: upgradeFieldConfig(field.type, (field.config ?? {}) as Record<string, unknown>) as Prisma.InputJsonValue,
              visibleWhen: field.visibleWhen === null ? Prisma.DbNull : (field.visibleWhen as Prisma.InputJsonValue),
              computed: field.computed == null ? Prisma.DbNull : (field.computed as Prisma.InputJsonValue),
              // Ancho en columnas (2.1.3): viaja en la versión CONGELADA al clonar.
              colSpan: field.colSpan,
              // Geometría del lienzo (2.1.7): congelada al clonar (preserva el diseño).
              gridX: field.gridX,
              gridY: field.gridY,
              gridH: field.gridH,
              roles: field.roles.length ? { create: field.roles.map((r) => ({ roleId: r.roleId })) } : undefined,
            },
          });
        }
      }
    }
    return { id: draft.id };
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
      rules: (version.rules as TemplateVersionDto["rules"]) ?? [],
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
          // Normaliza el shape de config al vigente (options[] legacy → optionSource).
          config: upgradeFieldConfig(f.type, (f.config ?? {}) as Record<string, unknown>),
          visibleWhen: (f.visibleWhen as TemplateVersionDto["sections"][number]["fields"][number]["visibleWhen"]) ?? null,
          computed: (f.computed as TemplateVersionDto["sections"][number]["fields"][number]["computed"]) ?? null,
          colSpan: f.colSpan,
          gridX: f.gridX,
          gridY: f.gridY,
          gridH: f.gridH,
          roleIds: f.roles.map((r) => r.roleId),
        })),
      })),
    };
  }

  /** Construye "Planta › Área › Proceso" para un conjunto de nodos. */
  private async buildNodePaths(nodeIds: Set<string>): Promise<Map<string, string>> {
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

  // --- Alcance de estructura (asignaciones de nodo, Fase 2.8.0) ---------------

  /**
   * Resuelve el cambio de asignaciones desde un request. `nodeAssignments` es la
   * fuente de verdad; si falta, se traduce un `orgNodeId` suelto (legacy/deprecado)
   * a una asignación de nodo simple. `null` = no tocar (ningún campo presente).
   */
  private resolveAssignmentChange(dto: {
    nodeAssignments?: TemplateNodeAssignmentInput[];
    orgNodeId?: string | null;
  }): AssignmentChange | null {
    if (dto.nodeAssignments !== undefined) {
      const assignments = this.dedupeAssignments(dto.nodeAssignments);
      return { assignments, orgNodeId: this.deriveOrgNodeId(assignments) };
    }
    if (dto.orgNodeId !== undefined) {
      const assignments = dto.orgNodeId ? [{ orgNodeId: dto.orgNodeId, includeDescendants: false }] : [];
      return { assignments, orgNodeId: dto.orgNodeId ?? null };
    }
    return null;
  }

  /** Colapsa asignaciones repetidas por nodo (incluir-descendientes = OR). */
  private dedupeAssignments(input: TemplateNodeAssignmentInput[]): TemplateNodeAssignmentInput[] {
    const byNode = new Map<string, boolean>();
    for (const a of input) byNode.set(a.orgNodeId, (byNode.get(a.orgNodeId) ?? false) || a.includeDescendants);
    return [...byNode].map(([orgNodeId, includeDescendants]) => ({ orgNodeId, includeDescendants }));
  }

  /**
   * Nodo PRIMARIO derivado (columna `orgNodeId`, deprecada): solo cuando hay una
   * única asignación de nodo simple. En global / varios / rama queda `null` ⇒ crear
   * una entrada exige elegir el nodo explícitamente (no hay default silencioso).
   */
  private deriveOrgNodeId(assignments: TemplateNodeAssignmentInput[]): string | null {
    return assignments.length === 1 && !assignments[0]!.includeDescendants ? assignments[0]!.orgNodeId : null;
  }

  private async assertAssignmentNodesExist(assignments: TemplateNodeAssignmentInput[]): Promise<void> {
    const ids = [...new Set(assignments.map((a) => a.orgNodeId))];
    if (ids.length === 0) return;
    const found = await this.prisma.orgNode.count({ where: { id: { in: ids }, deletedAt: null } });
    if (found !== ids.length) throw new BadRequestException("Uno o más nodos de la asignación no existen");
  }

  /**
   * Campos de resumen de grilla (2.8.1a): cada `key` del pool debe existir como
   * campo en ALGUNA versión de la plantilla (tolera cross-versión: el pool es
   * gobernanza viva keyed por `key` estable, no por una versión concreta). Rechaza
   * typos / claves órfanas. El cap (6) y la unicidad los valida el contrato.
   */
  private async assertGridFieldKeysExist(templateId: string, keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const fields = await this.prisma.templateField.findMany({
      where: { section: { version: { templateId } }, key: { in: keys } },
      select: { key: true, dataType: true },
      distinct: ["key"],
    });
    const valid = new Set(fields.map((f) => f.key));
    const missing = keys.filter((k) => !valid.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(`Campos de resumen inexistentes en la plantilla: ${missing.join(", ")}`);
    }
    // Los objetos de PRESENTACIÓN (dataType LAYOUT) no son dato ⇒ no pueden ser
    // candidatos de la línea "Resumen" de la grilla (no tienen valor que mostrar).
    const presentational = fields.filter((f) => f.dataType === "LAYOUT").map((f) => f.key);
    if (presentational.length > 0) {
      throw new BadRequestException(`Los objetos de presentación no pueden ser campos de resumen: ${presentational.join(", ")}`);
    }
    // Los objetos ESTRUCTURADOS (Ola 4: TABLE/MATRIX) son colecciones de celdas:
    // opacos a la línea "Resumen" de la grilla en el MVP (no hay un valor escalar que
    // mostrar). El conteo de filas como resumen queda diferido (BACKLOG §4).
    const structured = fields.filter((f) => f.dataType === "TABLE" || f.dataType === "MATRIX").map((f) => f.key);
    if (structured.length > 0) {
      throw new BadRequestException(`Los objetos estructurados (tabla/matriz) no pueden ser campos de resumen: ${structured.join(", ")}`);
    }
  }

  /** Reemplaza por completo el set de asignaciones de la plantilla (dentro de una tx). */
  private async replaceNodeAssignments(
    tx: Prisma.TransactionClient,
    templateId: string,
    assignments: TemplateNodeAssignmentInput[],
  ): Promise<void> {
    await tx.templateNodeAssignment.deleteMany({ where: { templateId } });
    if (assignments.length > 0) {
      await tx.templateNodeAssignment.createMany({
        data: assignments.map((a) => ({
          templateId,
          orgNodeId: a.orgNodeId,
          includeDescendants: a.includeDescendants,
        })),
      });
    }
  }

  /**
   * Gate de visibilidad por NODO en el admin de plantillas (2.8.0). Un diseñador
   * con `template:view` ve la plantilla si ALGUNA asignación intersecta su alcance,
   * o si es global (sin asignaciones). El eje de PLANTILLA (2.8) no se aplica aquí.
   */
  private async assertTemplateNodeVisible(userId: string, assignments: AssignmentRow[]): Promise<void> {
    const access = await this.scope.getAccessibleNodes(userId);
    if (!this.scope.isTemplateVisibleByNode(toScopeAssignments(assignments), access)) {
      throw new ForbiddenException("La plantilla está fuera de su alcance");
    }
  }

  private async assertRolesExist(dto: SaveTemplateDraftRequest): Promise<void> {
    const ids = new Set<string>();
    for (const s of dto.sections) {
      s.roleIds?.forEach((r) => ids.add(r));
      s.fields.forEach((f) => f.roleIds?.forEach((r) => ids.add(r)));
    }
    if (ids.size === 0) return;
    const found = await this.prisma.role.count({ where: { id: { in: [...ids] } } });
    if (found !== ids.size) throw new BadRequestException("Uno o más roles indicados no existen");
  }

  /**
   * Resuelve y valida el binding del flujo (Fase 2.2): que exista, esté
   * PUBLICADO, que la versión a congelar sea la publicada vigente y que cada
   * `editableInStateKey` de sección sea una clave de estado de esa versión.
   *
   * Retorna `undefined` si el cliente no envió el binding (no se toca), o
   * `{ definitionId, versionId }` con null para "sin flujo" (degradación elegante).
   */
  private async resolveWorkflowBinding(
    dto: SaveTemplateDraftRequest,
  ): Promise<{ definitionId: string | null; versionId: string | null } | undefined> {
    if (dto.workflowDefinitionId === undefined && dto.workflowDefinitionVersionId === undefined) {
      return undefined;
    }
    const defId = dto.workflowDefinitionId ?? null;

    if (defId === null) {
      // Sin flujo: ninguna sección puede declarar un estado editable.
      const withState = dto.sections.find((s) => s.editableInStateKey);
      if (withState) {
        throw new BadRequestException("No se puede asignar un estado a una sección sin un flujo");
      }
      return { definitionId: null, versionId: null };
    }

    const def = await this.prisma.workflowDefinition.findFirst({ where: { id: defId, deletedAt: null } });
    if (!def) throw new BadRequestException("El flujo indicado no existe");
    if (def.status !== "PUBLISHED" || !def.currentVersionId) {
      throw new BadRequestException("El flujo debe estar publicado para asignarse a una plantilla");
    }
    const versionId = dto.workflowDefinitionVersionId ?? def.currentVersionId;
    if (versionId !== def.currentVersionId) {
      throw new BadRequestException("Solo puede asignarse la versión publicada vigente del flujo");
    }

    const states = await this.prisma.workflowState.findMany({
      where: { workflowDefinitionVersionId: versionId },
      select: { key: true },
    });
    const keys = new Set(states.map((s) => s.key));
    for (const s of dto.sections) {
      if (s.editableInStateKey && !keys.has(s.editableInStateKey)) {
        throw new BadRequestException(
          `La sección "${s.key}" referencia un estado inexistente del flujo: ${s.editableInStateKey}`,
        );
      }
    }
    return { definitionId: defId, versionId };
  }

  /**
   * Valida el binding de datos de referencia (Fase 2.x): cada campo SELECT/
   * MULTISELECT cuyo `optionSource` sea `referenceList` debe apuntar a una lista
   * existente y viva (no borrada). Espejo de la validación del binding de flujo.
   * El valor se guarda como `code` estable; aquí solo se asegura que la lista
   * referenciada exista al definir la plantilla.
   */
  private async assertReferenceListsExist(dto: SaveTemplateDraftRequest): Promise<void> {
    const keys = new Set<string>();
    for (const section of dto.sections) {
      for (const field of section.fields) {
        if (field.type !== "SELECT" && field.type !== "MULTISELECT") continue;
        const config = upgradeFieldConfig(field.type, (field.config ?? {}) as Record<string, unknown>);
        const source = config.optionSource as { kind?: string; listKey?: string } | undefined;
        if (source?.kind === "referenceList" && source.listKey) {
          keys.add(source.listKey);
        }
      }
    }
    if (keys.size === 0) return;

    const found = await this.prisma.referenceList.findMany({
      where: { key: { in: [...keys] }, deletedAt: null },
      select: { key: true },
    });
    const foundKeys = new Set(found.map((l) => l.key));
    const missing = [...keys].filter((k) => !foundKeys.has(k));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Lista de referencia inexistente: ${missing.join(", ")}. Créela en Datos de referencia o use opciones en línea.`,
      );
    }
  }

  /**
   * Valida server-side las ACCIONES de las reglas cruzadas (Fase 4.1.2): una regla
   * con acción debe ser WARN (no bloqueante) y, si abre incidencia, el tipo (y la
   * categoría, si la trae) deben existir y estar activos. Server-authoritative: el
   * builder ya lo previene, pero la versión queda CONGELADA y no puede traer una
   * referencia muerta a la que el worker no pueda atar la incidencia.
   */
  private async assertRuleActionsValid(dto: SaveTemplateDraftRequest): Promise<void> {
    const rules = (dto.rules ?? []) as CrossRule[];
    const typeIds = new Set<string>();
    const categoryIds = new Set<string>();
    for (const rule of rules) {
      const action = rule.action;
      if (!action || action.kind === "none") continue;
      if (rule.severity !== "WARN") {
        throw new BadRequestException(
          `La regla "${rule.name || rule.key}" tiene una acción: debe ser de tipo Advertencia, no Error.`,
        );
      }
      if (action.kind === "openIncident") {
        typeIds.add(action.incidentTypeId);
        if (action.incidentCategoryId) categoryIds.add(action.incidentCategoryId);
      }
    }
    if (typeIds.size > 0) {
      const types = await this.prisma.incidentType.findMany({
        where: { id: { in: [...typeIds] }, deletedAt: null, active: true },
        select: { id: true },
      });
      const found = new Set(types.map((t) => t.id));
      const missing = [...typeIds].filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Tipo de incidencia inexistente o inactivo en una acción de regla.`);
      }
    }
    if (categoryIds.size > 0) {
      const cats = await this.prisma.incidentCategory.findMany({
        where: { id: { in: [...categoryIds] }, deletedAt: null, active: true },
        select: { id: true },
      });
      const found = new Set(cats.map((c) => c.id));
      const missing = [...categoryIds].filter((id) => !found.has(id));
      if (missing.length > 0) {
        throw new BadRequestException(`Categoría de incidencia inexistente o inactiva en una acción de regla.`);
      }
    }
  }
}
