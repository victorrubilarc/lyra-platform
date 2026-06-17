import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

/** Cliente Prisma o de transacción (para emitir DENTRO de la tx del sello). */
export type PrismaLike = PrismaService | Prisma.TransactionClient;

/** Datos mínimos de una orden de acción de regla. */
export interface RuleActionOrder {
  entryId: string;
  ruleKey: string;
  /** Versión congelada donde vive la regla (TemplateVersion.rules). */
  ruleVersionId: string | null;
  /** Snapshot de los valores que dispararon la regla (contexto GxP). */
  payload: Prisma.InputJsonValue;
  /** Quién selló (actor que origina la reacción; para ABAC + auditoría del worker). */
  actorId: string | null;
}

/**
 * Emisor de ACCIONES de regla (Fase 4.1.2) — ETAPA 1 del transactional outbox
 * DEDICADO. Es delgado a propósito (solo Prisma): inserta la orden en la MISMA
 * transacción que el SELLO que la dispara, de modo que un crash entre el commit y
 * la ejecución no pierda la acción. La materialización (crear la excepción RULE /
 * abrir la incidencia) ocurre después, en el worker (etapa 2), DESACOPLADA del
 * camino crítico: una automatización no puede bloquear ni revertir el sello.
 *
 * @Global y mínimo para que LogEntriesService lo inyecte sin importar el módulo
 * pesado (que depende de Incidencias) — mismo patrón que NotificationEmitterModule.
 */
@Injectable()
export class RuleActionEmitterService {
  private readonly logger = new Logger(RuleActionEmitterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Encola una orden. `dedupeKey = rule:{entryId}:{ruleKey}` garantiza UNA
   * materialización por (entrada, regla) aunque se re-encole al re-sellar (índice
   * único; el conflicto se ignora vía upsert). `client` permite emitir dentro de
   * la tx abierta del sello.
   */
  async emit(order: RuleActionOrder, client: PrismaLike): Promise<void> {
    const dedupeKey = `rule:${order.entryId}:${order.ruleKey}`;
    try {
      await client.ruleActionOutbox.upsert({
        where: { dedupeKey },
        create: {
          logEntryId: order.entryId,
          ruleKey: order.ruleKey,
          ruleVersionId: order.ruleVersionId,
          payload: order.payload,
          dedupeKey,
          actorId: order.actorId,
        },
        update: {},
      });
    } catch (err) {
      // Nunca romper el sello por un fallo al encolar la orden.
      this.logger.error(
        `No se pudo encolar la acción de regla ${dedupeKey}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
