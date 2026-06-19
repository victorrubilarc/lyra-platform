import Anthropic from "@anthropic-ai/sdk";
import type { CompleteInput, GenerateSummaryInput, LlmProvider, LlmResult } from "../types.js";
import { buildSummaryUserPrompt, SUMMARY_SYSTEM_PROMPT } from "../prompt.js";

/**
 * Proveedor Anthropic (nube). SDK oficial `@anthropic-ai/sdk`. El resumen de turno se
 * genera GROUNDED (AC-IA-2): solo el bloque DATOS del snapshot congelado, sin tools, sin
 * BD, sin búsqueda. No-streaming en Slice 2 (el brief es corto; el streaming se difiere a
 * Slice 3). Sin `thinking` ni `effort` configurados: así funciona en cualquier modelo que
 * el admin elija (opus/sonnet/haiku) sin riesgo de 400 por parámetros no soportados.
 *
 * AC-IA-6 (on-prem / sin fuga): este proveedor SÍ envía el contenido del resumen a la API
 * de Anthropic. El cliente que necesite que los datos no salgan de la planta usa el
 * proveedor `openai-compatible` contra un endpoint local (Ollama/vLLM).
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly id = "anthropic" as const;
  readonly model: string;
  private readonly client: Anthropic;

  constructor(cfg: { model: string; apiKey: string }) {
    this.model = cfg.model;
    this.client = new Anthropic({ apiKey: cfg.apiKey });
  }

  async generateSummary(input: GenerateSummaryInput): Promise<LlmResult> {
    return this.run(SUMMARY_SYSTEM_PROMPT, buildSummaryUserPrompt(input.grounding), 700);
  }

  async complete(input: CompleteInput): Promise<LlmResult> {
    return this.run(input.system ?? "Eres un asistente conciso.", input.prompt, input.maxTokens ?? 128);
  }

  private async run(system: string, user: string, maxTokens: number): Promise<LlmResult> {
    const start = Date.now();
    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }],
    });
    const text = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return {
      text,
      provider: this.id,
      model: this.model,
      inputTokens: resp.usage?.input_tokens ?? null,
      outputTokens: resp.usage?.output_tokens ?? null,
      latencyMs: Date.now() - start,
    };
  }
}
