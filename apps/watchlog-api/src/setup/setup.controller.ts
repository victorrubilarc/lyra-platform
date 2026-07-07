import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Post, Req, Res } from "@nestjs/common";
import type { MultipartFile } from "@fastify/multipart";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  setupFinalizeRequestSchema,
  setupLicenseImportRequestSchema,
  type SetupContextDto,
  type SetupFinalizeRequest,
  type SetupFinalizeResponse,
  type SetupLicenseImportRequest,
  type SetupLicenseImportResponse,
  type SetupStatusDto,
} from "@lyra/contracts";
import { Public } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { SetupService, type SetupRequestMeta } from "./setup.service";

/** Header del token de instalación (un solo uso; ver SetupService). */
const TOKEN_HEADER = "x-setup-token";

/**
 * Endpoints del asistente de primer arranque. TODOS `@Public()` (una
 * instalación virgen no tiene usuarios que autenticar): el candado es el
 * token de instalación, validado por el servicio con lockout. `status` es el
 * único que responde sin token (un booleano, mínimo privilegio); el resto
 * muere en 404 al completarse el setup. El prefijo `/api/setup/` está en la
 * whitelist del guard L1: el setup ocurre típicamente en PENDIENTE_ACTIVACION.
 */
@Public()
@Controller("setup")
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get("status")
  status(): Promise<SetupStatusDto> {
    return this.setup.status();
  }

  @Get("context")
  context(@Headers(TOKEN_HEADER) token: string | undefined): Promise<SetupContextDto> {
    return this.setup.context(token);
  }

  /** Descarga de `solicitud.lreq` (ceremonia de activación, runbook §2). */
  @Get("license-request")
  async licenseRequest(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const content = await this.setup.activationRequest(token);
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("content-disposition", 'attachment; filename="solicitud.lreq"');
    return content;
  }

  @Post("license")
  @HttpCode(200)
  importLicense(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Body(new ZodValidationPipe(setupLicenseImportRequestSchema)) dto: SetupLicenseImportRequest,
    @Req() req: FastifyRequest,
  ): Promise<SetupLicenseImportResponse> {
    return this.setup.importLicense(token, dto, meta(req));
  }

  /** Logo de la empresa (OOBE S3, paso Identidad): multipart, token-gated. */
  @Post("logo")
  @HttpCode(204)
  async uploadLogo(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    const data = await (
      req as FastifyRequest & { file: () => Promise<MultipartFile | undefined> }
    ).file();
    if (!data) throw new BadRequestException("No se recibió ningún archivo.");
    const buffer = await data.toBuffer();
    await this.setup.uploadLogo(
      token,
      { buffer, filename: data.filename, truncated: data.file.truncated },
      meta(req),
    );
  }

  @Delete("logo")
  @HttpCode(204)
  removeLogo(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Req() req: FastifyRequest,
  ): Promise<void> {
    return this.setup.removeLogo(token, meta(req));
  }

  @Post("finalize")
  @HttpCode(200)
  finalize(
    @Headers(TOKEN_HEADER) token: string | undefined,
    @Body(new ZodValidationPipe(setupFinalizeRequestSchema)) dto: SetupFinalizeRequest,
    @Req() req: FastifyRequest,
  ): Promise<SetupFinalizeResponse> {
    return this.setup.finalize(token, dto, meta(req));
  }
}

function meta(req: FastifyRequest): SetupRequestMeta {
  return { ip: req.ip, userAgent: req.headers["user-agent"] };
}
