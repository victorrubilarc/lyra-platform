import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ruleActionKind, type CrossRule, type RuleAction } from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ExceptionGeneratorService } from "../exceptions/exception-generator.service";
import { IncidentsService } from "../incidents/incidents.service";

/** Tope de reintentos antes de marcar FAILED. */
const MAX_ATTEMPTS = 5;
/** Lote por tick (acota la carga). */
const BATCH = 100;

/**
 * Worker de ACCIONES del motor de reglas (Fase 4.1.2) — ETAPA 2 del outbox
 * dedicado. Toma las órdenes PENDING que el sello encoló (etapa 1) y MATERIALIZA
 * la reacción DIFERIDA, fuera del camino crítico del sello:
 *   - `raiseException` → crea la `LogEntryException` (triggerKind=RULE) para triage.
 *   - `openIncident`   → además abre la incidencia (originType=RULE) y enlaza la
 *                        excepción (CONVERTED): proveniencia uniforme.
 *
 * IDEMPOTENTE: la excepción se crea por `dedupeKey rule:{entryId}:{ruleKey}` (no
 * duplica) y la incidencia solo se abre si la excepción aún no está ligada. La
 * autoría es el actor que SELLÓ (capturado al encolar): su ABAC ya cubre el nodo
 * (selló ahí) y la regla es server-authoritative (congelada en la versión que usó).
 *
 * Mismo patrón sweeper/cerrojo del worker de notificaciones (Bloque N). `runOnce()`
 * lo expone para ops/smoke (`POST /rule-actions/run`).
 */
