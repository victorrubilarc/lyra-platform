import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  NOTIFICATION_EVENTS,
  createNotificationTemplateRequestSchema,
  notificationOutboxQuerySchema,
  notificationTemplateListQuerySchema,
  setNotificationPreferenceRequestSchema,
  updateNotificationTemplateRequestSchema,
  upsertNotificationSubscriptionRequestSchema,
  type CreateNotificationTemplateRequest,
  type NotificationOutboxQuery,
  type NotificationTemplateListQuery,
  type SetNotificationPreferenceRequest,
  type UpdateNotificationTemplateRequest,
  type UpsertNotificationSubscriptionRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";
import { NotificationWorkerService } from "./notification-worker.service";

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly worker: NotificationWorkerService,
  ) {}

  /** Catálogo de eventos (claves + variables disponibles). Solo autenticado: lo usa
   *  la pantalla de "Mis notificaciones" (accesible a todo usuario) y el editor. */
  @Get("events")
  events() {
    return { events: NOTIFICATION_EVENTS };
  }

  // --- Plantillas de mensaje -------------------------------------------------

  @Get("templates")
  @RequirePermission("notiftemplate:manage")
  listTemplates(
    @Query(new ZodValidationPipe(notificationTemplateListQuerySchema)) query: NotificationTemplateListQuery,
  ) {
    return this.notifications.listTemplates(query).then((templates) => ({ templates }));
  }

  /** Diccionario de comodines `{{campo.<key>}}` de una bitácora (para el editor ad-hoc). */
  @Get("templates/field-variables")
  @RequirePermission("notiftemplate:manage")
  fieldVariables(@Query("templateId") templateId: string) {
    return this.notifications.fieldVariablesFor(templateId).then((variables) => ({ variables }));
  }

  /** Crea una plantilla AD-HOC por bitácora (épico notif. avanzadas). */
  @Post("templates")
  @RequirePermission("notiftemplate:manage")
  createTemplate(
    @Body(new ZodValidationPipe(createNotificationTemplateRequestSchema)) dto: CreateNotificationTemplateRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.notifications.createTemplate(dto, user.id, this.ctx(user, req));
  }

  @Patch("templates/:id")
  @RequirePermission("notiftemplate:manage")
  updateTemplate(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateNotificationTemplateRequestSchema)) dto: UpdateNotificationTemplateRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.notifications.updateTemplate(id, dto, user.id, this.ctx(user, req));
  }

  /** Borra una plantilla AD-HOC por bitácora (la genérica/sistema no). */
  @Delete("templates/:id")
  @RequirePermission("notiftemplate:manage")
  @HttpCode(204)
  async deleteTemplate(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    await this.notifications.deleteTemplate(id, this.ctx(user, req));
  }

  // --- Suscripciones (watchers) ----------------------------------------------

  @Get("subscriptions")
  @RequirePermission("notification:admin")
  listSubscriptions() {
    return this.notifications.listSubscriptions().then((subscriptions) => ({ subscriptions }));
  }

  @Post("subscriptions")
  @RequirePermission("notification:admin")
  createSubscription(
    @Body(new ZodValidationPipe(upsertNotificationSubscriptionRequestSchema)) dto: UpsertNotificationSubscriptionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.notifications.createSubscription(dto, user.id, this.ctx(user, req));
  }

  @Delete("subscriptions/:id")
  @HttpCode(204)
  @RequirePermission("notification:admin")
  async deleteSubscription(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest): Promise<void> {
    await this.notifications.deleteSubscription(id, this.ctx(user, req));
  }

  // --- Preferencias propias (ownership, sin permiso de catálogo) --------------

  @Get("preferences")
  myPreferences(@CurrentUser() user: RequestUser) {
    return this.notifications.listMyPreferences(user.id).then((preferences) => ({ preferences }));
  }

  @Put("preferences")
  setMyPreference(
    @Body(new ZodValidationPipe(setNotificationPreferenceRequestSchema)) dto: SetNotificationPreferenceRequest,
    @CurrentUser() user: RequestUser,
  ) {
    return this.notifications.setMyPreference(user.id, dto);
  }

  // --- Bandeja de salida (correo saliente) -----------------------------------

  @Get("outbox")
  @RequirePermission("notification:view-outbox")
  listOutbox(@Query(new ZodValidationPipe(notificationOutboxQuerySchema)) q: NotificationOutboxQuery) {
    return this.notifications.listOutbox(q);
  }

  @Get("outbox/:id")
  @RequirePermission("notification:view-outbox")
  outboxDetail(@Param("id") id: string) {
    return this.notifications.getOutboxDetail(id);
  }

  @Post("outbox/:id/retry")
  @RequirePermission("notification:view-outbox")
  retryOutbox(@Param("id") id: string, @CurrentUser() user: RequestUser, @Req() req: FastifyRequest) {
    return this.notifications.retryOutbox(id, this.ctx(user, req));
  }

  /** Corre el worker una vez (barrer + despachar + enviar). Operación/diagnóstico. */
  @Post("run")
  @RequirePermission("notification:admin")
  run() {
    return this.worker.runOnce();
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
