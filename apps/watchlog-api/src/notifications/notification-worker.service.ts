import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { SchedulesService } from "../schedules/schedules.service";
import { NotificationEmitterService } from "./notification-emitter.service";
import { NotificationResolverService } from "./notification-resolver.service";
import { NotificationChannel } from "./notification-channel";

/** Tope de reintentos de envío antes de marcar FAILED (backoff exponencial). */
const MAX_SEND_ATTEMPTS = 5;
/** Lote por tick (acota la carga; a escala se mueve a una cola dedicada — BACKLOG). */
const BATCH = 100;

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
    private readonly emitter: NotificationEmitterService,
    private readonly resolver: NotificationResolverService,
    private readonly channel: NotificationChannel,
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
                  channel: "EMAIL",
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
      for (const row of rows) {
        try {
          await this.channel.send({
            to: row.recipientEmail,
            subject: row.subject,
            bodyText: row.bodyText,
            bodyHtml: row.bodyHtml,
          });
          await this.prisma.notificationOutbox.update({
            where: { id: row.id },
            data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
          });
          await this.audit.record({
            action: "notification.email.sent",
            entityType: "NotificationOutbox",
            entityId: row.id,
            after: { to: row.recipientEmail, eventKey: row.eventKey },
          });
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
    } finally {
      this.busy.send = false;
    }
    return sent;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
