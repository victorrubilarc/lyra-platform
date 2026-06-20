import Anthropic from "@anthropic-ai/sdk";
import type { CompleteInput, GenerateSummaryInput, LlmProvider, LlmResult, LlmStream, StreamOptions } from "../types.js";
import { buildSummaryUserPrompt, SUMMARY_SYSTEM_PROMPT } from "../prompt.js";
import { CollectingLlmStream } from "../stream.js";

/** Tope de tokens del resumen de turno: el brief es corto; acota costo y latencia. */
const SUMMARY_MAX_TOKENS = 900;

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
    return this.run(SUMMARY_SYSTEM_PROMPT, buildSummaryUserPrompt(input.grounding), SUMMARY_MAX_TOKENS);
  }

  /**
   * Resumen GROUNDED token a token (Slice 3). Usa `messages.stream()` y emite los `text_delta`;
   * al cerrar, `finalMessage().usage` aporta los tokens para `AiGenerationLog`. Sin `thinking`
   * ni sampling params: así funciona en cualquier modelo elegido por el admin sin riesgo de 400.
   */
  generateSummaryStream(input: GenerateSummaryInput, opts?: StreamOptions): LlmStream {
    const client = this.client;
    const model = this.model;
    const id = this.id;
    const start = Date.now();
    let usageIn: number | null = null;
    let usageOut: number | null = null;

    async function* gen(): AsyncGenerator<string> {
      const stream = client.messages.stream(
        {
          model,
          max_tokens: SUMMARY_MAX_TOKENS,
          system: SUMMARY_SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildSummaryUserPrompt(input.grounding) }],
        },
        { signal: opts?.signal },
      );
      for await (const event of stream) {
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      usageIn = final.usage?.input_tokens ?? null;
      usageOut = final.usage?.output_tokens ?? null;
    }

    return new CollectingLlmStream(gen(), (text) => ({
      text: text.trim(),
      provider: id,
      model,
      inputTokens: usageIn,
      outputTokens: usageOut,
      latencyMs: Date.now() - start,
    }));
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
