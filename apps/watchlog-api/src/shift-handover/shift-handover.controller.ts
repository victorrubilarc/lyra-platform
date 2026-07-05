import { Body, Controller, Get, HttpCode, MessageEvent, Param, Patch, Post, Query, Req, Res, Sse } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { from, interval, map, merge, switchMap, takeWhile, type Observable } from "rxjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import {
  acknowledgeHandoverRequestSchema,
  addHandoverItemRequestSchema,
  cancelHandoverRequestSchema,
  compileHandoverRequestSchema,
  handoverGeneralStatusSchema,
  shiftHandoverListQuerySchema,
  signOutHandoverRequestSchema,
  updateHandoverItemRequestSchema,
  updateHandoverSummaryRequestSchema,
  type AcknowledgeHandoverRequest,
  type AddHandoverItemRequest,
  type CancelHandoverRequest,
  type CompileHandoverRequest,
  type HandoverGeneralStatus,
  type ShiftHandoverListQuery,
  type SignOutHandoverRequest,
  type UpdateHandoverItemRequest,
  type UpdateHandoverSummaryRequest,
} from "@lyra/contracts";
import type { Env } from "../config/env.schema";
import type { AuditContext } from "../audit/audit.service";
import type { AccessTokenClaims, RequestUser } from "../authz/auth-user";
import { CurrentUser, Public, RequireAnyPermission, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ShiftHandoverService } from "./shift-handover.service";
import { RequireModule } from "../licensing/module-entitlement.guard";

/** Heartbeat del stream SSE del resumen: mantiene viva la conexión tras proxies/timeouts. */
const SSE_HEARTBEAT_MS = 15_000;

/**
 * Cambio de turno / Shift Handover (Fase 5 — Slice 1). Segregación de funciones:
 * compilar/editar (`shifthandover:compile`), firmar como SALIENTE
 * (`shifthandover:sign`), reconocer como ENTRANTE (`shifthandover:acknowledge`),
 * ver/historial (`shifthandover:view`). El alcance de dato (nodo) lo resuelve el
 * servicio (ABAC): la compilación NUNCA muestra lo no autorizado.
 */
