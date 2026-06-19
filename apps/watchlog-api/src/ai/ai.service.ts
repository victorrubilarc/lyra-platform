import { Injectable, Logger } from "@nestjs/common";
import type { AiCapability, AiProvider } from "@lyra/contracts";
import {
  createLlmProvider,
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