@Injectable()
export class RuleActionWorkerService {
  private readonly logger = new Logger(RuleActionWorkerService.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly exceptionGenerator: ExceptionGeneratorService,
    private readonly incidents: IncidentsService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processCron(): Promise<void> {
    await this.processPending();
  }

  /** Procesa el lote pendiente (para el smoke y el endpoint de operación). */
  async runOnce(): Promise<{ processed: number }> {
    return { processed: await this.processPending() };
  }

  async processPending(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    let processed = 0;
    try {
      const orders = await this.prisma.ruleActionOutbox.findMany({
        where: { status: "PENDING" },
        orderBy: { createdAt: "asc" },
        take: BATCH,
      });
      for (const order of orders) {
        try {
          await this.execute(order);
          await this.prisma.ruleActionOutbox.update({
            where: { id: order.id },
            data: { status: "DONE", attempts: { increment: 1 }, processedAt: new Date(), lastError: null },
          });
          processed++;
        } catch (err) {
          const attempts = order.attempts + 1;
          const failed = attempts >= MAX_ATTEMPTS;
          await this.prisma.ruleActionOutbox.update({
            where: { id: order.id },
            data: { status: failed ? "FAILED" : "PENDING", attempts: { increment: 1 }, lastError: errMsg(err) },
          });
          this.logger.error(
            `Fallo al ejecutar la acción de regla ${order.dedupeKey} (intento ${attempts})`,
            err instanceof Error ? err.stack : String(err),
          );
        }
      }
    } finally {
      this.busy = false;
    }
    return processed;
  }

  /** Materializa UNA orden (idempotente). Lanza si falla para reintento/backoff. */
  private async execute(order: {
    id: string;
    logEntryId: string;
    ruleKey: string;
    payload: unknown;
    actorId: string | null;
  }): Promise<void> {
    const entry = await this.prisma.logEntry.findUnique({
      where: { id: order.logEntryId },
      select: {
        id: true,
        templateId: true,
        templateVersionId: true,
        orgNodeId: true,
        equipmentId: true,
        shiftCode: true,
        createdById: true,
        sealedAt: true,
        status: true,
      },
    });
    // La entrada desapareció / se anuló: nada que materializar (no es un error).
    if (!entry || entry.status === "VOID") return;

    const rule = await this.loadRule(entry.templateVersionId, order.ruleKey);
    // La regla ya no existe en la versión (no debería: la versión es inmutable) o
    // perdió su acción: nada que hacer, se cierra la orden.
    if (!rule || ruleActionKind(rule) === "none") return;
    const action = rule.action as RuleAction;

    const ctx: AuditContext = { actorId: order.actorId ?? null, actorEmail: null };
    const triggeredValues = ((order.payload as { triggeredValues?: unknown })?.triggeredValues ?? null) as never;

    // 1) Excepción RULE (idempotente por dedupeKey).
    const { id: exceptionId, created } = await this.exceptionGenerator.createRuleException(
      this.prisma,
      {
        id: entry.id,
        templateId: entry.templateId,
        templateVersionId: entry.templateVersionId,
        orgNodeId: entry.orgNodeId,
        equipmentId: entry.equipmentId,
        shiftCode: entry.shiftCode,
        operatorId: entry.createdById,
        sealedAt: entry.sealedAt,
      },
      { key: rule.key, name: rule.name, message: rule.message, severity: rule.severity },
      triggeredValues,
      order.actorId,
    );
    if (created) {
      await this.audit.record({
        ...ctx,
        action: "exception.rule.raised",
        entityType: "LogEntryException",
        entityId: exceptionId,
        after: { ruleKey: rule.key, logEntryId: entry.id, action: action.kind },
      });
    }

    if (action.kind !== "openIncident") return;

    // 2) Abrir incidencia (solo si la excepción aún no está ligada — idempotencia).
    const exc = await this.prisma.logEntryException.findUnique({
      where: { id: exceptionId },
      select: { incidentId: true, status: true },
    });
    if (exc?.incidentId) return; // ya convertida en una corrida previa

    if (!order.actorId) throw new Error("Sin actor para abrir la incidencia de la regla");
    const detail = await this.incidents.create(
      order.actorId,
      {
        title: rule.name?.trim() || rule.message.slice(0, 200),
        description: rule.message,
        typeId: action.incidentTypeId,
        categoryId: action.incidentCategoryId ?? null,
        severity: action.severity,
        orgNodeId: entry.orgNodeId,
        equipmentId: entry.equipmentId ?? null,
        originLogEntryId: entry.id,
      },
      ctx,
    );
    // Origen REAL = REGLA (la afina sobre el LOG_ENTRY que puso `create` por traer
    // originLogEntryId; conserva el enlace a la entrada para la trazabilidad).
    await this.prisma.$transaction(async (tx) => {
      await tx.incident.update({ where: { id: detail.id }, data: { originType: "RULE" } });
      await tx.incidentExceptionLink.upsert({
        where: { exceptionId },
        create: { incidentId: detail.id, exceptionId, linkedById: order.actorId },
        update: { incidentId: detail.id, linkedById: order.actorId },
      });
      await tx.logEntryException.update({
        where: { id: exceptionId },
        data: { status: "CONVERTED", incidentId: detail.id, triagedById: order.actorId, triagedAt: new Date() },
      });
      await tx.incidentActivity.create({
        data: {
          incidentId: detail.id,
          kind: "FIELD_CHANGED",
          summary: `Incidencia abierta automáticamente por la regla "${rule.name?.trim() || rule.key}"`,
          actorId: order.actorId,
          metadata: { ruleKey: rule.key, exceptionId },
        },
      });
    });
    await this.audit.record({
      ...ctx,
      action: "incident.rule.opened",
      entityType: "Incident",
      entityId: detail.id,
      after: { ruleKey: rule.key, exceptionId, logEntryId: entry.id },
    });
  }

  /** Lee la regla por clave de la versión CONGELADA (autoritativa). */
  private async loadRule(templateVersionId: string | null, ruleKey: string): Promise<CrossRule | null> {
    if (!templateVersionId) return null;
    const version = await this.prisma.templateVersion.findUnique({
      where: { id: templateVersionId },
      select: { rules: true },
    });
    const rules = (version?.rules as CrossRule[] | null) ?? [];
    return rules.find((r) => r.key === ruleKey) ?? null;
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
