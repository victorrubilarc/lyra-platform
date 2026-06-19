import type { CompleteInput, GenerateSummaryInput, LlmProvider, LlmResult } from "../types.js";

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
