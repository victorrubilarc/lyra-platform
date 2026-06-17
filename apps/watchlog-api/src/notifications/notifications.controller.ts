import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  MessageEvent,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Sse,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { from, interval, map, merge, switchMap, type Observable } from "rxjs";
import type { FastifyRequest } from "fastify";
import {
  NOTIFICATION_EVENTS,
  createNotificationTemplateRequestSchema,
  inboxListQuerySchema,
  notificationOutboxQuerySchema,
  notificationTemplateListQuerySchema,
  setNotificationPreferenceRequestSchema,
  updateNotificationTemplateRequestSchema,
  upsertNotificationSubscriptionRequestSchema,
  type CreateNotificationTemplateRequest,
  type InboxListQuery,
  type NotificationOutboxQuery,
  type NotificationTemplateListQuery,
  type SetNotificationPreferenceRequest,
  type UpdateNotificationTemplateRequest,
  type UpsertNotificationSubscriptionRequest,
} from "@lyra/contracts";
import type { Env } from "../config/env.schema";
import type { AccessTokenClaims } from "../authz/auth-user";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, Public, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotificationsService } from "./notifications.service";
import { NotificationWorkerService } from "./notification-worker.service";
import { NotificationRealtimeService } from "./notification-realtime.service";

/** Heartbeat del stream SSE: mantiene viva la conexión tras proxies/timeouts. */
const SSE_HEARTBEAT_MS = 25_000;

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly worker: NotificationWorkerService,
    private readonly realtime: NotificationRealtimeService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
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

  // --- Bandeja IN-APP (la campanita, ownership) ------------------------------

  @Get("inbox")
  listInbox(
    @CurrentUser() user: RequestUser,
    @Query(new ZodValidationPipe(inboxListQuerySchema)) q: InboxListQuery,
  ) {
    return this.notifications.listInbox(user.id, q);
  }

  @Get("inbox/unread-count")
  unreadCount(@CurrentUser() user: RequestUser) {
    return this.notifications.unreadInboxCount(user.id);
  }

  @Post("inbox/:id/read")
  markRead(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.notifications.markInboxRead(user.id, id);
  }

  @Post("inbox/read-all")
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllInboxRead(user.id);
  }

  /**
   * Stream SSE de la campanita (un canal por usuario). `EventSource` no puede mandar
   * el header Authorization, así que el access token viaja por `?access_token=` y se
   * verifica aquí (ruta @Public para saltar el guard global, auth confinada a este
   * endpoint). Empuja un nudge liviano `{ type:"inbox", unread }` al entregar una
   * notificación in-app + un `ping` periódico para mantener viva la conexión.
   */
  @Public()
  @Sse("inbox/stream")
  stream(@Query("access_token") token: string): Observable<MessageEvent> {
    return from(this.verifySseToken(token)).pipe(
      switchMap((userId) =>
        merge(
          // Sincroniza el contador al conectar.
          from(this.notifications.unreadInboxCount(userId)).pipe(
            map((c) => ({ data: { type: "inbox", unread: c.unread } }) as MessageEvent),
          ),
          this.realtime.streamFor(userId).pipe(map((n) => ({ data: n }) as MessageEvent)),
          interval(SSE_HEARTBEAT_MS).pipe(map(() => ({ type: "ping", data: String(Date.now()) }) as MessageEvent)),
        ),
      ),
    );
  }

  /** Verifica el access token del SSE (query param). Lanza si es inválido/expirado. */
  private async verifySseToken(token: string): Promise<string> {
    const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
      secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
    });
    return claims.sub;
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
