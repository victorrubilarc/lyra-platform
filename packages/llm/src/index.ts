/**
 * @lyra/llm — abstracción de Inteligencia Artificial del ecosistema Lyra (Fase 5 · Slice 2).
 *
 * Interfaz `LlmProvider` (token DI, patrón EmailService) + adapters: `none` (determinista/
 * offline), `anthropic` (SDK oficial) y `openai-compatible` (Ollama/vLLM/OpenAI/DeepSeek por
 * baseURL). Reutilizable por el resumen de turno (hoy) y por insights/RAG (Fase 6, que le
 * agregará un recuperador encima sin reescribir esta capa). Grounding por construcción: el
 * resumen se genera SOLO con la data que el dominio le pasa explícita, sin tools/BD/internet.
 */
export * from "./types.js";
export * from "./prompt.js";
export * from "./factory.js";
export * from "./scrub.js";
export { CollectingLlmStream } from "./stream.js";
export { NoneLlmProvider } from "./providers/none.js";
export { AnthropicLlmProvider } from "./providers/anthropic.js";
export { OpenAiCompatibleLlmProvider } from "./providers/openai-compatible.js";
