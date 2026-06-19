import type { AiProvider } from "@lyra/contracts";
import type { LlmProvider, ResolvedLlmConfig } from "./types.js";
import { NoneLlmProvider } from "./providers/none.js";
import { AnthropicLlmProvider } from "./providers/anthropic.js";
import { OpenAiCompatibleLlmProvider } from "./providers/openai-compatible.js";

/** Hosts que se consideran DENTRO de la planta (no hay egreso a internet). */
function isLocalHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".local")) return true;
  // Rangos privados RFC 1918 (on-prem típico).
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

/**
 * ¿La generación EGRESA de la planta? Decide si aplicar el scrubber de PII (AC-IA-7). `none`
 * nunca egresa; `anthropic` siempre es nube; `openai-compatible` egresa solo si su baseUrl NO
 * apunta a un host local/privado (Ollama/vLLM on-prem ⇒ no egresa ⇒ no se redacta).
 */
export function egressesPlant(cfg: { provider: AiProvider; baseUrl?: string }): boolean {
  if (cfg.provider === "none") return false;
  if (cfg.provider === "anthropic") return true;
  // openai-compatible: depende de dónde apunte.
  try {
    const url = new URL(cfg.baseUrl ?? "");
    return !isLocalHost(url.hostname);
  } catch {
    // baseUrl inválida/ausente: por seguridad, asumimos egreso (redactamos).
    return true;
  }
}

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
