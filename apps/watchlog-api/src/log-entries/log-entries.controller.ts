import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { MultipartFile } from "@fastify/multipart";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  createLogEntryRequestSchema,
  executeTransitionRequestSchema,
  logEntryListQuerySchema,
  previewLogEntryQuerySchema,
  REFERENCE_ENTITIES,
  referenceOptionsQuerySchema,
  saveLogEntrySectionRequestSchema,
  setDeferralRequestSchema,
  submitLogEntryRequestSchema,
  timelineQuerySchema,
  voidLogEntryRequestSchema,
  type CreateLogEntryRequest,
  type ExecuteTransitionRequest,
  type LogEntryListQuery,
  type PreviewLogEntryQuery,
  type ReferenceEntity,
  type ReferenceOptionsQuery,
  type SaveLogEntrySectionRequest,
  type SetDeferralRequest,
  type SubmitLogEntryRequest,
  type TimelineQuery,
  type VoidLogEntryRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { TemplatesService } from "../templates/templates.service";
import { LogEntriesService } from "./log-entries.service";
import { LogbookQueryService } from "./logbook-query.service";

/**
 * Llenado de bitácoras (Fase 2.4/2.5) + módulo de Bitácoras read-only (Fase 2.6).
 * Los guards aplican el RBAC dim. 1–2; la editabilidad por SECCIÓN y el ABAC los
 * deciden los services. Las rutas estáticas (`stats`, `export`) van ANTES de
 * `:id` (Nest resuelve en orden de declaración).
 */
@Controller("log-entries")
export class LogEntriesController {
  constructor(
    private readonly entries: LogEntriesService,
    private readonly logbook: LogbookQueryService,
    private readonly templates: TemplatesService,
  ) {}

  /**
   * Plantillas PUBLICADAS que el usuario puede usar para CREAR una entrada (picker
   * de "Nueva entrada"). Gateado por `logentry:create` y acotado por ABAC — NO
   * exige el permiso de administración de plantillas (`template:view`): llenar una
   * bitácora no requiere acceso al módulo de Plantillas. Va antes de `:id`.
   */
  @Get("templates")
  @RequirePermission("logentry:create")
  availableTemplates(@CurrentUser() user: RequestUser) {
    // Picker operacional: aplica el 2.º eje ABAC (alcance por plantilla).
    return this.templates.list(user.id, { status: "PUBLISHED" }, { applyTemplateScope: true });
  }

  /**
   * Plantillas que el usuario puede VER en Bitácoras (poblar el filtro de la
   * grilla). Gateado por `logentry:view` (audiencia de lectura) y acotado por el
   * MISMO alcance que la grilla (nodo × plantilla) ⇒ el filtro nunca ofrece
   * plantillas fuera de privilegio. Va antes de `:id`.
   */
  @Get("filter-templates")
  @RequirePermission("logentry:view")
  filterTemplates(@CurrentUser() user: RequestUser) {
    return this.templates.list(user.id, { status: "PUBLISHED" }, { applyTemplateScope: true });
  }

  /**
   * Nodos en los que el usuario puede crear una entrada con esta plantilla (multi-
   * nodo, Fase 2.8.0): asignaciones de la plantilla ∩ alcance de nodo del usuario.
   * La web autoselecciona si hay 1 y obliga a elegir si hay más de 1. Va ANTES de
   * `:id` para que "templates" no se interprete como un id.
   */
  @Get("templates/:templateId/nodes")
  @RequirePermission("logentry:create")
  eligibleNodes(@Param("templateId") templateId: string, @CurrentUser() user: RequestUser) {
    return this.entries.eligibleNodesForTemplate(user.id, templateId);
  }

  @Get()
  @RequirePermission("logentry:view")
  list(@Query(new ZodValidationPipe(logEntryListQuerySchema)) query: LogEntryListQuery, @CurrentUser() user: RequestUser) {
    return this.logbook.list(user.id, query);
  }

