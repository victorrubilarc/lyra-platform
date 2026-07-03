import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { EmailConfigService } from "../email/email-config.service";
import { SchedulesService } from "../schedules/schedules.service";
import { IncidentSlaService } from "../incidents/incident-sla.service";
import { WorkOrderSlaService } from "../work-orders/work-order-sla.service";
import { WorkerComplianceService } from "../work-orders/worker-compliance.service";
import { NotificationEmitterService } from "./notification-emitter.service";
import { NotificationResolverService } from "./notification-resolver.service";
import { NotificationChannelRegistry } from "./notification-channel";
import { NotificationRealtimeService } from "./notification-realtime.service";

/** Tope de reintentos de envío antes de marcar FAILED (backoff exponencial). */
const MAX_SEND_ATTEMPTS = 5;
/** Lote por tick (acota la carga; a escala se mueve a una cola dedicada — BACKLOG). */
const BATCH = 100;
/** Retención de notificaciones in-app LEÍDAS (la purga diaria borra las más viejas). */
const INAPP_READ_RETENTION_DAYS = 90;

/**
 * Worker del motor de notificaciones — los tres ticks del transactional outbox:
 *
 *  1. **sweeper** (eventos DERIVED): GENERA primero las ocurrencias de rondas
 *     (lazy ⇒ sin esto las vencidas que nadie abrió no existen como filas) y luego
 *     descubre rondas vencidas + entradas con SLA incumplido → encola eventos.
 *  2. **dispatcher** (etapa 2): toma eventos PENDING, resuelve destinatarios +
 *     renderiza, e inserta filas de bandeja (PENDING). Marca el evento DISPATCHED.
 *  3. **sender**: toma filas de bandeja PENDING vencidas, las entrega por el canal
 *     y marca SENT / FAILED+backoff. Audita cada envío.
 *
 * Cada job se protege con un cerrojo en memoria (no se solapa consigo mismo). Los
 * métodos internos son re-entrantes y los expone `runOnce()` para el smoke/ops.
 */
