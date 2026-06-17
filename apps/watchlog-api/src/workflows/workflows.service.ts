import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  CreateWorkflowRequest,
  PublishWorkflowRequest,
  SaveWorkflowDraftRequest,
  UpdateWorkflowRequest,
  WorkflowDetail,
  WorkflowListItem,
  WorkflowListQuery,
  WorkflowVersionDto,
} from "@lyra/contracts";
import { hasBlockingMachineErrors, transitionNotifyConfigSchema, validateWorkflowMachine } from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

/** Incluye la versión completa (estados + transiciones → roles) para el detalle. */
const versionInclude = {
  states: { orderBy: { order: "asc" } },
  transitions: {
    orderBy: { order: "asc" },
    include: {
      fromState: { select: { key: true } },
      toState: { select: { key: true } },
      roles: { select: { roleId: true } },
    },
  },
} satisfies Prisma.WorkflowDefinitionVersionInclude;

type VersionWithGraph = Prisma.WorkflowDefinitionVersionGetPayload<{ include: typeof versionInclude }>;

/**
 * Flujos reutilizables (Fase 2.2) — máquina de estados configurable.
 *
 * `WorkflowDefinition` (contenedor mutable) 1—N `WorkflowDefinitionVersion`
 * (INMUTABLE al publicar, patrón MMR de 21 CFR Part 11). El builder siempre
 * edita una versión en BORRADOR; editar un flujo publicado CLONA la versión
 * publicada en un nuevo borrador (las publicadas nunca se mutan → auditabilidad
 * de los registros que las congelaron).
 *
 * Aquí vive solo la DEFINICIÓN del flujo; la EJECUCIÓN (transiciones en vivo,
 * firmas, step-up MFA) llega en 2.5. La autorización del MANTENEDOR la deciden
 * los guards del controller (workflow:view/manage).
 */
