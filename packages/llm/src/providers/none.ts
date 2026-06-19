import type { CompleteInput, GenerateSummaryInput, LlmProvider, LlmResult, LlmStream } from "../types.js";
import { CollectingLlmStream } from "../stream.js";

/**
 * Proveedor `none` — sin IA, determinista/offline. Es el modo del Slice 1 y la base de
 * la DEGRADACIÓN ELEGANTE (AC-IA-1/AC-IA-5): cuando no hay proveedor configurado o la IA
 * falla, el resumen cae aquí. No hace ninguna llamada de red. `generateSummary` devuelve
 * el resumen determinista ya calculado por el dominio (`fallbackText`).
 */
export class NoneLlmProvider implements LlmProvider {
  readonly id = "none" as const;
  readonly model = "deterministic";

  async generateSummary(input: GenerateSummaryInput): Promise<LlmResult> {
    return {
      text: input.fallbackText,
      provider: this.id,
      model: this.model,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
    };
  }

  /**
   * "Streaming" trivial: emite el resumen determinista en UN bloque (sin red, costo cero).
   * Sirve para que el cockpit ejercite la ruta de streaming aun sin IA configurada (AC-IA-1).
   */
  generateSummaryStream(input: GenerateSummaryInput): LlmStream {
    const id = this.id;
    const model = this.model;
    async function* gen(): AsyncGenerator<string> {
      yield input.fallbackText;
    }
    return new CollectingLlmStream(gen(), (text) => ({
      text,
      provider: id,
      model,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
    }));
  }

  async complete(_input: CompleteInput): Promise<LlmResult> {
    return {
      text: "Proveedor 'ninguno' (sin IA): no hay generación. El resumen de turno usa el modo determinista.",
      provider: this.id,
      model: this.model,
      inputTokens: null,
      outputTokens: null,
      latencyMs: 0,
    };
  }
}
