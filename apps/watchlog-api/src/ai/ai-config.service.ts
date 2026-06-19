import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  type AiConfigDto,
  type AiProvider,
  type UpdateAiConfigRequest,
} from "@lyra/contracts";
import type { ResolvedLlmConfig } from "@lyra/llm";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { EncryptionService } from "../crypto/encryption.service";

const SETTINGS_ID = "system";

/**
 * Configuración de IA persistida en BD (`AiSettings`), editable desde `/configuracion`
 * (tab "Inteligencia Artificial", permiso `ai:config`) sin reiniciar la API. El `.env`
 * (AI_*) es el FALLBACK de arranque. La **API key va CIFRADA en reposo** (`apiKeyEnc`,
 * `EncryptionService`) y es **write-only** (nunca vuelve a la UI; solo `keySet`). La config
 * es "toda BD" o "toda env" según `configuredAt` (evita ambigüedades por campo). Espejo del
 * `EmailConfigService` del Bloque N. El motor (adapters) vive en `@lyra/llm`.
 */
@Injectable()
export class AiConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enc: EncryptionService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Defaults desde el `.env` (compat / bootstrap). */
  private envDefaults() {
    const provider = this.config.get("AI_PROVIDER", { infer: true }) as AiProvider;
    return {
      enabled: this.config.get("AI_ENABLED", { infer: true }) ?? false,
      provider,
      model: this.config.get("AI_MODEL", { infer: true }) ?? "",
      baseUrl: this.config.get("AI_BASE_URL", { infer: true }) ?? "",
      apiKey: this.config.get("AI_API_KEY", { infer: true }) ?? "",
    };
  }

  /** Modelo efectivo: el dado, o el default del proveedor. */
  private resolveModel(provider: AiProvider, model: string): string {
    if (model.trim()) return model.trim();
    if (provider === "anthropic") return DEFAULT_ANTHROPIC_MODEL;
    if (provider === "openai-compatible") return DEFAULT_OPENAI_COMPATIBLE_MODEL;
    return "";
  }

  /** baseUrl efectiva: la dada, o el default (solo aplica a openai-compatible). */
  private resolveBaseUrl(provider: AiProvider, baseUrl: string): string {
    if (provider !== "openai-compatible") return "";
    return baseUrl.trim() || DEFAULT_OPENAI_COMPATIBLE_BASE_URL;
  }

  private async row() {
    return this.prisma.aiSettings.findUnique({ where: { id: SETTINGS_ID } });
  }

  /** Config PÚBLICA (sin API key) para la UI. */
  async getPublic(): Promise<AiConfigDto> {
    const s = await this.row();
    const d = this.envDefaults();
    const fromDb = !!s?.configuredAt;
    if (!fromDb) {
      return {
        enabled: d.enabled,
        provider: d.provider,
        model: this.resolveModel(d.provider, d.model),
        baseUrl: this.resolveBaseUrl(d.provider, d.baseUrl),
        keySet: !!d.apiKey,
        source: "env",
        updatedAt: null,
        updatedByName: null,
      };
    }
    const provider = (s!.provider as AiProvider) ?? "none";
    const updatedByName = s!.updatedById
      ? ((await this.prisma.user.findUnique({ where: { id: s!.updatedById }, select: { displayName: true } }))?.displayName ?? null)
      : null;
    return {
      enabled: s!.enabled,
      provider,
      model: this.resolveModel(provider, s!.model ?? ""),
      baseUrl: this.resolveBaseUrl(provider, s!.baseUrl ?? ""),
      keySet: !!s!.apiKeyEnc || !!d.apiKey,
      source: "db",
      updatedAt: s!.updatedAt.toISOString(),
      updatedByName,
    };
  }

  /** Config RESUELTA para EJECUTAR (incluye la API key en claro; uso interno del gateway). */
  async getResolved(): Promise<ResolvedLlmConfig> {
    const s = await this.row();
    const d = this.envDefaults();
    if (!s?.configuredAt) {
      return {
        provider: d.enabled ? d.provider : "none",
        model: this.resolveModel(d.provider, d.model),
        baseUrl: this.resolveBaseUrl(d.provider, d.baseUrl),
        apiKey: d.apiKey,
      };
    }
    const provider = (s.provider as AiProvider) ?? "none";
    const apiKey = s.apiKeyEnc ? this.enc.decrypt(s.apiKeyEnc) : d.apiKey;
    return {
      provider: s.enabled ? provider : "none",
      model: this.resolveModel(provider, s.model ?? ""),
      baseUrl: this.resolveBaseUrl(provider, s.baseUrl ?? ""),
      apiKey,
    };
  }

  /** ¿La IA está activada y con un proveedor real? (lo usa el gateway para decidir). */
  async isEnabled(): Promise<boolean> {
    const r = await this.getResolved();
    return r.provider !== "none";
  }

  /** Resuelve una config a partir del payload de la UI (para PROBAR sin guardar). */
  async resolveFrom(dto: UpdateAiConfigRequest): Promise<ResolvedLlmConfig> {
    const s = await this.row();
    const d = this.envDefaults();
    const stored = s?.apiKeyEnc ? this.enc.decrypt(s.apiKeyEnc) : d.apiKey;
    const apiKey = dto.apiKey && dto.apiKey.trim() ? dto.apiKey.trim() : stored;
    return {
      provider: dto.provider,
      model: this.resolveModel(dto.provider, dto.model ?? ""),
      baseUrl: this.resolveBaseUrl(dto.provider, dto.baseUrl ?? ""),
      apiKey,
    };
  }

  /** Guarda la config; la API key SOLO se persiste (cifrada) si viene con valor. */
  async set(dto: UpdateAiConfigRequest, userId: string): Promise<AiConfigDto> {
    const data = {
      enabled: dto.enabled,
      provider: dto.provider,
      model: (dto.model ?? "").trim() || null,
      baseUrl: (dto.baseUrl ?? "").trim() || null,
      configuredAt: new Date(),
      configuredById: userId,
      updatedById: userId,
      ...(dto.apiKey && dto.apiKey.trim() ? { apiKeyEnc: this.enc.encrypt(dto.apiKey.trim()) } : {}),
    };
    await this.prisma.aiSettings.upsert({
      where: { id: SETTINGS_ID },
      update: data,
      create: { id: SETTINGS_ID, ...data },
    });
    return this.getPublic();
  }
}
