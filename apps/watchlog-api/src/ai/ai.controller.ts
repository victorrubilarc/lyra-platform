import { Body, Controller, Get, HttpCode, Post, Put, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  updateAiConfigRequestSchema,
  type AiTestResult,
  type UpdateAiConfigRequest,
} from "@lyra/contracts";
import { AuditService } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AiConfigService } from "./ai-config.service";
import { AiService } from "./ai.service";
import { RequireModule } from "../licensing/module-entitlement.guard";

/**
 * Configuración de la IA del sistema — pantalla de `/configuracion` (tab "Inteligencia
 * Artificial"), permiso `ai:config`. La API key es write-only (la respuesta nunca la incluye)
 * y se guarda cifrada. "Probar" hace una generación real corta con los valores del formulario
 * SIN guardarlos; auditado sin registrar la clave.
 */
@RequireModule("ai")
@Controller("settings/ai")
export class AiController {
  constructor(
    private readonly config: AiConfigService,
    private readonly ai: AiService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermission("ai:config")
  get() {
    return this.config.getPublic();
  }

  @Put()
  @RequirePermission("ai:config")
  async save(
    @Body(new ZodValidationPipe(updateAiConfigRequestSchema)) dto: UpdateAiConfigRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    const saved = await this.config.set(dto, user.id);
    await this.audit.record({
      actorId: user.id,
      actorEmail: user.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      action: "ai.config.updated",
      entityType: "AiSettings",
      entityId: "system",
      // Nunca se registra la API key.
      after: { enabled: saved.enabled, provider: saved.provider, model: saved.model, baseUrl: saved.baseUrl, keySet: saved.keySet },
    });
    return saved;
  }

  /** Probar la conexión: una generación real corta con los valores del formulario (sin guardar). */
  @Post("test")
  @HttpCode(200)
  @RequirePermission("ai:config")
  async test(
    @Body(new ZodValidationPipe(updateAiConfigRequestSchema)) dto: UpdateAiConfigRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ): Promise<AiTestResult> {
    const resolved = await this.config.resolveFrom(dto);
    await this.audit.record({
      actorId: user.id,
      actorEmail: user.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"] ?? null,
      action: "ai.config.tested",
      entityType: "AiSettings",
      entityId: "system",
      after: { provider: resolved.provider, model: resolved.model, baseUrl: resolved.baseUrl },
    });
    if (resolved.provider === "none") {
      return { ok: false, text: null, provider: "none", model: null, latencyMs: null, error: "Selecciona un proveedor de IA (Anthropic o local) para probar." };
    }
    try {
      const result = await this.ai.test(resolved, user.id);
      return { ok: true, text: result.text, provider: result.provider, model: result.model, latencyMs: result.latencyMs, error: null };
    } catch (err) {
      return {
        ok: false,
        text: null,
        provider: resolved.provider,
        model: resolved.model,
        latencyMs: null,
        error: err instanceof Error ? err.message : "No se pudo conectar con el proveedor de IA.",
      };
    }
  }
}
