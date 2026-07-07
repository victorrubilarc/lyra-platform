import { Module, type ExecutionContext } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { ThrottlerModule, seconds } from "@nestjs/throttler";
import { WatchlogThrottlerGuard } from "./throttler.guard";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import Redis from "ioredis";
import type { FastifyRequest } from "fastify";
import type { Env } from "../config/env.schema";

/**
 * Rate limiting GLOBAL de la API (H1 "planta restrictiva ready", 2026-07-07 —
 * hallazgo pre-pentest: solo existían lockouts de login/MFA/setup y el throttle
 * casero de password-reset; cualquier otro endpoint admitía fuerza de volumen).
 *
 * Diseño (DECISIONS 2026-07-07 (b)):
 * - Un throttler `default` GENEROSO para toda la API (no estorba a un operador
 *   real) + throttlers ESTRICTOS que solo aplican a su ruta vía `skipIf`
 *   (clasificación por ruta, no por decorador: los límites vienen del env y los
 *   decoradores se evalúan antes de que ConfigModule cargue el .env).
 * - `auth` (NIST 800-63B §5.2.2: throttling por IP además del lockout por
 *   cuenta) · `public` (branding/setup pre-auth) · `upload` (adjuntos).
 * - Contadores en REDIS (correcto multi-instancia); sin REDIS_URL cae al
 *   storage en memoria del paquete (instancia única / tests).
 * - El tracker es la IP real: requiere `trustProxy` en Fastify (main.ts) para
 *   ver el X-Forwarded-For del borde — sin eso toda la planta contaría como
 *   una sola IP.
 * - Salud y SSE quedan EXENTOS con @SkipThrottle en sus controllers: el
 *   healthcheck de Docker/update.sh sondea cada 2 s (un 429 dispararía
 *   rollbacks falsos) y las conexiones SSE son largas — tras un reinicio toda
 *   la planta reconecta en ráfaga y se comería el presupuesto de requests.
 * - El guard emite `Retry-After` en el 429 (v6 lo trae de serie).
 */

/** Ruta sin query string (Fastify entrega `req.url` crudo), con prefijo /api. */
function routeOf(context: ExecutionContext): string {
  const req = context.switchToHttp().getRequest<FastifyRequest>();
  const url = req.url ?? "";
  const q = url.indexOf("?");
  return q === -1 ? url : url.slice(0, q);
}

function methodOf(context: ExecutionContext): string {
  return context.switchToHttp().getRequest<FastifyRequest>().method ?? "GET";
}

const isAuthRoute = (ctx: ExecutionContext): boolean => routeOf(ctx).startsWith("/api/auth/");

const isPublicRoute = (ctx: ExecutionContext): boolean => {
  const route = routeOf(ctx);
  return route === "/api/branding" || route.startsWith("/api/branding/") || route.startsWith("/api/setup/");
};

const isUploadRoute = (ctx: ExecutionContext): boolean =>
  methodOf(ctx) === "POST" && /^\/api\/log-entries\/[^/]+\/attachments\//.test(routeOf(ctx));

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        const redisUrl = config.get("REDIS_URL", { infer: true });
        // Conexión propia (no la del CacheService): aisla los contadores del
        // resto del caché y evita exponer el cliente crudo.
        const storage = redisUrl
          ? new ThrottlerStorageRedisService(new Redis(redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2 }))
          : undefined;
        return {
          throttlers: [
            {
              name: "default",
              limit: config.get("THROTTLE_DEFAULT_LIMIT", { infer: true }),
              ttl: seconds(config.get("THROTTLE_DEFAULT_TTL_S", { infer: true })),
            },
            {
              name: "auth",
              limit: config.get("THROTTLE_AUTH_LIMIT", { infer: true }),
              ttl: seconds(config.get("THROTTLE_AUTH_TTL_S", { infer: true })),
              skipIf: (ctx) => !isAuthRoute(ctx),
            },
            {
              name: "public",
              limit: config.get("THROTTLE_PUBLIC_LIMIT", { infer: true }),
              ttl: seconds(config.get("THROTTLE_PUBLIC_TTL_S", { infer: true })),
              skipIf: (ctx) => !isPublicRoute(ctx),
            },
            {
              name: "upload",
              limit: config.get("THROTTLE_UPLOAD_LIMIT", { infer: true }),
              ttl: seconds(config.get("THROTTLE_UPLOAD_TTL_S", { infer: true })),
              skipIf: (ctx) => !isUploadRoute(ctx),
            },
          ],
          ...(storage ? { storage } : {}),
          errorMessage: "Demasiadas solicitudes. Intenta nuevamente en unos segundos.",
        };
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: WatchlogThrottlerGuard }],
})
export class ThrottlingModule {}
