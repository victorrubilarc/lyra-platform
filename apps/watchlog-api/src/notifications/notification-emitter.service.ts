import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { isNotificationEventKey } from "@lyra/contracts";
import { PrismaService } from "../prisma/prisma.service";

/** Cliente Prisma o cliente de transacción (para emitir DENTRO de la tx del dominio). */
export type PrismaLike = PrismaService | Prisma.TransactionClient;

/**
 * Emisor de eventos de notificación — ETAPA 1 del transactional outbox. Es
 * DELGADO a propósito (solo Prisma): inserta un evento MÍNIMO (ids en `payload`)
 * en la MISMA transacción que el cambio de dominio que lo dispara, de modo que un
 * crash entre el commit y el envío no pierda el aviso. La resolución de
 * destinatarios y el render (pesados) ocurren después, en el dispatcher (etapa 2).
 *
 * Vive en su propio módulo @Global para que el dominio (LogEntries, sweeper) lo
 * inyecte SIN importar el módulo pesado de notificaciones (evita ciclos de DI).
 */
@Injectable()
export class NotificationEmitterService {
  private readonly logger = new Logger(NotificationEmitterService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Encola un evento. `dedupeKey` (eventos DERIVED: ronda vencida, SLA) garantiza
   * UN evento por entidad aunque el sweeper la re-descubra cada tick (índice único;
   * el conflicto se ignora). Los eventos tx-driven pasan `dedupeKey` nulo (cada
   * disparo es legítimo). `client` permite emitir dentro de una transacción abierta.
   */
  async emit(
    eventKey: string,
    payload: Prisma.InputJsonValue,
    opts?: { dedupeKey?: string | null; client?: PrismaLike },
  ): Promise<void> {
    if (!isNotificationEventKey(eventKey)) {
      this.logger.warn(`Evento de notificación desconocido, ignorado: ${eventKey}`);
      return;
    }
    const client = opts?.client ?? this.prisma;
    const dedupeKey = opts?.dedupeKey ?? null;
    try {
      if (dedupeKey) {
        // Idempotente: si ya existe el evento para esa entidad, no se duplica.
        await client.notificationEvent.upsert({
          where: { dedupeKey },
          create: { eventKey, payload, dedupeKey },
          update: {},
        });
      } else {
        await client.notificationEvent.create({ data: { eventKey, payload } });
      }
    } catch (err) {
      // Nunca romper el flujo de dominio por un fallo al encolar un aviso.
      this.logger.error(
        `No se pudo encolar el evento "${eventKey}"`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
