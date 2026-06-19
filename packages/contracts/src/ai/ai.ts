import { z } from "zod";

/**
 * Configuración de INTELIGENCIA ARTIFICIAL (Fase 5 · Slice 2). La IA del ecosistema
 * deja de configurarse por `.env` y pasa a ser un módulo ADMINISTRABLE desde la app
 * (tab "Inteligencia Artificial" en `/configuracion`, permiso `ai:config`), espejo del
 * correo saliente del Bloque N. La **API key es write-only**: nunca vuelve a la UI (solo
 * `keySet`); se guarda CIFRADA en reposo (`EncryptionService`/`APP_ENC_KEY`). Fuente
 * única back↔front. El motor (interfaz `LlmProvider`) vive en `@lyra/llm`.
 *
 * Proveedores:
 * - `none`              → sin IA, resumen DETERMINISTA/offline (el del Slice 1). Por defecto.
 * - `anthropic`         → SDK oficial (claude-opus-4-8 / claude-sonnet-4-6). Datos salen a la nube de Anthropic.
 * - `openai-compatible` → por `baseURL` (Ollama / vLLM / LM Studio / OpenAI / DeepSeek).
 *                         Con un endpoint LOCAL, los datos NO salen de la planta (on-prem).
 */

/** Identificadores de proveedor (compartidos con la factory de `@lyra/llm`). */
export const AI_PROVIDER_IDS = ["none", "anthropic", "openai-compatible"] as const;
export const aiProviderSchema = z.enum(AI_PROVIDER_IDS);
export type AiProvider = z.infer<typeof aiProviderSchema>;

/** Capacidad que consume la IA (para grounding/contexto y gobernanza de costo). Hoy: el resumen de turno. */
export const AI_CAPABILITIES = ["shift-summary", "test"] as const;
export const aiCapabilitySchema = z.enum(AI_CAPABILITIES);
export type AiCapability = z.infer<typeof aiCapabilitySchema>;

/** Defaults recomendados (editables por el admin; solo son el valor inicial del formulario). */
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-4-8";
export const DEFAULT_OPENAI_COMPATIBLE_MODEL = "qwen2.5:7b-instruct";
export const DEFAULT_OPENAI_COMPATIBLE_BASE_URL = "http://localhost:11434/v1";

/** Config PÚBLICA (la que ve la UI): sin la API key, con indicadores de estado. */
export const aiConfigSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderSchema,
  /** Modelo a usar (id del modelo Anthropic, o nombre del modelo del endpoint OpenAI-compatible). */
  model: z.string(),
  /** Solo para `openai-compatible`: URL base del endpoint (Ollama/vLLM/…). */
  baseUrl: z.string(),
  /** ¿Hay API key guardada (en BD o env)? La key real nunca se devuelve. */
  keySet: z.boolean(),
  /** De dónde sale la config vigente: BD (guardada) o variables de entorno. */
  source: z.enum(["db", "env"]),
  /** Metadatos de última actualización (auditoría liviana para la UI). */
  updatedAt: z.string().nullable(),
  updatedByName: z.string().nullable(),
});
export type AiConfigDto = z.infer<typeof aiConfigSchema>;

/** Payload para GUARDAR / PROBAR la config. `apiKey` vacío/ausente = conservar la guardada. */
export const updateAiConfigRequestSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderSchema,
  model: z.string().trim().max(120).optional().default(""),
  baseUrl: z.string().trim().max(500).optional().default(""),
  /** Vacío/ausente = conservar la API key guardada (write-only). */
  apiKey: z.string().max(500).optional(),
});
export type UpdateAiConfigRequest = z.infer<typeof updateAiConfigRequestSchema>;

/** Resultado del botón "Probar": una generación real corta + latencia, o el error real. */
export const aiTestResultSchema = z.object({
  ok: z.boolean(),
  /** Respuesta del modelo (recortada) cuando `ok`. */
  text: z.string().nullable(),
  provider: aiProviderSchema.nullable(),
  model: z.string().nullable(),
  latencyMs: z.number().int().nullable(),
  error: z.string().nullable(),
});
export type AiTestResult = z.infer<typeof aiTestResultSchema>;

/** Etiqueta legible del proveedor (para la UI). */
export function aiProviderLabel(provider: AiProvider): string {
  switch (provider) {
    case "anthropic":
      return "Anthropic (nube)";
    case "openai-compatible":
      return "Local / OpenAI-compatible";
    default:
      return "Ninguno (sin IA)";
  }
}

/** ¿La config dada requiere `baseUrl`? Solo el proveedor local/OpenAI-compatible. */
export function aiProviderNeedsBaseUrl(provider: AiProvider): boolean {
  return provider === "openai-compatible";
}

/** ¿La config dada admite/requiere API key? `none` no; `anthropic`/`openai-compatible` sí (local puede ir sin). */
export function aiProviderUsesApiKey(provider: AiProvider): boolean {
  return provider !== "none";
}
