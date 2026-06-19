import OpenAI from "openai";
import type { CompleteInput, GenerateSummaryInput, LlmProvider, LlmResult } from "../types.js";
import { buildSummaryUserPrompt, SUMMARY_SYSTEM_PROMPT } from "../prompt.js";

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
    return this.run(SUMMARY_SYSTEM_PROMPT, buildSummaryUserPrompt(input.grounding), 700);
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
