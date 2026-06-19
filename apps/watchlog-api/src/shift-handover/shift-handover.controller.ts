import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import {
  acknowledgeHandoverRequestSchema,
  addHandoverItemRequestSchema,
  cancelHandoverRequestSchema,
  compileHandoverRequestSchema,
  shiftHandoverListQuerySchema,
  signOutHandoverRequestSchema,
  updateHandoverItemRequestSchema,
  updateHandoverSummaryRequestSchema,
  type AcknowledgeHandoverRequest,
  type AddHandoverItemRequest,
  type CancelHandoverRequest,
  type CompileHandoverRequest,
  type ShiftHandoverListQuery,
  type SignOutHandoverRequest,
  type UpdateHandoverItemRequest,
  type UpdateHandoverSummaryRequest,
} from "@lyra/contracts";
import type { AuditContext } from "../audit/audit.service";
import type { RequestUser } from "../authz/auth-user";
import { CurrentUser, RequireAnyPermission, RequirePermission } from "../authz/authz.decorators";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ShiftHandoverService } from "./shift-handover.service";

/**
 * Cambio de turno / Shift Handover (Fase 5 — Slice 1). Segregación de funciones:
 * compilar/editar (`shifthandover:compile`), firmar como SALIENTE
 * (`shifthandover:sign`), reconocer como ENTRANTE (`shifthandover:acknowledge`),
 * ver/historial (`shifthandover:view`). El alcance de dato (nodo) lo resuelve el
 * servicio (ABAC): la compilación NUNCA muestra lo no autorizado.
 */
@Controller("shift-handover")
export class ShiftHandoverController {
  constructor(private readonly handover: ShiftHandoverService) {}

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
  ) {
    return this.handover.list(user.id, q);
  }

  // Cualquiera que pueda ACTUAR sobre la entrega puede LEERLA: el entrante a menudo solo
  // tiene `acknowledge` (no `view`) — sin esto, el deep link de la notificación daría 403.
  @Get(":id")
  @RequireAnyPermission("shifthandover:view", "shifthandover:compile", "shifthandover:sign", "shifthandover:acknowledge")
  getDetail(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.handover.getDetail(user.id, id);
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
