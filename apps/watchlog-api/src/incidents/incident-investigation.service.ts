import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  hasRootCause,
  type CompleteIncidentInvestigationRequest,
  type IncidentInvestigationDto,
  type UpsertIncidentInvestigationRequest,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";

/**
 * Investigación de causa raíz de una incidencia (Fase 4.2b). Método inicial =
 * 5 Porqués. El alcance de datos lo HEREDA de la incidencia (ABAC por nodo). Cada
 * mutación deja huella en el timeline (`IncidentActivity`) y en `AuditLog`. SIN
 * permiso nuevo: se gobierna con `incident:edit` (es gestión del contenido de la
 * incidencia; no hay segregación de funciones como en la verificación CAPA). La
 * investigación COMPLETED con ≥1 causa raíz puede ser CONDICIÓN DE CIERRE cuando el
 * tipo declara `requiresInvestigation` (guarda en `IncidentsService.transition`).
 */
@Injectable()
export class IncidentInvestigationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
  ) {}

  /** Devuelve la investigación de la incidencia, o null si aún no existe. */
  async get(userId: string, incidentId: string): Promise<IncidentInvestigationDto | null> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    const row = await this.prisma.incidentInvestigation.findUnique({
      where: { incidentId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    return row ? this.toDto(row) : null;
  }

  /**
   * Crea o actualiza (upsert) la investigación. La cadena de pasos se REEMPLAZA en
   * bloque (el cliente envía el estado completo). Solo cuando la investigación está
   * en DRAFT (una COMPLETED se reabre primero) y la incidencia abierta.
   */
  async upsert(
    userId: string,
    incidentId: string,
    dto: UpsertIncidentInvestigationRequest,
    ctx: AuditContext,
  ): Promise<IncidentInvestigationDto> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    if (dto.conductedById) await this.assertUserExists(dto.conductedById);

    const existing = await this.prisma.incidentInvestigation.findUnique({ where: { incidentId }, select: { id: true, status: true } });
    if (existing && existing.status === "COMPLETED") {
      throw new BadRequestException("La investigación está completada; reábrela para editarla");
    }

    const isNew = !existing;
    const steps = dto.steps.map((s, i) => ({
      order: i + 1,
      statement: s.statement,
      answer: s.answer ?? null,
      isRootCause: s.isRootCause ?? false,
    }));

    const row = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.incidentInvestigation.upsert({
        where: { incidentId },
        create: {
          incidentId,
          method: dto.method ?? "FIVE_WHYS",
          status: "DRAFT",
          problemStatement: dto.problemStatement,
          rootCauseSummary: dto.rootCauseSummary ?? null,
          conductedById: dto.conductedById ?? null,
          createdById: userId,
          updatedById: userId,
        },
        update: {
          method: dto.method ?? undefined,
          problemStatement: dto.problemStatement,
          rootCauseSummary: dto.rootCauseSummary === undefined ? undefined : dto.rootCauseSummary,
          conductedById: dto.conductedById === undefined ? undefined : dto.conductedById,
          updatedById: userId,
        },
      });
      // Reemplazo en bloque de los pasos (las acciones ligadas a un paso se
      // desligan vía FK SetNull; relinkar es responsabilidad del usuario).
      await tx.incidentInvestigationStep.deleteMany({ where: { investigationId: inv.id } });
      if (steps.length > 0) {
        await tx.incidentInvestigationStep.createMany({
          data: steps.map((s) => ({ ...s, investigationId: inv.id })),
        });
      }
      return tx.incidentInvestigation.findUniqueOrThrow({ where: { id: inv.id }, include: { steps: { orderBy: { order: "asc" } } } });
    });

    await this.addActivity(
      incidentId,
      "INVESTIGATION_UPDATED",
      isNew ? "Investigación de causa raíz iniciada" : "Investigación de causa raíz actualizada",
      ctx,
      { method: row.method, steps: steps.length },
    );
    await this.audit.record({
      ...ctx,
      action: isNew ? "incident.investigation.created" : "incident.investigation.updated",
      entityType: "IncidentInvestigation",
      entityId: row.id,
      after: this.snapshot(row),
    });
    return this.toDto(row);
  }

  /** Completar (DRAFT → COMPLETED). Exige ≥1 causa raíz marcada. */
  async complete(
    userId: string,
    incidentId: string,
    dto: CompleteIncidentInvestigationRequest,
    ctx: AuditContext,
  ): Promise<IncidentInvestigationDto> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    const inv = await this.prisma.incidentInvestigation.findUnique({
      where: { incidentId },
      include: { steps: true },
    });
    if (!inv) throw new BadRequestException("No hay investigación que completar");
    if (inv.status === "COMPLETED") throw new BadRequestException("La investigación ya está completada");
    if (!hasRootCause(inv.steps)) {
      throw new BadRequestException("Marca al menos una causa raíz antes de completar la investigación");
    }

    const row = await this.prisma.incidentInvestigation.update({
      where: { id: inv.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedById: userId,
        rootCauseSummary: dto.rootCauseSummary === undefined ? undefined : dto.rootCauseSummary,
        updatedById: userId,
      },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    await this.addActivity(incidentId, "INVESTIGATION_COMPLETED", "Investigación de causa raíz completada", ctx, {
      rootCauses: row.steps.filter((s) => s.isRootCause).length,
    });
    await this.audit.record({ ...ctx, action: "incident.investigation.completed", entityType: "IncidentInvestigation", entityId: row.id, after: { status: "COMPLETED" } });
    return this.toDto(row);
  }

  /** Reabrir (COMPLETED → DRAFT) para corregir la cadena. */
  async reopen(userId: string, incidentId: string, ctx: AuditContext): Promise<IncidentInvestigationDto> {
    const incident = await this.loadIncident(incidentId);
    await this.assertNodeAccess(userId, incident.orgNodeId);
    if (incident.lifecycle !== "OPEN") throw new BadRequestException("La incidencia ya está cerrada o anulada");
    const inv = await this.prisma.incidentInvestigation.findUnique({ where: { incidentId }, select: { id: true, status: true } });
    if (!inv) throw new BadRequestException("No hay investigación que reabrir");
    if (inv.status !== "COMPLETED") throw new BadRequestException("Solo se puede reabrir una investigación completada");
    const row = await this.prisma.incidentInvestigation.update({
      where: { id: inv.id },
      data: { status: "DRAFT", completedAt: null, completedById: null, updatedById: userId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    await this.addActivity(incidentId, "INVESTIGATION_REOPENED", "Investigación de causa raíz reabierta", ctx);
    await this.audit.record({ ...ctx, action: "incident.investigation.reopened", entityType: "IncidentInvestigation", entityId: row.id, after: { status: "DRAFT" } });
    return this.toDto(row);
  }

  // === Helpers ================================================================

  private async toDto(row: InvestigationRow): Promise<IncidentInvestigationDto> {
    const names = await this.resolveUserNames([row.conductedById, row.completedById]);
    return {
      id: row.id,
      incidentId: row.incidentId,
      method: row.method,
      status: row.status,
      problemStatement: row.problemStatement,
      rootCauseSummary: row.rootCauseSummary,
      conductedById: row.conductedById,
      conductedByName: row.conductedById ? names.get(row.conductedById) ?? null : null,
      completedAt: row.completedAt?.toISOString() ?? null,
      completedById: row.completedById,
      completedByName: row.completedById ? names.get(row.completedById) ?? null : null,
      steps: row.steps.map((s) => ({
        id: s.id,
        order: s.order,
        statement: s.statement,
        answer: s.answer,
        isRootCause: s.isRootCause,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async loadIncident(id: string): Promise<{ id: string; orgNodeId: string; lifecycle: string }> {
    const row = await this.prisma.incident.findUnique({ where: { id }, select: { id: true, orgNodeId: true, lifecycle: true } });
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

  private async assertUserExists(userId: string): Promise<void> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!u) throw new BadRequestException("El usuario indicado no existe");
  }

  private snapshot(row: InvestigationRow): Prisma.InputJsonValue {
    return { method: row.method, status: row.status, steps: row.steps.length, rootCauses: row.steps.filter((s) => s.isRootCause).length };
  }
}

type InvestigationRow = Prisma.IncidentInvestigationGetPayload<{ include: { steps: true } }>;
