import { Injectable, Logger } from "@nestjs/common";
import type { AuditLog, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Contexto del actor y la petición para anexar a un evento de auditoría. */
export interface AuditContext {
  actorId?: string | null;
  actorEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}

/** Datos de un evento de auditoría. */
export interface AuditEvent extends AuditContext {
  /** Acción en notación punteada, ej. "auth.login.success", "role.updated". */
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
}

/**
 * Escribe en el AuditLog (append-only). La tabla es inmutable a nivel de base
 * (trigger que rechaza UPDATE/DELETE), así que aquí solo se inserta.
 *
 * Auditar NUNCA debe tumbar la operación de negocio: si la inserción falla, se
 * registra el error y se continúa (la pérdida de un log se trata como incidente
 * operacional, no como fallo de la transacción del usuario).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Lista eventos de auditoría (más recientes primero), con paginación por cursor
   * y filtros para auditores: rango de fechas, acción, actor y tipo de entidad.
   * Los filtros de texto son por coincidencia parcial e insensibles a mayúsculas.
   */
  async list(
    params: {
      take?: number;
      cursor?: string;
      from?: Date;
      to?: Date;
      action?: string;
      actor?: string;
      entityType?: string;
    } = {},
  ) {
    const take = Math.min(Math.max(params.take ?? 50, 1), 200);
    return this.prisma.auditLog.findMany({
      where: this.buildWhere(params),
      take,
      orderBy: { occurredAt: "desc" },
      ...(params.cursor ? { skip: 1, cursor: { id: params.cursor } } : {}),
    });
  }

  /** Tope de filas por exportación (evita una descarga descontrolada). */
  static readonly EXPORT_MAX_ROWS = 100_000;

  /**
   * Trae TODAS las filas que cumplen los filtros (para exportar), en lotes por
   * cursor para no cargar toda la tabla en memoria de una vez. Acotado por
   * `EXPORT_MAX_ROWS`. Devuelve `{ rows, truncated }` para avisar si se cortó.
   */
  async findForExport(
    params: { from?: Date; to?: Date; action?: string; actor?: string; entityType?: string } = {},
  ): Promise<{ rows: AuditLog[]; truncated: boolean }> {
    const where = this.buildWhere(params);
    const batchSize = 1000;
    const rows: AuditLog[] = [];
    let cursor: string | undefined;

    for (;;) {
      const batch = await this.prisma.auditLog.findMany({
        where,
        take: batchSize,
        orderBy: { occurredAt: "desc" },
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      rows.push(...batch);
      if (batch.length < batchSize) return { rows, truncated: false };
      if (rows.length >= AuditService.EXPORT_MAX_ROWS) {
        return { rows: rows.slice(0, AuditService.EXPORT_MAX_ROWS), truncated: true };
      }
      cursor = batch[batch.length - 1]?.id;
    }
  }

  /** Construye el filtro `where` compartido por listado y exportación. */
  private buildWhere(params: {
    from?: Date;
    to?: Date;
    action?: string;
    actor?: string;
    entityType?: string;
  }): Prisma.AuditLogWhereInput {
    const occurredAt =
      params.from || params.to
        ? { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) }
        : undefined;

    return {
      ...(occurredAt ? { occurredAt } : {}),
      ...(params.action ? { action: { contains: params.action, mode: "insensitive" } } : {}),
      ...(params.actor ? { actorEmail: { contains: params.actor, mode: "insensitive" } } : {}),
      ...(params.entityType
        ? { entityType: { contains: params.entityType, mode: "insensitive" } }
        : {}),
    };
  }

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          action: event.action,
          actorId: event.actorId ?? null,
          actorEmail: event.actorEmail ?? null,
          entityType: event.entityType ?? null,
          entityId: event.entityId ?? null,
          before: event.before ?? undefined,
          after: event.after ?? undefined,
          ip: event.ip ?? null,
          userAgent: event.userAgent ?? null,
          metadata: event.metadata ?? undefined,
        },
      });
    } catch (err) {
      this.logger.error(
        `No se pudo registrar el evento de auditoría "${event.action}"`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
