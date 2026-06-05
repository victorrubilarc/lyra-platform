import { Global, Module } from "@nestjs/common";
import { CacheService } from "./cache.service";

/** Caché (Redis o en memoria). Global para inyectarla en cualquier módulo. */
@Global()
@Module({
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
