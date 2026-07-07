import { Injectable, type ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, type ThrottlerLimitDetail } from "@nestjs/throttler";
import type { FastifyReply } from "fastify";

/**
 * ThrottlerGuard con `Retry-After` ESTÁNDAR: el guard de @nestjs/throttler v6
 * sufija el header con el nombre del throttler (`Retry-After-auth`, …) para los
 * no-default — no estándar (RFC 6585 / clientes y proxies esperan `Retry-After`
 * a secas). Aquí se fija SIEMPRE el header plano antes de lanzar el 429; el
 * sufijado del paquete puede acompañar, este es el contractual.
 */
@Injectable()
export class WatchlogThrottlerGuard extends ThrottlerGuard {
  protected override async throwThrottlingException(
    context: ExecutionContext,
    throttlerLimitDetail: ThrottlerLimitDetail,
  ): Promise<void> {
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    reply.header("Retry-After", String(Math.max(1, throttlerLimitDetail.timeToBlockExpire)));
    await super.throwThrottlingException(context, throttlerLimitDetail);
  }
}