  /** KPIs del set filtrado (misma query y mismo `where` que el listado). */
  @Get("stats")
  @RequirePermission("logentry:view")
  stats(@Query(new ZodValidationPipe(logEntryListQuerySchema)) query: LogEntryListQuery, @CurrentUser() user: RequestUser) {
    return this.logbook.stats(user.id, query);
  }

  /** Facetas con conteo del set filtrado (estilo Splunk/Kibana; conteos de hermanos). */
  @Get("facets")
  @RequirePermission("logentry:view")
  facets(@Query(new ZodValidationPipe(logEntryListQuerySchema)) query: LogEntryListQuery, @CurrentUser() user: RequestUser) {
    return this.logbook.facets(user.id, query);
  }

  /** Filtros resueltos de la vista de sistema "Mi turno" (turno/día vigentes + autor). */
  @Get("my-shift")
  @RequirePermission("logentry:view")
  myShift(@CurrentUser() user: RequestUser) {
    return this.logbook.myShiftFilter(user.id);
  }

  /** Exporta el set COMPLETO filtrado a CSV (server-side, patrón de auditoría). */
  @Get("export")
  @RequirePermission("logentry:view")
  async export(
    @Query(new ZodValidationPipe(logEntryListQuerySchema)) query: LogEntryListQuery,
    @CurrentUser() user: RequestUser,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { csv, truncated } = await this.logbook.exportCsv(user.id, query);
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    await reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="bitacoras-${stamp}.csv"`)
      .header("X-Export-Truncated", String(truncated))
      .send(csv);
  }

  /**
   * Opciones de un selector de REFERENCIA (Ola 2): equipo/usuario/nodo/turno con
   * ABAC en el backend. `nodeId` = nodo de la entrada (acota equipo/turno); `q`
   * filtra. Gateado por `logentry:view` (audiencia de llenado/lectura). Va ANTES
   * de `:id` para que "references" no se interprete como un id.
   */
  @Get("references/:kind/options")
  @RequirePermission("logentry:view")
  referenceOptions(
    @Param("kind") kind: string,
    @Query(new ZodValidationPipe(referenceOptionsQuerySchema)) query: ReferenceOptionsQuery,
    @CurrentUser() user: RequestUser,
  ) {
    if (!(REFERENCE_ENTITIES as readonly string[]).includes(kind)) {
      throw new NotFoundException(`Entidad de referencia desconocida: ${kind}`);
    }
    return this.entries.referenceOptions(user.id, kind as ReferenceEntity, query);
  }

  /** Vista previa de una entrada NUEVA sin persistir (modo compose 2.8.2). Va ANTES
   * de `:id` para que "new" no se interprete como un id. */
  @Get("new")
  @RequirePermission("logentry:create")
  previewNew(
    @Query(new ZodValidationPipe(previewLogEntryQuerySchema)) query: PreviewLogEntryQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.entries.previewNew(user.id, query);
  }

  @Get(":id")
  @RequirePermission("logentry:view")
  getDetail(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.entries.getDetail(user.id, id);
  }

  /** Audit trail unificado (creación + cambios + transiciones + firmas + sellado). */
  @Get(":id/timeline")
  @RequirePermission("logentry:view")
  timeline(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(timelineQuerySchema)) query: TimelineQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.logbook.timeline(user.id, id, query);
  }

  /** Log de cambios por campo, paginado. */
  @Get(":id/changes")
  @RequirePermission("logentry:view")
  changes(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(timelineQuerySchema)) query: TimelineQuery,
    @CurrentUser() user: RequestUser,
  ) {
    return this.logbook.changes(user.id, id, query);
  }

  /** Entradas relacionadas (mismo nodo+periodo / mismo turno). */
  @Get(":id/related")
  @RequirePermission("logentry:view")
  related(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.logbook.related(user.id, id);
  }

  /** Verificación de integridad de una firma (§11.70). Acto de revisión: se audita. */
  @Post(":id/signatures/:signatureId/verify")
  @RequirePermission("logentry:view")
  verifySignature(
    @Param("id") id: string,
    @Param("signatureId") signatureId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.logbook.verifySignature(user.id, id, signatureId, this.ctx(user, req));
  }

  @Post()
  @RequirePermission("logentry:create")
  create(
    @Body(new ZodValidationPipe(createLogEntryRequestSchema)) dto: CreateLogEntryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.create(user.id, dto, this.ctx(user, req));
  }

  @Put(":id/sections/:sectionKey")
  @RequirePermission("logentry:fill")
  saveSection(
    @Param("id") id: string,
    @Param("sectionKey") sectionKey: string,
    @Body(new ZodValidationPipe(saveLogEntrySectionRequestSchema)) dto: SaveLogEntrySectionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.saveSection(user.id, id, sectionKey, dto, this.ctx(user, req));
  }

  /** Declara, corrige o quita (null) el registro DIFERIDO de un borrador (2.7.0). */
  @Put(":id/deferral")
  @RequirePermission("logentry:fill")
  setDeferral(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(setDeferralRequestSchema)) dto: SetDeferralRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.setDeferral(user.id, id, dto, this.ctx(user, req));
  }

  /**
   * Anula (descarta) un borrador (2.8.2). Gate GRUESO = `logentry:view` (estar en
   * el módulo); la autorización FINA (ownership del autor, o `logentry:void` para
   * anular ajenas, + ABAC) la decide el servicio. Motivo obligatorio (≥5), auditado.
   */
  @Post(":id/void")
  @RequirePermission("logentry:view")
  voidEntry(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(voidLogEntryRequestSchema)) dto: VoidLogEntryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.voidEntry(user.id, id, dto, this.ctx(user, req));
  }

  /**
   * Sube un objeto de EVIDENCIA (adjunto, Ola 3) a un campo ATTACHMENT de un
   * borrador (subida PROXIED: la API valida tamaño/tipo y audita antes de MinIO).
   * Devuelve el descriptor; el cliente lo agrega al valor del campo y guarda la
   * sección por el canal normal. Gate = `logentry:fill` (mismo que escribir).
   */
  @Post(":id/attachments/:sectionKey/:fieldKey")
  @RequirePermission("logentry:fill")
  async uploadAttachment(
    @Param("id") id: string,
    @Param("sectionKey") sectionKey: string,
    @Param("fieldKey") fieldKey: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    const data = await (req as FastifyRequest & { file: () => Promise<MultipartFile | undefined> }).file();
    if (!data) throw new BadRequestException("No se recibió ningún archivo");
    const buffer = await data.toBuffer();
    return this.entries.uploadAttachment(
      user.id,
      id,
      sectionKey,
      fieldKey,
      { buffer, filename: data.filename, mimetype: data.mimetype, truncated: data.file.truncated },
      this.ctx(user, req),
    );
  }

  /**
   * URL prefirmada de DESCARGA (GET de vida corta) de un adjunto, resuelta por
   * `descriptorId` desde los valores persistidos con la MISMA ABAC que `getDetail`.
   * El navegador nunca recibe credenciales de MinIO. Gate = `logentry:view`.
   */
  @Get(":id/attachments/:descriptorId/url")
  @RequirePermission("logentry:view")
  attachmentUrl(
    @Param("id") id: string,
    @Param("descriptorId") descriptorId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.getAttachmentDownloadUrl(user.id, id, descriptorId, this.ctx(user, req));
  }

  @Post(":id/submit")
  @RequirePermission("logentry:fill")
  submit(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(submitLogEntryRequestSchema)) dto: SubmitLogEntryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.submit(user.id, id, dto, this.ctx(user, req));
  }

  /** Ejecuta una transición de flujo (firma + step-up MFA según la transición). */
  @Post(":id/transitions")
  @RequirePermission("logentry:transition")
  executeTransition(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(executeTransitionRequestSchema)) dto: ExecuteTransitionRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.entries.executeTransition(user.id, id, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
