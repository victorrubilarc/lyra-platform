import { Injectable, Logger } from "@nestjs/common";
import type { AiCapability, AiProvider } from "@lyra/contracts";
import {
  createLlmProvider,
  egressesPlant,
  scrubGrounding,
  type GenerateSummaryInput,
  type LlmResult,
  type ResolvedLlmConfig,
} from "@lyra/llm";
import { PrismaService } from "../prisma/prisma.service";
import { AiConfigService } from "./ai-config.service";

/** Resultado del resumen para el dominio: el texto + de dónde salió (IA o determinista). */
export interface SummaryGenerationResult {
  text: string;
  /** true = lo generó un proveedor de IA; false = determinista (modo none o degradación). */
  generatedByAi: boolean;
  /** true = había IA configurada pero falló y cayó a determinista (AC-IA-5). */
  degraded: boolean;
  provider: AiProvider;
  model: string;
}

/**
 * Evento del resumen por IA en STREAMING (Slice 3). `delta` = trozo de texto en vivo; `done`
 * = cierre con el texto final + de dónde salió. En `degraded` el cockpit cae a la ruta
 * no-streaming (AC-IA-5). El gateway registra la generación en `AiGenerationLog` al cerrar.
 */
export type SummaryStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; text: string; provider: AiProvider; generatedByAi: boolean; degraded: boolean };