@Injectable()
export class WorkflowsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Listado ---------------------------------------------------------------

  async list(query: WorkflowListQuery): Promise<WorkflowListItem[]> {
    const where: Prisma.WorkflowDefinitionWhereInput = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: "insensitive" } },
        { key: { contains: query.search, mode: "insensitive" } },
        { description: { contains: query.search, mode: "insensitive" } },
      ];
    }

    const defs = await this.prisma.workflowDefinition.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      include: {
        versions: { select: { id: true, versionNumber: true, status: true } },
        _count: { select: { templateVersions: true } },
      },
    });

    // Versión "a mostrar" por flujo: la publicada si existe, si no el borrador.
    const displayVersionId = new Map<string, string>(); // versionId -> definitionId
    for (const d of defs) {
      const display = this.pickDisplayVersion(d.versions, d.currentVersionId);
      if (display) displayVersionId.set(display.id, d.id);
    }

    // Conteos de estados/transiciones de las versiones a mostrar (2 queries).
    const [stateRows, transitionRows] = await Promise.all([
      this.prisma.workflowState.groupBy({
        by: ["workflowDefinitionVersionId"],
        where: { workflowDefinitionVersionId: { in: [...displayVersionId.keys()] } },
        _count: { _all: true },
      }),
      this.prisma.workflowTransition.groupBy({
        by: ["workflowDefinitionVersionId"],
        where: { workflowDefinitionVersionId: { in: [...displayVersionId.keys()] } },
        _count: { _all: true },
      }),
    ]);
    const stateCount = new Map<string, number>();
    const transitionCount = new Map<string, number>();
    for (const r of stateRows) {
      const id = displayVersionId.get(r.workflowDefinitionVersionId);
      if (id) stateCount.set(id, r._count._all);
    }
    for (const r of transitionRows) {
      const id = displayVersionId.get(r.workflowDefinitionVersionId);
      if (id) transitionCount.set(id, r._count._all);
    }

    return defs.map((d) => {
      const published = d.versions.find((v) => v.id === d.currentVersionId);
      const latestDraft = this.latestDraft(d.versions);
      return {
        id: d.id,
        key: d.key,
        name: d.name,
        description: d.description,
        status: d.status,
        currentVersionId: d.currentVersionId,
        createdAt: d.createdAt.toISOString(),
        updatedAt: d.updatedAt.toISOString(),
        stateCount: stateCount.get(d.id) ?? 0,
        transitionCount: transitionCount.get(d.id) ?? 0,
        draftVersionNumber: latestDraft?.versionNumber ?? null,
        publishedVersionNumber: published?.versionNumber ?? null,
        usedByTemplateCount: d._count.templateVersions,
      };
    });
  }

  // --- Detalle ---------------------------------------------------------------

  /** Detalle con la versión editable (borrador) o, si se pide, una versión concreta. */
  async getDetail(id: string, versionId?: string): Promise<WorkflowDetail> {
    const def = await this.prisma.workflowDefinition.findFirst({ where: { id, deletedAt: null } });
    if (!def) throw new NotFoundException("Flujo no encontrado");

    const versions = await this.prisma.workflowDefinitionVersion.findMany({
      where: { workflowDefinitionId: id },
      orderBy: { versionNumber: "desc" },
    });
    const draft = versions.find((v) => v.status === "DRAFT");

    let target: string | undefined = versionId;
    if (!target) target = draft?.id ?? def.currentVersionId ?? versions[0]?.id;
    if (!target) throw new NotFoundException("El flujo no tiene versiones");

    const version = await this.prisma.workflowDefinitionVersion.findFirst({
      where: { id: target, workflowDefinitionId: id },
      include: versionInclude,
    });
    if (!version) throw new NotFoundException("Versión no encontrada");

    return {
      id: def.id,
      key: def.key,
      name: def.name,
      description: def.description,
      status: def.status,
      currentVersionId: def.currentVersionId,
      createdAt: def.createdAt.toISOString(),
      updatedAt: def.updatedAt.toISOString(),
      version: this.mapVersion(version),
      hasDraft: Boolean(draft),
    };
  }

  // --- Crear -----------------------------------------------------------------

  async create(userId: string, dto: CreateWorkflowRequest, ctx: AuditContext): Promise<WorkflowDetail> {
    const existing = await this.prisma.workflowDefinition.findUnique({ where: { key: dto.key } });
    if (existing) throw new BadRequestException("Ya existe un flujo con esa clave");

    const def = await this.prisma.workflowDefinition.create({
      data: {
        key: dto.key,
        name: dto.name,
        description: dto.description ?? null,
        status: "DRAFT",
        createdById: userId,
        updatedById: userId,
        versions: {
          // Borrador inicial con un estado mínimo (degradación elegante).
          create: {
            versionNumber: 1,
            status: "DRAFT",
            name: dto.name,
            description: dto.description ?? null,
            states: {
              create: { key: "abierto", name: "Abierto", order: 1, isInitial: true, isFinal: true },
            },
          },
        },
      },
    });
    await this.audit.record({ ...ctx, action: "workflow.created", entityType: "WorkflowDefinition", entityId: def.id, after: { key: def.key, name: def.name } });
    return this.getDetail(def.id);
  }

  // --- Editar metadata -------------------------------------------------------

  async updateMeta(id: string, dto: UpdateWorkflowRequest, ctx: AuditContext): Promise<WorkflowDetail> {
    const before = await this.prisma.workflowDefinition.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw new NotFoundException("Flujo no encontrado");

    await this.prisma.workflowDefinition.update({
      where: { id },
      data: {
        name: dto.name ?? undefined,
        description: dto.description === undefined ? undefined : dto.description,
      },
    });
    // Refleja nombre/descripción en el borrador abierto (snapshot).
    const draft = await this.prisma.workflowDefinitionVersion.findFirst({ where: { workflowDefinitionId: id, status: "DRAFT" } });
    if (draft && (dto.name !== undefined || dto.description !== undefined)) {
      await this.prisma.workflowDefinitionVersion.update({
        where: { id: draft.id },
        data: {
          name: dto.name ?? undefined,
          description: dto.description === undefined ? undefined : dto.description,
        },
      });
    }
    await this.audit.record({ ...ctx, action: "workflow.updated", entityType: "WorkflowDefinition", entityId: id, before: { name: before.name } });
    return this.getDetail(id);
  }

  // --- Guardar borrador (máquina del builder) --------------------------------

  async saveDraft(id: string, dto: SaveWorkflowDraftRequest, ctx: AuditContext): Promise<WorkflowDetail> {
    const def = await this.prisma.workflowDefinition.findFirst({ where: { id, deletedAt: null } });
    if (!def) throw new NotFoundException("Flujo no encontrado");

    // Defensa en profundidad: el borrador solo exige INTEGRIDAD (errores). Las
    // reglas de máquina completa se exigen al publicar (no confiamos en el cliente).
    const issues = validateWorkflowMachine(dto.states, dto.transitions);
    if (hasBlockingMachineErrors(issues)) {
      throw new BadRequestException(issues.filter((i) => i.severity === "error").map((i) => i.message).join("; "));
    }
    await this.assertRolesExist(dto);

    const draft = await this.ensureDraft(id);

    await this.prisma.$transaction(async (tx) => {
      await tx.workflowDefinition.update({
        where: { id },
        data: { name: dto.name ?? undefined, description: dto.description === undefined ? undefined : dto.description },
      });
      await tx.workflowDefinitionVersion.update({
        where: { id: draft.id },
        data: { name: dto.name ?? def.name, description: dto.description === undefined ? def.description : dto.description },
      });

      // Reemplazo total de la máquina del borrador (cascade borra hijos).
      await tx.workflowState.deleteMany({ where: { workflowDefinitionVersionId: draft.id } });

      // Estados primero (capturar su id por clave para las transiciones).
      const stateIdByKey = new Map<string, string>();
      let sOrder = 0;
      for (const state of dto.states) {
        sOrder += 1;
        const created = await tx.workflowState.create({
          data: {
            workflowDefinitionVersionId: draft.id,
            key: state.key,
            name: state.name,
            description: state.description ?? null,
            order: sOrder,
            isInitial: state.isInitial ?? false,
            isFinal: state.isFinal ?? false,
            color: state.color ?? null,
            maxStayMinutes: state.maxStayMinutes ?? null,
          },
        });
        stateIdByKey.set(state.key, created.id);
      }

      // Transiciones (resuelven clave→id; la validación garantizó que existen).
      let tOrder = 0;
      for (const t of dto.transitions) {
        tOrder += 1;
        // Config de notificación: se NORMALIZA con el contrato (rellena defaults) y se
        // congela como JSON. null/ausente ⇒ SQL NULL (sin config ⇒ default de sistema).
        const notifyConfig = t.notify
          ? (transitionNotifyConfigSchema.parse(t.notify) as Prisma.InputJsonValue)
          : Prisma.DbNull;
        await tx.workflowTransition.create({
          data: {
            workflowDefinitionVersionId: draft.id,
            key: t.key,
            label: t.label,
            fromStateId: stateIdByKey.get(t.fromStateKey)!,
            toStateId: stateIdByKey.get(t.toStateKey)!,
            order: tOrder,
            requireSignature: t.requireSignature ?? false,
            signatureMeaning: t.signatureMeaning ?? null,
            requireMfa: t.requireMfa ?? false,
            notifyConfig,
            roles: t.roleIds?.length ? { create: t.roleIds.map((roleId) => ({ roleId })) } : undefined,
          },
        });
      }
    });

    await this.audit.record({ ...ctx, action: "workflow.draft.saved", entityType: "WorkflowDefinitionVersion", entityId: draft.id, after: { states: dto.states.length, transitions: dto.transitions.length } });
    return this.getDetail(id);
  }

  // --- Publicar (congela la versión) -----------------------------------------

  async publish(userId: string, id: string, _dto: PublishWorkflowRequest, ctx: AuditContext): Promise<WorkflowDetail> {
    const def = await this.prisma.workflowDefinition.findFirst({ where: { id, deletedAt: null } });
    if (!def) throw new NotFoundException("Flujo no encontrado");

    const draft = await this.prisma.workflowDefinitionVersion.findFirst({
      where: { workflowDefinitionId: id, status: "DRAFT" },
      include: versionInclude,
    });
    if (!draft) throw new BadRequestException("No hay un borrador para publicar");

    // Guarda de integridad de la máquina (auditoría): no se publica una FSM rota.
    const issues = validateWorkflowMachine(
      draft.states,
      draft.transitions.map((t) => ({ key: t.key, fromStateKey: t.fromState.key, toStateKey: t.toState.key })),
    );
    if (issues.length > 0) {
      throw new BadRequestException(issues.map((i) => i.message).join("; "));
    }

    await this.prisma.$transaction([
      this.prisma.workflowDefinitionVersion.update({
        where: { id: draft.id },
        data: { status: "PUBLISHED", publishedAt: new Date(), publishedById: userId },
      }),
      this.prisma.workflowDefinition.update({
        where: { id },
        data: { status: "PUBLISHED", currentVersionId: draft.id, updatedById: userId },
      }),
    ]);
    await this.audit.record({ ...ctx, action: "workflow.published", entityType: "WorkflowDefinitionVersion", entityId: draft.id, after: { versionNumber: draft.versionNumber } });
    return this.getDetail(id);
  }

  // --- Eliminar (lógico) -----------------------------------------------------

  async remove(id: string, ctx: AuditContext): Promise<void> {
    const def = await this.prisma.workflowDefinition.findFirst({ where: { id, deletedAt: null } });
    if (!def) throw new NotFoundException("Flujo no encontrado");

    // No se permite borrar un flujo que una versión de plantilla congeló
    // (integridad histórica). El borrado es lógico de todos modos.
    const usedBy = await this.prisma.templateVersion.count({ where: { workflowDefinitionId: id } });
    if (usedBy > 0) {
      throw new BadRequestException("El flujo está en uso por una o más plantillas y no puede eliminarse");
    }

    await this.prisma.workflowDefinition.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.audit.record({ ...ctx, action: "workflow.deleted", entityType: "WorkflowDefinition", entityId: id, before: { key: def.key, name: def.name } });
  }

  // --- Helpers ---------------------------------------------------------------

  /**
   * Devuelve la versión en BORRADOR editable. Si el flujo solo tiene versiones
   * publicadas, CLONA la publicada actual en un nuevo borrador (inmutabilidad).
   */
  private async ensureDraft(definitionId: string): Promise<{ id: string }> {
    const existing = await this.prisma.workflowDefinitionVersion.findFirst({
      where: { workflowDefinitionId: definitionId, status: "DRAFT" },
      select: { id: true },
    });
    if (existing) return existing;

    const def = await this.prisma.workflowDefinition.findUniqueOrThrow({ where: { id: definitionId } });
    const last = await this.prisma.workflowDefinitionVersion.findFirst({
      where: { workflowDefinitionId: definitionId },
      orderBy: { versionNumber: "desc" },
    });
    const source = def.currentVersionId
      ? await this.prisma.workflowDefinitionVersion.findUnique({ where: { id: def.currentVersionId }, include: versionInclude })
      : null;

    const draft = await this.prisma.workflowDefinitionVersion.create({
      data: {
        workflowDefinitionId: definitionId,
        versionNumber: (last?.versionNumber ?? 0) + 1,
        status: "DRAFT",
        name: source?.name ?? def.name,
        description: source?.description ?? def.description,
      },
    });

    // Clona estados y transiciones (resolviendo claves) hacia el nuevo borrador.
    if (source) {
      const stateIdByKey = new Map<string, string>();
      for (const s of source.states) {
        const created = await this.prisma.workflowState.create({
          data: {
            workflowDefinitionVersionId: draft.id,
            key: s.key,
            name: s.name,
            description: s.description,
            order: s.order,
            isInitial: s.isInitial,
            isFinal: s.isFinal,
            color: s.color,
            maxStayMinutes: s.maxStayMinutes,
          },
        });
        stateIdByKey.set(s.key, created.id);
      }
      for (const t of source.transitions) {
        await this.prisma.workflowTransition.create({
          data: {
            workflowDefinitionVersionId: draft.id,
            key: t.key,
            label: t.label,
            fromStateId: stateIdByKey.get(t.fromState.key)!,
            toStateId: stateIdByKey.get(t.toState.key)!,
            order: t.order,
            requireSignature: t.requireSignature,
            signatureMeaning: t.signatureMeaning,
            requireMfa: t.requireMfa,
            // Clona la config de notificación congelada (preserva null = sin config).
            notifyConfig: t.notifyConfig === null ? Prisma.DbNull : (t.notifyConfig as Prisma.InputJsonValue),
            roles: t.roles.length ? { create: t.roles.map((r) => ({ roleId: r.roleId })) } : undefined,
          },
        });
      }
    }
    return { id: draft.id };
  }

  private mapVersion(version: VersionWithGraph): WorkflowVersionDto {
    return {
      id: version.id,
      workflowDefinitionId: version.workflowDefinitionId,
      versionNumber: version.versionNumber,
      status: version.status,
      name: version.name,
      description: version.description,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      states: version.states.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        description: s.description,
        order: s.order,
        isInitial: s.isInitial,
        isFinal: s.isFinal,
        color: s.color,
        maxStayMinutes: s.maxStayMinutes,
      })),
      transitions: version.transitions.map((t) => ({
        id: t.id,
        key: t.key,
        label: t.label,
        fromStateKey: t.fromState.key,
        toStateKey: t.toState.key,
        order: t.order,
        requireSignature: t.requireSignature,
        signatureMeaning: t.signatureMeaning,
        requireMfa: t.requireMfa,
        // Config de notificación congelada (épico notif. avanzadas). safeParse defensivo:
        // un JSON corrupto/obsoleto cae a null (sin config) en vez de romper el detalle.
        notify: (() => {
          if (t.notifyConfig == null) return null;
          const r = transitionNotifyConfigSchema.safeParse(t.notifyConfig);
          return r.success ? r.data : null;
        })(),
        roleIds: t.roles.map((r) => r.roleId),
        // El builder resuelve los nombres con su propia lista de roles (roleNameOf);
        // aquí no hace falta resolverlos (el visor sí los recibe, ver log-entries).
        roleNames: [],
      })),
    };
  }

  private pickDisplayVersion(
    versions: { id: string; versionNumber: number; status: "DRAFT" | "PUBLISHED" }[],
    currentVersionId: string | null,
  ): { id: string } | undefined {
    const published = versions.find((v) => v.id === currentVersionId);
    return published ?? this.latestDraft(versions) ?? versions[0];
  }

  private latestDraft(
    versions: { id: string; versionNumber: number; status: "DRAFT" | "PUBLISHED" }[],
  ): { id: string; versionNumber: number } | undefined {
    return [...versions].filter((v) => v.status === "DRAFT").sort((a, b) => b.versionNumber - a.versionNumber)[0];
  }

  private async assertRolesExist(dto: SaveWorkflowDraftRequest): Promise<void> {
    const ids = new Set<string>();
    for (const t of dto.transitions) t.roleIds?.forEach((r) => ids.add(r));
    if (ids.size === 0) return;
    const found = await this.prisma.role.count({ where: { id: { in: [...ids] } } });
    if (found !== ids.size) throw new BadRequestException("Uno o más roles indicados no existen");
  }
}
