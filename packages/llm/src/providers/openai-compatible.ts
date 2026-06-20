import OpenAI from "openai";
import type { CompleteInput, GenerateSummaryInput, LlmProvider, LlmResult, LlmStream, StreamOptions } from "../types.js";
import { buildSummaryUserPrompt, SUMMARY_SYSTEM_PROMPT } from "../prompt.js";
import { CollectingLlmStream } from "../stream.js";

/** Tope de tokens del resumen de turno: el brief es corto; acota costo y latencia. */
const SUMMARY_MAX_TOKENS = 900;

/**
 * Proveedor OpenAI-compatible (por `baseURL`). Cubre Ollama / vLLM / LM Studio (local,
 * ON-PREM — los datos NO salen de la planta) y también OpenAI / DeepSeek (nube). Usa el
 * SDK `openai` apuntando al `baseURL` configurado. Mismo grounding estricto que Anthropic.
 *
 * Los endpoints locales suelen no exigir API key; se pasa un placeholder para no romper el
 * SDK. `max_tokens` acotado (gobernanza de costo / latencia).
 */
export class OpenAiCompatibleLlmProvider implements LlmProvider {
  readonly id = "openai-compatible" as const;
  readonly model: string;
  private readonly client: OpenAI;

  constructor(cfg: { model: string; apiKey: string; baseUrl: string }) {
    this.model = cfg.model;
    this.client = new OpenAI({
      apiKey: cfg.apiKey || "not-needed",
      baseURL: cfg.baseUrl,
    });
  }

  async generateSummary(input: GenerateSummaryInput): Promise<LlmResult> {
    return this.run(SUMMARY_SYSTEM_PROMPT, buildSummaryUserPrompt(input.grounding), SUMMARY_MAX_TOKENS);
  }

  /**
   * Resumen GROUNDED token a token (Slice 3). `chat.completions` con `stream:true` +
   * `stream_options.include_usage` para que el último chunk traiga los tokens (Ollama/vLLM lo
   * soportan; si el servidor no manda usage, queda en null y `AiGenerationLog` lo registra así).
   */
  generateSummaryStream(input: GenerateSummaryInput, opts?: StreamOptions): LlmStream {
    const client = this.client;
    const model = this.model;
    const id = this.id;
    const start = Date.now();
    let usageIn: number | null = null;
    let usageOut: number | null = null;

    async function* gen(): AsyncGenerator<string> {
      const stream = await client.chat.completions.create(
        {
          model,
          max_tokens: SUMMARY_MAX_TOKENS,
          stream: true,
          stream_options: { include_usage: true },
          messages: [
            { role: "system", content: SUMMARY_SYSTEM_PROMPT },
            { role: "user", content: buildSummaryUserPrompt(input.grounding) },
          ],
        },
        { signal: opts?.signal },
      );
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) yield delta;
        if (chunk.usage) {
          usageIn = chunk.usage.prompt_tokens ?? null;
          usageOut = chunk.usage.completion_tokens ?? null;
        }
      }
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
    const resp = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    const text = (resp.choices[0]?.message?.content ?? "").trim();
    return {
      text,
      provider: this.id,
      model: this.model,
      inputTokens: resp.usage?.prompt_tokens ?? null,
      outputTokens: resp.usage?.completion_tokens ?? null,
      latencyMs: Date.now() - start,
    };
  }
}