/**
 * Gateway de IA del backend. Resuelve el proveedor activo desde la config (`AiConfigService`
 * + factory de `@lyra/llm`), ejecuta la generación, REGISTRA cada llamada en `AiGenerationLog`
 * (gobernanza de costo) y aplica DEGRADACIÓN ELEGANTE: si el proveedor falla/timeout/sin
 * clave, cae al resumen determinista sin romper (AC-IA-5). La firma sigue siendo humana: este
 * gateway solo produce el TEXTO; nunca firma.
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly config: AiConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Genera el resumen de turno con el proveedor configurado, GROUNDED al snapshot. Si no hay
   * IA o falla, devuelve `input.fallbackText` (determinista) con `degraded`/`generatedByAi`.
   */
  async generateSummary(
    input: GenerateSummaryInput,
    ctx: { handoverId?: string; userId?: string },
  ): Promise<SummaryGenerationResult> {
    const resolved = await this.config.getResolved();
    const provider = createLlmProvider(resolved);

    // Modo none: sin IA, sin red, sin registro de costo. Devuelve el determinista.
    if (provider.id === "none") {
      return { text: input.fallbackText, generatedByAi: false, degraded: false, provider: "none", model: provider.model };
    }

    try {
      const result = await provider.generateSummary(input);
      const text = result.text.trim();
      // Defensa: si el modelo devolvió vacío, no degradamos el contenido — usamos el crudo.
      if (!text) throw new Error("El proveedor de IA devolvió una respuesta vacía.");
      await this.log("shift-summary", "SUCCESS", result, null, ctx);
      return { text, generatedByAi: true, degraded: false, provider: result.provider, model: result.model };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido del proveedor de IA.";
      this.logger.warn(`Resumen por IA falló (${resolved.provider}/${resolved.model}); se usa el determinista: ${message}`);
      await this.logFailure("shift-summary", resolved, message, ctx);
      return { text: input.fallbackText, generatedByAi: false, degraded: true, provider: "none", model: resolved.model };
    }
  }

  /**
   * Genera el resumen de turno en STREAMING (Slice 3): emite deltas en vivo y, al cerrar,
   * registra la generación y emite `done`. GROUNDING intacto (snapshot congelado). Aplica el
   * SCRUBBER de PII al grounding solo si la generación EGRESA de la planta (AC-IA-6/AC-IA-7);
   * on-prem local no se redacta. DEGRADACIÓN (AC-IA-5): si el proveedor falla, emite
   * `done{degraded:true}` para que el cockpit caiga a la ruta no-streaming. Si el cliente se
   * desconecta (signal abortado), corta sin registrar fallo.
   */
  async *streamSummary(
    input: GenerateSummaryInput,
    ctx: { handoverId?: string; userId?: string },
    signal?: AbortSignal,
  ): AsyncGenerator<SummaryStreamEvent> {
    const resolved = await this.config.getResolved();
    const provider = createLlmProvider(resolved);

    // Modo none: sin IA, sin red, sin registro de costo. Emite el determinista en un bloque.
    if (provider.id === "none") {
      yield { type: "delta", text: input.fallbackText };
      yield { type: "done", text: input.fallbackText, provider: "none", generatedByAi: false, degraded: false };
      return;
    }

    // Grounding que ve el modelo: redactado si la generación sale de la planta.
    const grounding = egressesPlant(resolved) ? scrubGrounding(input.grounding) : input.grounding;
    const stream = provider.generateSummaryStream({ fallbackText: input.fallbackText, grounding }, { signal });

    try {
      for await (const delta of stream) {
        if (delta) yield { type: "delta", text: delta };
      }
      const result = await stream.finalResult();
      const text = result.text.trim();
      if (!text) throw new Error("El proveedor de IA devolvió una respuesta vacía.");
      await this.log("shift-summary", "SUCCESS", result, null, ctx);
      yield { type: "done", text, provider: result.provider, generatedByAi: true, degraded: false };
    } catch (err) {
      // El cliente cerró la conexión (EventSource.close): corta limpio, no es un fallo del modelo.
      if (signal?.aborted) return;
      const message = err instanceof Error ? err.message : "Error desconocido del proveedor de IA.";
      this.logger.warn(`Resumen por IA (stream) falló (${resolved.provider}/${resolved.model}); el cockpit degradará: ${message}`);
      await this.logFailure("shift-summary", resolved, message, ctx);
      yield { type: "done", text: "", provider: "none", generatedByAi: false, degraded: true };
    }
  }

  /**
   * Ejecuta una generación corta de PRUEBA con una config ARBITRARIA (valores del formulario,
   * sin guardar). Lo usa el botón "Probar". Devuelve el `LlmResult` o lanza (el controller lo
   * traduce a `{ ok:false, error }`).
   */
  async test(resolved: ResolvedLlmConfig, userId: string): Promise<LlmResult> {
    const provider = createLlmProvider(resolved);
    const prompt =
      "Responde en una sola frase breve en español confirmando que la conexión con el modelo funciona. " +
      "No agregues nada más.";
    try {
      const result = await provider.complete({ prompt, maxTokens: 64 });
      await this.log("test", "SUCCESS", result, null, { userId });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error desconocido del proveedor de IA.";
      await this.logFailure("test", resolved, message, { userId });
      throw err;
    }
  }

  private async log(
    capability: AiCapability,
    status: "SUCCESS" | "FAILED" | "FALLBACK",
    result: LlmResult,
    error: string | null,
    ctx: { handoverId?: string; userId?: string },
  ): Promise<void> {
    try {
      await this.prisma.aiGenerationLog.create({
        data: {
          capability,
          provider: result.provider,
          model: result.model,
          status,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          latencyMs: result.latencyMs,
          error,
          handoverId: ctx.handoverId ?? null,
          createdById: ctx.userId ?? null,
        },
      });
    } catch (e) {
      // El registro de costo NUNCA debe romper la operación: solo se loguea.
      this.logger.error(`No se pudo registrar la generación de IA: ${e instanceof Error ? e.message : e}`);
    }
  }

  private async logFailure(
    capability: AiCapability,
    resolved: ResolvedLlmConfig,
    error: string,
    ctx: { handoverId?: string; userId?: string },
  ): Promise<void> {
    await this.log(
      capability,
      "FAILED",
      { text: "", provider: resolved.provider, model: resolved.model, inputTokens: null, outputTokens: null, latencyMs: 0 },
      error.slice(0, 500),
      ctx,
    );
  }
}