@Injectable()
export class NotificationWorkerService {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private busy = { sweep: false, dispatch: false, send: false };

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly schedules: SchedulesService,
    private readonly incidentSla: IncidentSlaService,
    private readonly workOrderSla: WorkOrderSlaService,
    private readonly workerCompliance: WorkerComplianceService,
    private readonly emitter: NotificationEmitterService,
    private readonly resolver: NotificationResolverService,
    private readonly channels: NotificationChannelRegistry,
    private readonly realtime: NotificationRealtimeService,
    private readonly emailConfig: EmailConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async sweepCron(): Promise<void> {
    await this.sweep();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async dispatchCron(): Promise<void> {
    await this.dispatchPending();
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async sendCron(): Promise<void> {
    await this.sendPending();
  }

  /** Corre las tres etapas en orden (para el smoke y un endpoint de operación). */
  async runOnce(): Promise<{ swept: number; dispatched: number; sent: number }> {
    const swept = await this.sweep();
    const dispatched = await this.dispatchPending();
    const sent = await this.sendPending();
    return { swept, dispatched, sent };
  }

  // --- 1. Sweeper de eventos DERIVED -----------------------------------------

  async sweep(): Promise<number> {
    if (this.busy.sweep) return 0;
    this.busy.sweep = true;
    let emitted = 0;
    try {
      // (corrección #2) GENERAR antes de escanear: las ocurrencias son lazy.
      await this.schedules.generateAllActive();

      const overdueIds = await this.schedules.findOverdueOccurrenceIds();
      for (const id of overdueIds) {
        await this.emitter.emit("round.overdue", { occurrenceId: id }, { dedupeKey: `round.overdue|${id}` });
        emitted++;
      }

      const breaches = await this.findSlaBreaches();
      for (const b of breaches) {
        const sinceIso = b.currentStateSince.toISOString();
        await this.emitter.emit(
          "entry.sla.breached",
          { entryId: b.id, stateKey: b.currentStateKey, currentStateSince: sinceIso },
          { dedupeKey: `entry.sla.breached|${b.id}|${sinceIso}` },
        );
        emitted++;
      }

      // Incidencias (Fase 4.4): permanencia de estado / plazo de resolución / acción
      // CAPA vencida / reporte por vencer. La DETECCIÓN vive en el dominio
      // (IncidentSlaService); aquí solo se encola cada orden por el motor del Bloque N.
      const incidentBreaches = await this.incidentSla.findBreaches(BATCH);
      for (const ib of incidentBreaches) {
        await this.emitter.emit(ib.eventKey, ib.payload, { dedupeKey: ib.dedupeKey });
        emitted++;
      }

      // Órdenes de trabajo (OT S6): plazo de resolución vencido / permanencia de estado
      // excedida / actividad del plan vencida. Misma mecánica: la DETECCIÓN vive en el
      // dominio (WorkOrderSlaService); aquí sólo se encola cada orden por el Bloque N.
      const workOrderBreaches = await this.workOrderSla.findBreaches(BATCH);
      for (const wb of workOrderBreaches) {
        await this.emitter.emit(wb.eventKey, wb.payload, { dedupeKey: wb.dedupeKey });
        emitted++;
      }

      // Dotación (S2): competencias/certificaciones por vencer o vencidas de personas en
      // un roster de OT abierta. Detección en el dominio (WorkerComplianceService).
      const workerBreaches = await this.workerCompliance.findBreaches(BATCH);
      for (const cb of workerBreaches) {
        await this.emitter.emit(cb.eventKey, cb.payload, { dedupeKey: cb.dedupeKey });
        emitted++;
      }
    } catch (err) {
      this.logger.error("Fallo en el barrido de eventos", err instanceof Error ? err.stack : String(err));
    } finally {
      this.busy.sweep = false;
    }
    return emitted;
  }

  /**
   * Entradas con SLA de permanencia incumplido (now − currentStateSince >
   * maxStayMinutes del estado actual de la versión CONGELADA). Espejo de
   * `LogbookQueryService.delayedEntryIds`, system-wide, con los datos para dedup.
   */
  private async findSlaBreaches(): Promise<Array<{ id: string; currentStateKey: string; currentStateSince: Date }>> {
    return this.prisma.$queryRaw<Array<{ id: string; currentStateKey: string; currentStateSince: Date }>>`
      SELECT le."id", le."currentStateKey", le."currentStateSince"
      FROM "LogEntry" le
      JOIN "WorkflowState" ws
        ON ws."workflowDefinitionVersionId" = le."workflowDefinitionVersionId"
       AND ws."key" = le."currentStateKey"
      WHERE le."status" = 'DRAFT'
        AND le."deletedAt" IS NULL
        AND le."currentStateSince" IS NOT NULL
        AND ws."maxStayMinutes" IS NOT NULL
        AND le."currentStateSince" + (ws."maxStayMinutes" * interval '1 minute') < now()
      LIMIT ${BATCH}`;
  }

  // --- 2. Dispatcher (evento → filas de bandeja) -----------------------------

  async dispatchPending(): Promise<number> {
    if (this.busy.dispatch) return 0;
    this.busy.dispatch = true;
    let dispatched = 0;
    try {
      const events = await this.prisma.notificationEvent.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: BATCH,
      });
      for (const event of events) {
        try {
          const messages = await this.resolver.resolve(event);
          for (const m of messages) {
            try {
              await this.prisma.notificationOutbox.create({
                data: {
                  eventId: event.id,
                  eventKey: event.eventKey,
                  channel: m.channel,
                  recipientUserId: m.recipientUserId,
                  recipientEmail: m.recipientEmail,
                  subject: m.subject,
                  bodyText: m.bodyText,
                  bodyHtml: m.bodyHtml,
                  status: "PENDING",
                  dedupeKey: m.dedupeKey,
                  relatedEntityType: m.relatedEntityType,
                  relatedEntityId: m.relatedEntityId,
                },
              });
            } catch (err) {
              // Choque del índice único de dedupeKey ⇒ ya estaba encolado: se ignora.
              if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
            }
          }
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: { status: "DISPATCHED", dispatchedAt: new Date() },
          });
          dispatched++;
        } catch (err) {
          await this.prisma.notificationEvent.update({
            where: { id: event.id },
            data: { status: "FAILED", attempts: { increment: 1 }, lastError: errMsg(err) },
          });
          this.logger.error(`No se pudo despachar el evento ${event.id}`, err instanceof Error ? err.stack : String(err));
        }
      }
    } finally {
      this.busy.dispatch = false;
    }
    return dispatched;
  }

  // --- 3. Sender (bandeja → canal) -------------------------------------------

  async sendPending(): Promise<number> {
    if (this.busy.send) return 0;
    this.busy.send = true;
    let sent = 0;
    try {
      const now = new Date();
      const rows = await this.prisma.notificationOutbox.findMany({
        where: { status: "PENDING", OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] },
        orderBy: { createdAt: "asc" },
        take: BATCH,
      });
      // Correo DESACTIVADO: las filas de CORREO no se intentan; se marcan SUPPRESSED
      // (quedan visibles, sin reintentos infinitos). Las IN-APP no dependen del SMTP.
      const emailEnabled = await this.emailConfig.isEnabled();
      const emailRows = rows.filter((r) => r.channel === "EMAIL");
      if (!emailEnabled && emailRows.length > 0) {
        await this.prisma.notificationOutbox.updateMany({
          where: { id: { in: emailRows.map((r) => r.id) } },
          data: { status: "SUPPRESSED", lastError: "Correo saliente desactivado" },
        });
      }
      // Usuarios con entrega in-app este tick → un nudge por usuario al final.
      const nudgeUserIds = new Set<string>();
      for (const row of rows) {
        if (row.channel === "EMAIL" && !emailEnabled) continue; // ya marcada SUPPRESSED
        const channel = this.channels.get(row.channel);
        if (!channel) {
          this.logger.warn(`Sin canal registrado para ${row.channel} (fila ${row.id})`);
          continue;
        }
        try {
          await channel.send({
            to: row.recipientEmail,
            subject: row.subject,
            bodyText: row.bodyText,
            bodyHtml: row.bodyHtml,
          });
          await this.prisma.notificationOutbox.update({
            where: { id: row.id },
            data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
          });
          // El correo se audita (envío externo); la in-app no (la fila es el registro).
          if (row.channel === "EMAIL") {
            await this.audit.record({
              action: "notification.email.sent",
              entityType: "NotificationOutbox",
              entityId: row.id,
              after: { to: row.recipientEmail, eventKey: row.eventKey },
            });
          } else if (row.recipientUserId) {
            nudgeUserIds.add(row.recipientUserId);
          }
          sent++;
        } catch (err) {
          const attempts = row.attempts + 1;
          const failed = attempts >= MAX_SEND_ATTEMPTS;
          await this.prisma.notificationOutbox.update({
            where: { id: row.id },
            data: {
              status: failed ? "FAILED" : "PENDING",
              attempts: { increment: 1 },
              lastError: errMsg(err),
              // Backoff exponencial acotado (1, 2, 4, 8 min…).
              nextAttemptAt: failed ? null : new Date(Date.now() + Math.min(2 ** attempts, 30) * 60_000),
            },
          });
          this.logger.warn(`Fallo al enviar ${row.id} (intento ${attempts}): ${errMsg(err)}`);
        }
      }
      // Empuja un nudge en tiempo real (SSE) a cada usuario con entrega in-app, con su
      // contador de no leídas fresco. La campanita reacciona al instante (fallback: poll).
      for (const uid of nudgeUserIds) {
        const unread = await this.unreadCountFor(uid);
        this.realtime.notify(uid, { type: "inbox", unread });
      }
    } finally {
      this.busy.send = false;
    }
    return sent;
  }

  /** No leídas in-app de un usuario (apoya el badge del nudge y el endpoint del inbox). */
  private async unreadCountFor(userId: string): Promise<number> {
    return this.prisma.notificationOutbox.count({
      where: { recipientUserId: userId, channel: "INAPP", readAt: null },
    });
  }

  // --- 4. Purga de in-app LEÍDAS antiguas ------------------------------------

  /** Borra notificaciones in-app LEÍDAS con más de `INAPP_READ_RETENTION_DAYS` días. */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeReadInApp(): Promise<number> {
    const cutoff = new Date(Date.now() - INAPP_READ_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    try {
      const { count } = await this.prisma.notificationOutbox.deleteMany({
        where: { channel: "INAPP", readAt: { not: null, lt: cutoff } },
      });
      if (count > 0) this.logger.log(`Purgadas ${count} notificaciones in-app leídas (> ${INAPP_READ_RETENTION_DAYS} días)`);
      return count;
    } catch (err) {
      this.logger.error("Fallo en la purga de notificaciones in-app", err instanceof Error ? err.stack : String(err));
      return 0;
    }
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
