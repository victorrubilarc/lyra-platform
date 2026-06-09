import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateTemplateRequest,
  PublishTemplateRequest,
  SaveTemplateDraftRequest,
  TemplateDetail,
  TemplateListItem,
  TemplateListQuery,
  TemplateVersionDto,
  UpdateTemplateRequest,
} from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { PrismaService } from "../prisma/prisma.service";

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

  async list(userId: string, query: TemplateListQuery): Promise<TemplateListItem[]> {
    const accessible = await this.scope.getAccessibleNodeIds(userId);

    const where: Prisma.TemplateWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.orgNodeId) where.orgNodeId = query.orgNodeId;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const templates = await this.prisma.template.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: { versions: { select: { id: true, versionNumber: true, status: true } } },
    });

    // Alcance ABAC: las plantillas globales (sin nodo) son visibles para todos;
    // las ancladas a un nodo, solo si el usuario tiene ese nodo en su alcance.
    const scoped = templates.filter(
      (t) => accessible === null || t.orgNodeId === null || accessible.has(t.orgNodeId),
    );

    // Versión "a mostrar" por plantilla: la publicada si existe, si no el borrador.
    const displayVersionId = new Map<string, string>(); // versionId -> templateId
    const nodeIds = new Set<string>();
    for (const t of scoped) {
      if (t.orgNodeId) nodeIds.add(t.orgNodeId);
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
        status: t.status,
        currentVersionId: t.currentVersionId,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        orgNodePath: t.orgNodeId ? (nodePaths.get(t.orgNodeId) ?? null) : null,
        sectionCount: c.sections,
        fieldCount: c.fields,
        draftVersionNumber: latestDraft?.versionNumber ?? null,
        publishedVersionNumber: published?.versionNumber ?? null,
      };
    });
  }

  // --- Detalle ---------------------------------------------------------------

  /** Detalle con la versión editable (borrador) o, si se pide, una versión concreta. */
  async getDetail(userId: string, id: string, versionId?: string): Promise<TemplateDetail> {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    await this.assertNodeInScope(userId, template.orgNodeId);

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

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      orgNodeId: template.orgNodeId,
      status: template.status,
      currentVersionId: template.currentVersionId,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
      version: this.mapVersion(version),
      hasDraft: Boolean(draft),
    };
  }

  // --- Crear -----------------------------------------------------------------

  async create(userId: string, dto: CreateTemplateRequest, ctx: AuditContext): Promise<TemplateDetail> {
    if (dto.orgNodeId) await this.assertNodeExists(dto.orgNodeId);

    const template = await this.prisma.template.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        orgNodeId: dto.orgNodeId ?? null,
        status: "DRAFT",
        createdById: userId,
        updatedById: userId,
        versions: {
          create: { versionNumber: 1, status: "DRAFT", name: dto.name, description: dto.description ?? null },
        },
      },
    });
    await this.audit.record({ ...ctx, action: "template.created", entityType: "Template", entityId: template.id, after: { name: template.name, orgNodeId: template.orgNodeId } });
    return this.getDetail(userId, template.id);
  }

  // --- Editar metadata -------------------------------------------------------

  async updateMeta(userId: string, id: string, dto: UpdateTemplateRequest, ctx: AuditContext): Promise<TemplateDetail> {
    const before = await this.prisma.template.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException("Plantilla no encontrada");
    if (dto.orgNodeId) await this.assertNodeExists(dto.orgNodeId);

    await this.prisma.template.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description === undefined ? undefined : dto.description,
        orgNodeId: dto.orgNodeId === undefined ? undefined : dto.orgNodeId,
        updatedById: userId,
      },
    });
    // Si hay borrador abierto, refleja el nombre/descripción en su snapshot.
    const draft = await this.prisma.templateVersion.findFirst({ where: { templateId: id, status: "DRAFT" } });
    if (draft && (dto.name !== undefined || dto.description !== undefined)) {
      await this.prisma.templateVersion.update({
        where: { id: draft.id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description === undefined ? undefined : dto.description,
        },
      });
    }
    await this.audit.record({ ...ctx, action: "template.updated", entityType: "Template", entityId: id, before: { name: before.name, orgNodeId: before.orgNodeId } });
    return this.getDetail(userId, id);
  }

  // --- Guardar borrador (estructura del builder) -----------------------------

  async saveDraft(userId: string, id: string, dto: SaveTemplateDraftRequest, ctx: AuditContext): Promise<TemplateDetail> {
    const template = await this.prisma.template.findFirst({ where: { id, deletedAt: null } });
    if (!template) throw new NotFoundException("Plantilla no encontrada");

    const targetNode = dto.orgNodeId === undefined ? template.orgNodeId : dto.orgNodeId;
    if (targetNode) await this.assertNodeExists(targetNode);
    await this.assertRolesExist(dto);

    const draft = await this.ensureDraft(id);

    await this.prisma.$transaction(async (tx) => {
      // Metadata de la plantilla + snapshot del borrador.
      await tx.template.update({
        where: { id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description === undefined ? undefined : dto.description,
          orgNodeId: dto.orgNodeId === undefined ? undefined : dto.orgNodeId,
          updatedById: userId,
        },
      });
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
              label: field.label,
              help: field.help ?? null,
              required: field.required ?? false,
              order: fOrder,
              config: (field.config ?? {}) as Prisma.InputJsonValue,
              visibleWhen: field.visibleWhen
                ? (field.visibleWhen as Prisma.InputJsonValue)
                : Prisma.DbNull,
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
              label: field.label,
              help: field.help,
              required: field.required,
              order: field.order,
              config: field.config as Prisma.InputJsonValue,
              visibleWhen: field.visibleWhen === null ? Prisma.DbNull : (field.visibleWhen as Prisma.InputJsonValue),
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
          label: f.label,
          help: f.help,
          required: f.required,
          order: f.order,
          config: (f.config ?? {}) as Record<string, unknown>,
          visibleWhen: (f.visibleWhen as TemplateVersionDto["sections"][number]["fields"][number]["visibleWhen"]) ?? null,
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

  private async assertNodeExists(orgNodeId: string): Promise<void> {
    const exists = await this.prisma.orgNode.count({ where: { id: orgNodeId, deletedAt: null } });
    if (exists === 0) throw new BadRequestException("El nodo indicado no existe");
  }

  private async assertNodeInScope(userId: string, orgNodeId: string | null): Promise<void> {
    if (!orgNodeId) return; // plantilla global: visible para todos
    const ok = await this.scope.canAccessNode(userId, orgNodeId);
    if (!ok) throw new ForbiddenException("La plantilla está fuera de su alcance");
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
}