@RequireModule("shift-handover")
@Controller("shift-handover")
export class ShiftHandoverController {
  constructor(
    private readonly handover: ShiftHandoverService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Compila (o recupera) la entrega del turno actual de un nodo. */
  @Post("compile")
  @HttpCode(200)
  @RequirePermission("shifthandover:compile")
  compile(
    @Body(new ZodValidationPipe(compileHandoverRequestSchema)) dto: CompileHandoverRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.handover.compile(user.id, dto, this.ctx(user, req));
  }

  @Get()
  @RequirePermission("shifthandover:view")
  list(
    @Query(new ZodValidationPipe(shiftHandoverListQuerySchema)) q: ShiftHandoverListQuery,
    @CurrentUser() user: RequestUser,
    @Query("structureId") structureId?: string,
  ) {
    return this.handover.list(user.id, q, structureId);
  }

  // Cualquiera que pueda ACTUAR sobre la entrega puede LEERLA: el entrante a menudo solo
  // tiene `acknowledge` (no `view`) — sin esto, el deep link de la notificación daría 403.
  @Get(":id")
  @RequireAnyPermission("shifthandover:view", "shifthandover:compile", "shifthandover:sign", "shifthandover:acknowledge")
  getDetail(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.handover.getDetail(user.id, id);
  }

  /**
   * Descarga el ACTA de entrega de turno en PDF (Slice 4). Mismo gate de LECTURA que
   * `getDetail` (quien puede leer la entrega puede exportar su acta — fork c, sin permiso
   * nuevo) + ABAC por nodo y gobernanza de estado en el servicio. Se sirve con `@Res()`
   * como el export CSV de bitácoras (stream binario propio, sin serialización de Nest).
   */
  @Get(":id/acta.pdf")
  @RequireAnyPermission("shifthandover:view", "shifthandover:compile", "shifthandover:sign", "shifthandover:acknowledge")
  async exportActa(
    @Param("id") id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const { buffer, filename } = await this.handover.exportActa(user.id, id, this.ctx(user, req));
    await reply
      .header("Content-Type", "application/pdf")
      .header("Content-Disposition", `attachment; filename="${filename}"`)
      .header("Content-Length", String(buffer.length))
      .header("Cache-Control", "no-store")
      .send(buffer);
  }

  @Patch(":id/summary")
  @RequirePermission("shifthandover:compile")
  updateSummary(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateHandoverSummaryRequestSchema)) dto: UpdateHandoverSummaryRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.handover.updateSummary(user.id, id, dto, this.ctx(user, req));
  }

  /**
   * Resumen de turno por IA EN VIVO (Slice 3, streaming SSE). Espejo del stream de la campanita:
   * `EventSource` no puede mandar Authorization, así que el access token viaja por `?access_token=`
   * y se verifica aquí (`@Public` para saltar el guard global). El alcance de dato (ABAC) y el
   * estado COMPILING los valida el servicio. Emite `{type:"delta"|"done"}` + un `ping` periódico.
   * NO persiste: el cockpit guarda el texto final con el `PATCH :id/summary` auditado. Si el
   * cliente cierra el `EventSource`, el `close` aborta la generación con el proveedor.
   */
  @Public()
  @Sse(":id/summary/stream")
  streamSummary(
    @Param("id") id: string,
    @Query("access_token") token: string,
    @Query("generalStatus") generalStatus: string | undefined,
    @Req() req: FastifyRequest,
  ): Observable<MessageEvent> {
    const gs = handoverGeneralStatusSchema.safeParse(generalStatus);
    const generalStatusOverride: HandoverGeneralStatus | undefined = gs.success ? gs.data : undefined;
    const abort = new AbortController();
    req.raw.on("close", () => abort.abort());

    return from(this.verifySseToken(token)).pipe(
      switchMap((userId) => {
        const events$ = from(this.handover.streamSummary(userId, id, generalStatusOverride, abort.signal)).pipe(
          map((ev) => ({ data: ev }) as MessageEvent),
        );
        const heartbeat$ = interval(SSE_HEARTBEAT_MS).pipe(
          map(() => ({ type: "ping", data: String(Date.now()) }) as MessageEvent),
        );
        // El heartbeat acompaña hasta que llega el `done`; ahí se cierra el stream (inclusive),
        // lo que también detiene el heartbeat. Los `ping` llevan `data` string (sin `type`).
        return merge(events$, heartbeat$).pipe(
          takeWhile((ev) => {
            const d = ev.data as { type?: string } | string;
            return typeof d === "string" || d.type !== "done";
          }, true),
        );
      }),
    );
  }

  /** Verifica el access token del SSE (query param). Lanza si es inválido/expirado. */
  private async verifySseToken(token: string): Promise<string> {
    const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
      secret: this.config.get("JWT_ACCESS_SECRET", { infer: true }),
    });
    return claims.sub;
  }

  @Post(":id/items")
  @RequirePermission("shifthandover:compile")
  addItem(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(addHandoverItemRequestSchema)) dto: AddHandoverItemRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.handover.addItem(user.id, id, dto, this.ctx(user, req));
  }

  @Patch(":id/items/:itemId")
  @RequirePermission("shifthandover:compile")
  updateItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body(new ZodValidationPipe(updateHandoverItemRequestSchema)) dto: UpdateHandoverItemRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.handover.updateItem(user.id, id, itemId, dto, this.ctx(user, req));
  }

  @Post(":id/sign-out")
  @HttpCode(200)
  @RequirePermission("shifthandover:sign")
  signOut(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(signOutHandoverRequestSchema)) dto: SignOutHandoverRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.handover.signOut(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/acknowledge")
  @HttpCode(200)
  @RequirePermission("shifthandover:acknowledge")
  acknowledge(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(acknowledgeHandoverRequestSchema)) dto: AcknowledgeHandoverRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.handover.acknowledge(user.id, id, dto, this.ctx(user, req));
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @RequirePermission("shifthandover:compile")
  cancel(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(cancelHandoverRequestSchema)) dto: CancelHandoverRequest,
    @CurrentUser() user: RequestUser,
    @Req() req: FastifyRequest,
  ) {
    return this.handover.cancel(user.id, id, dto, this.ctx(user, req));
  }

  private ctx(user: RequestUser, req: FastifyRequest): AuditContext {
    return { actorId: user.id, actorEmail: user.email, ip: req.ip, userAgent: req.headers["user-agent"] ?? null };
  }
}
