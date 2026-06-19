import type { LlmProvider, ResolvedLlmConfig } from "./types.js";
import { NoneLlmProvider } from "./providers/none.js";
import { AnthropicLlmProvider } from "./providers/anthropic.js";
import { OpenAiCompatibleLlmProvider } from "./providers/openai-compatible.js";

/**
 * Instancia el proveedor de IA a partir de la config RESUELTA. Patrón factory: cambiar de
 * proveedor (o agregar uno on-prem nuevo en Fase 6) = registrar un adapter aquí, sin tocar
 * a los consumidores. Cae a `none` ante un provider desconocido (defensa).
 */
export function createLlmProvider(cfg: ResolvedLlmConfig): LlmProvider {
  switch (cfg.provider) {
    case "anthropic":
      return new AnthropicLlmProvider({ model: cfg.model, apiKey: cfg.apiKey });
    case "openai-compatible":
      return new OpenAiCompatibleLlmProvider({
        model: cfg.model,
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
      });
    case "none":
    default:
      return new NoneLlmProvider();
  }
}
