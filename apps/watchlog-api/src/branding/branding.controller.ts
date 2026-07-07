import { BadRequestException, Controller, Delete, Get, HttpCode, Put, Req, Res } from "@nestjs/common";
import type { MultipartFile } from "@fastify/multipart";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { BrandingDto } from "@lyra/contracts";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, Public, RequirePermission } from "../authz/authz.decorators";
import { BrandingService, type BrandingActor } from "./branding.service";

/**
 * Branding runtime de la instalación (OOBE S3).
 *
 * Los GET son PÚBLICOS a propósito: la pantalla de login se co-marca SIN
 * sesión. El DTO es mínimo (ver contrato `brandingSchema`) y el logo se sirve
 * cacheable con ETag. Las mutaciones exigen `settings:manage` (misma dueña que
 * el resto de la configuración del sistema) y, al ser POST/PUT/DELETE, quedan
 * bajo el guard L1 de licencia — en SOLO_LECTURA no se re-marca la instalación.
 */
@Controller("branding")
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Public()
  @Get()
  getBranding(): Promise<BrandingDto> {
    return this.branding.getBranding();
  }

  /**
   * Bytes del logo (público, pre-auth). Cacheable: ETag fuerte (sha256) + 304
   * con If-None-Match; la web además versiona la URL (`?v=<logoVersion>`).
   */
  @Public()
  @Get("logo")
  async getLogo(@Req() req: FastifyRequest, @Res() reply: FastifyReply): Promise<void> {
    const logo = await this.branding.getLogo();
    if (!logo) {
      await reply.status(404).send({ statusCode: 404, message: "La instalación no tiene logo." });
      return;
    }
    reply.header("etag", logo.etag);
    reply.header("cache-control", "public, max-age=86400");
    reply.header("x-content-type-options", "nosniff");
    if (req.headers["if-none-match"] === logo.etag) {
      await reply.status(304).send();
      return;
    }
    reply.header("content-type", logo.contentType);
    reply.header("content-length", String(logo.data.length));
    await reply.send(logo.data);
  }

  /** Sube/reemplaza el logo (multipart, 1 archivo). Validación real en el servicio. */
  @Put("logo")
  @RequirePermission("settings:manage")
  @HttpCode(204)
  async putLogo(@CurrentUser() user: RequestUser, @Req() req: FastifyRequest): Promise<void> {
    const data = await (
      req as FastifyRequest & { file: () => Promise<MultipartFile | undefined> }
    ).file();
    if (!data) throw new BadRequestException("No se recibió ningún archivo.");
    const buffer = await data.toBuffer();
    await this.branding.setLogo(
      { buffer, filename: data.filename, truncated: data.file.truncated },
      this.actor(user, req),
    );
  }

  @Delete("logo")
  @RequirePermission("settings:manage")
  @HttpCode(204)
  async deleteLogo(@CurrentUser() user: RequestUser, @Req() req: FastifyRequest): Promise<void> {
    await this.branding.removeLogo(this.actor(user, req));
  }

  private actor(user: RequestUser, req: FastifyRequest): BrandingActor {
    return {
      id: user.id,
      email: user.email,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    };
  }
}
