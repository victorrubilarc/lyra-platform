import { Global, Module } from "@nestjs/common";
import { AiConfigService } from "./ai-config.service";
import { AiService } from "./ai.service";
import { AiController } from "./ai.controller";

/**
 * Inteligencia Artificial administrable (Fase 5 · Slice 2). Expone `AiConfigService` (config
 * de IA en BD, cifrada/write-only, editable sin reiniciar) y `AiService` (gateway: resuelve el
 * proveedor desde `@lyra/llm`, ejecuta, registra costo y degrada a determinista). Global para
 * que el cambio de turno (y futuros consumidores: insights/RAG de Fase 6) lo inyecten sin
 * re-importar. La pantalla (`/settings/ai`) la sirve `AiController` (permiso `ai:config`).
 */
@Global()
@Module({
  controllers: [AiController],
  providers: [AiConfigService, AiService],
  exports: [AiConfigService, AiService],
})
export class AiModule {}
