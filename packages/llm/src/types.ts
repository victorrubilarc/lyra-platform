import type { AiCapability, AiProvider } from "@lyra/contracts";

/**
 * Resultado de UNA generación. Lleva metadatos de gobernanza de costo (proveedor,
 * modelo, tokens, latencia) que el backend registra en `AiGenerationLog`.
 */
export interface LlmResult {
  text: string;
  provider: AiProvider;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
}

/**
 * Datos CONGELADOS para el grounding del resumen de turno (AC-IA-2). Genéricos y
 * serializables: el DOMINIO (shift-handover) los arma desde el snapshot; este package
 * solo los enumera en el prompt. Nada que no esté aquí puede aparecer en el resumen.
 */
export interface SummaryGrounding {
  nodeName: string;
  shiftLabel: string;
  operationalDay: string;
  generalStatusLabel: string;
  entriesCount: number;
  incidents: ReadonlyArray<{
    folio: string;
    title: string;
    severity: number;
    critical: boolean;
    overdue: boolean;
    stateName: string | null;
  }>;
  exceptions: ReadonlyArray<{ kind: string; detail: string; fieldLabel: string | null }>;
  followups: ReadonlyArray<{ kind: string; code: string; title: string; overdue: boolean }>;
  rounds: { done: number; overdue: number; total: number };
  openItems: ReadonlyArray<string>;
}

/** Entrada del resumen de turno. */
export interface GenerateSummaryInput {
  /**
   * Resumen DETERMINISTA ya calculado (línea base / fallback offline). El proveedor
   * `none` lo devuelve tal cual; los proveedores de IA lo ignoran y generan grounded.
   */
  fallbackText: string;
  /** Datos estructurados congelados que se pasan EXPLÍCITOS al prompt (grounding). */
  grounding: SummaryGrounding;
}

/** Entrada de una generación libre y corta (botón "Probar"). */
export interface CompleteInput {
  prompt: string;
  system?: string;
  maxTokens?: number;
}

/**
 * Interfaz abstracta del proveedor de IA. Patrón `EmailService` (token DI). Un solo
 * contrato — `generateSummary` (grounded, primer consumidor) + `complete` (libre, para
 * Probar). El streaming es opcional y se difiere (Slice 3): la interfaz lo admitirá
 * agregando `generateSummaryStream` sin reescribir a los consumidores.
 */
export interface LlmProvider {
  readonly id: AiProvider;
  readonly model: string;
  generateSummary(input: GenerateSummaryInput): Promise<LlmResult>;
  complete(input: CompleteInput): Promise<LlmResult>;
}

/** Config RESUELTA para instanciar un proveedor (incluye la API key en claro; uso interno del backend). */
export interface ResolvedLlmConfig {
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
}

export type { AiCapability };
