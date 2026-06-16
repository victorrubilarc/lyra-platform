import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  ALL_NOTIFICATION_EVENT_KEYS,
  allowedVariablesForEvent,
  unknownPlaceholders,
  type NotificationOutboxItem,
  type NotificationOutboxDetail,
  type NotificationOutboxListResponse,
  type NotificationOutboxQuery,
  type NotificationPreferenceDto,
  type NotificationSubscriptionDto,
  type NotificationTemplateDto,
  type SetNotificationPreferenceRequest,
  type UpdateNotificationTemplateRequest,
  type UpsertNotificationSubscriptionRequest,
} from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";

/** Página por defecto de la bandeja de salida. */
const OUTBOX_PAGE = 50;

/**
 * Servicio de administración del módulo de notificaciones: plantillas de mensaje
 * (gobernanza viva), suscripciones (watchers), preferencias propias (ownership) y
 * la BANDEJA DE SALIDA (registro de envíos, Req-1/Req-5). El motor (resolución +
 * envío) vive en el worker; aquí solo la superficie CRUD/lectura.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Plantillas de mensaje -------------------------------------------------

  async listTemplates(): Promise<NotificationTemplateDto[]> {
    const rows = await this.prisma.notificationTemplate.findMany({
      orderBy: [{ eventKey: "asc" }, { locale: "asc" }],
    });
    return rows.map(toTemplateDto);
  }

  async updateTemplate(
    id: string,
    dto: UpdateNotificationTemplateRequest,
    userId: string,
    ctx: AuditContext,
  ): Promise<NotificationTemplateDto> {
    const before = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Plantilla no encontrada");
    // El cuerpo solo puede referenciar variables que el evento expone (whitelist).
    const allowed = allowedVariablesForEvent(before.eventKey);
    const bad = unknownPlaceholders([dto.subject, dto.bodyText, dto.bodyHtml], allowed);
    if (bad.length > 0) {
      throw new BadRequestException(`Variables no permitidas para este evento: ${bad.join(", ")}`);
    }
    const row = await this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        subject: dto.subject,
        bodyText: dto.bodyText,
        bodyHtml: dto.bodyHtml,
        active: dto.active ?? undefined,
        updatedById: userId,
      },
    });
    await this.audit.record({
      ...ctx,
      action: "notification.template.updated",
      entityType: "NotificationTemplate",
      entityId: id,
      before: { subject: before.subject, active: before.active },
      after: { subject: row.subject, active: row.active },
    });
    return toTemplateDto(row);
  }

  // --- Suscripciones (watchers) ----------------------------------------------

  async listSubscriptions(): Promise<NotificationSubscriptionDto[]> {
    const rows = await this.prisma.notificationSubscription.findMany({ orderBy: { createdAt: "desc" } });
    const roleIds = [...new Set(rows.map((r) => r.subjectRoleId).filter((x): x is string => !!x))];
    const roles = roleIds.length
      ? await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })
      : [];
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    return rows.map((r) => ({
      id: r.id,
      eventKey: r.eventKey,
      subjectUserId: r.subjectUserId,
      subjectRoleId: r.subjectRoleId,
      subjectRoleName: r.subjectRoleId ? (roleName.get(r.subjectRoleId) ?? null) : null,
      orgNodeId: r.orgNodeId,
      includeDescendants: r.includeDescendants,
      templateId: r.templateId,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async createSubscription(
    dto: UpsertNotificationSubscriptionRequest,
    userId: string,
    ctx: AuditContext,
  ): Promise<NotificationSubscriptionDto> {
    if (dto.subjectUserId) {
      const u = await this.prisma.user.findUnique({ where: { id: dto.subjectUserId }, select: { id: true } });
      if (!u) throw new BadRequestException("El usuario indicado no existe");
    }
    if (dto.subjectRoleId) {
      const r = await this.prisma.role.findUnique({ where: { id: dto.subjectRoleId }, select: { id: true } });
      if (!r) throw new BadRequestException("El rol indicado no existe");
    }
    const row = await this.prisma.notificationSubscription.create({
      data: {
        eventKey: dto.eventKey,
        subjectUserId: dto.subjectUserId ?? null,
        subjectRoleId: dto.subjectRoleId ?? null,
        orgNodeId: dto.orgNodeId ?? null,
        includeDescendants: dto.includeDescendants ?? false,
        templateId: dto.templateId ?? null,
        enabled: dto.enabled ?? true,
        createdById: userId,
      },
    });
    await this.audit.record({
      ...ctx,
      action: "notification.subscription.created",
      entityType: "NotificationSubscription",
      entityId: row.id,
      after: { eventKey: row.eventKey, subjectUserId: row.subjectUserId, subjectRoleId: row.subjectRoleId },
    });
    const [dtoOut] = await this.hydrateSubscriptions([row]);
    return dtoOut!;
  }

  async deleteSubscription(id: string, ctx: AuditContext): Promise<void> {
    const row = await this.prisma.notificationSubscription.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Suscripción no encontrada");
    await this.prisma.notificationSubscription.delete({ where: { id } });
    await this.audit.record({
      ...ctx,
      action: "notification.subscription.deleted",
      entityType: "NotificationSubscription",
      entityId: id,
      before: { eventKey: row.eventKey },
    });
  }

  private async hydrateSubscriptions(
    rows: Awaited<ReturnType<PrismaService["notificationSubscription"]["findMany"]>>,
  ): Promise<NotificationSubscriptionDto[]> {
    const roleIds = [...new Set(rows.map((r) => r.subjectRoleId).filter((x): x is string => !!x))];
    const roles = roleIds.length
      ? await this.prisma.role.findMany({ where: { id: { in: roleIds } }, select: { id: true, name: true } })
      : [];
    const roleName = new Map(roles.map((r) => [r.id, r.name]));
    return rows.map((r) => ({
      id: r.id,
      eventKey: r.eventKey,
      subjectUserId: r.subjectUserId,
      subjectRoleId: r.subjectRoleId,
      subjectRoleName: r.subjectRoleId ? (roleName.get(r.subjectRoleId) ?? null) : null,
      orgNodeId: r.orgNodeId,
      includeDescendants: r.includeDescendants,
      templateId: r.templateId,
      enabled: r.enabled,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  // --- Preferencias propias (ownership) --------------------------------------

  /** Preferencias EFECTIVAS del usuario: una por evento (canal EMAIL), default IMMEDIATE. */
  async listMyPreferences(userId: string): Promise<NotificationPreferenceDto[]> {
    const stored = await this.prisma.notificationPreference.findMany({
      where: { userId, channel: "EMAIL" },
    });
    const byEvent = new Map(stored.map((p) => [p.eventKey, p.mode]));
    return ALL_NOTIFICATION_EVENT_KEYS.map((eventKey) => ({
      eventKey,
      channel: "EMAIL" as const,
      mode: (byEvent.get(eventKey) ?? "IMMEDIATE") as NotificationPreferenceDto["mode"],
    }));
  }

  async setMyPreference(userId: string, dto: SetNotificationPreferenceRequest): Promise<NotificationPreferenceDto> {
    const row = await this.prisma.notificationPreference.upsert({
      where: { userId_eventKey_channel: { userId, eventKey: dto.eventKey, channel: dto.channel } },
      create: { userId, eventKey: dto.eventKey, channel: dto.channel, mode: dto.mode },
      update: { mode: dto.mode },
    });
    return { eventKey: row.eventKey, channel: "EMAIL", mode: row.mode as NotificationPreferenceDto["mode"] };
  }

  // --- Bandeja de salida (correo saliente) -----------------------------------

  async listOutbox(q: NotificationOutboxQuery): Promise<NotificationOutboxListResponse> {
    const limit = q.limit ?? OUTBOX_PAGE;
    const where: Prisma.NotificationOutboxWhereInput = {
      ...(q.status ? { status: q.status } : {}),
      ...(q.eventKey ? { eventKey: q.eventKey } : {}),
      ...(q.q
        ? {
            OR: [
              { recipientEmail: { contains: q.q, mode: "insensitive" } },
              { subject: { contains: q.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.notificationOutbox.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const items = await this.hydrateOutbox(page);
    return { items, nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null };
  }

  async getOutboxDetail(id: string): Promise<NotificationOutboxDetail> {
    const row = await this.prisma.notificationOutbox.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Mensaje no encontrado");
    const [item] = await this.hydrateOutbox([row]);
    return { ...item!, bodyText: row.bodyText, bodyHtml: row.bodyHtml };
  }

  /** Reintenta un envío FALLIDO: vuelve a PENDING (el sender lo tomará). */
  async retryOutbox(id: string, ctx: AuditContext): Promise<NotificationOutboxItem> {
    const row = await this.prisma.notificationOutbox.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Mensaje no encontrado");
    if (row.status !== "FAILED") throw new BadRequestException("Solo se puede reintentar un envío fallido");
    await this.prisma.notificationOutbox.update({
      where: { id },
      data: { status: "PENDING", nextAttemptAt: null, lastError: null },
    });
    await this.audit.record({
      ...ctx,
      action: "notification.email.retried",
      entityType: "NotificationOutbox",
      entityId: id,
    });
    const [item] = await this.hydrateOutbox([{ ...row, status: "PENDING" as const }]);
    return item!;
  }

  private async hydrateOutbox(
    rows: Array<{
      id: string;
      eventKey: string;
      channel: "EMAIL";
      recipientUserId: string | null;
      recipientEmail: string;
      subject: string;
      status: NotificationOutboxItem["status"];
      attempts: number;
      lastError: string | null;
      relatedEntityType: string | null;
      relatedEntityId: string | null;
      createdAt: Date;
      sentAt: Date | null;
    }>,
  ): Promise<NotificationOutboxItem[]> {
    const userIds = [...new Set(rows.map((r) => r.recipientUserId).filter((x): x is string => !!x))];
    const users = userIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } })
      : [];
    const name = new Map(users.map((u) => [u.id, u.displayName]));
    return rows.map((r) => ({
      id: r.id,
      eventKey: r.eventKey,
      channel: r.channel,
      recipientUserId: r.recipientUserId,
      recipientName: r.recipientUserId ? (name.get(r.recipientUserId) ?? null) : null,
      recipientEmail: r.recipientEmail,
      subject: r.subject,
      status: r.status,
      attempts: r.attempts,
      lastError: r.lastError,
      relatedEntityType: r.relatedEntityType,
      relatedEntityId: r.relatedEntityId,
      createdAt: r.createdAt.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
    }));
  }
}

function toTemplateDto(row: {
  id: string;
  eventKey: string;
  locale: string;
  channel: "EMAIL";
  subject: string;
  bodyText: string;
  bodyHtml: string;
  active: boolean;
  isSystem: boolean;
  updatedAt: Date;
}): NotificationTemplateDto {
  return {
    id: row.id,
    eventKey: row.eventKey,
    locale: row.locale,
    channel: row.channel,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    active: row.active,
    isSystem: row.isSystem,
    updatedAt: row.updatedAt.toISOString(),
  };
}
