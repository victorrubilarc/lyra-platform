import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import type { Env } from "../config/env.schema";

/**
 * Caché clave-valor con TTL. Usa Redis si `REDIS_URL` está configurada
 * (compartida entre instancias e invalidable); si no, cae a un Map en memoria
 * (suficiente para una instancia única on-premise o para tests).
 *
 * Se usa para: permisos efectivos por usuario y contadores de rate-limit.
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private redis: Redis | null = null;
  private readonly memory = new Map<string, { value: string; expiresAt: number }>();

  constructor(private readonly config: ConfigService<Env, true>) {}

  onModuleInit(): void {
    const url = this.config.get("REDIS_URL", { infer: true });
    if (url) {
      this.redis = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2 });
      this.redis.on("error", (err: Error) => this.logger.warn(`Redis: ${err.message}`));
    } else {
      this.logger.log("REDIS_URL ausente: caché en memoria (instancia única).");
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) await this.redis.quit();
  }

  async get(key: string): Promise<string | null> {
    if (this.redis) return this.redis.get(key);
    const hit = this.memory.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) {
      this.memory.delete(key);
      return null;
    }
    return hit.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    if (this.redis) {
      await this.redis.set(key, value, "EX", ttlSeconds);
      return;
    }
    this.memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async del(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
      return;
    }
    this.memory.delete(key);
  }
}
