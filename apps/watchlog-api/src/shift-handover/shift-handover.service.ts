import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { ShiftHandover, ShiftHandoverItem as ShiftHandoverItemRow } from "@prisma/client";
import {
  buildDeterministicSummary,
  isHandoverItemOpen,
  resolveHandoverWindow,
  shiftHandoverCode,
  type AcknowledgeHandoverRequest,
  type AddHandoverItemRequest,
  type CancelHandoverRequest,
  type CompileHandoverRequest,
  type HandoverCockpit,
  type HandoverGeneralStatus,
  type ShiftHandoverDetail,
  type ShiftHandoverListItem,
  type ShiftHandoverListQuery,
  type ShiftHandoverListResponse,
  type SignOutHandoverRequest,
  type UpdateHandoverItemRequest,
  type UpdateHandoverSummaryRequest,
} from "@lyra/contracts";
import type { SummaryGrounding } from "@lyra/llm";
import { AiService, type SummaryStreamEvent } from "../ai/ai.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ReauthService } from "../auth/reauth.service";
import { ScopeService } from "../authz/scope.service";
import { NotificationEmitterService } from "../notifications/notification-emitter.service";
import { ShiftResolver } from "../operational-calendar/shift-resolver";
import { PrismaService } from "../prisma/prisma.service";
import { ShiftHandoverCompilerService, type CompileScope } from "./shift-handover-compiler.service";
import { buildActaDocument } from "./acta/acta-document";
import { actaIntegrityHash } from "./acta/acta-hash";
import { renderActaPdf } from "./acta/acta-renderer";

const GENERAL_STATUS_LABELS: Record<HandoverGeneralStatus, string> = {
  OPERATIONAL: "Operativo",
  OPERATIONAL_WITH_OBSERVATIONS: "Operativo con observaciones",
  STOPPED_MAINTENANCE: "Detenido por mantención",
  STOPPED_FAILURE: "Detenido por falla",
};

type HandoverWithRelations = ShiftHandover & { items: ShiftHandoverItemRow[] };

/** Nombre de archivo significativo del acta: `acta-<folio>-<nodo>-<dia>.pdf`. */
function actaFilename(code: string, nodeName: string, operationalDay: string): string {
  const slug =
    nodeName
      .normalize("NFD") // separa los diacríticos…
      .replace(/[̀-ͯ]/g, "") // …y los elimina (Línea → Linea, no Li-nea)
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "nodo";
  return `acta-${code}-${slug}-${operationalDay}.pdf`;
}

/**
 * Cambio de turno (Fase 5 — Slice 1). Orquesta el ciclo FIJO de 3 pasos:
 * compilar (get-or-create + sync de la baton) → firma del SALIENTE (Part 11) →
 * acuse del ENTRANTE (Part 11). El cockpit se compila EN VIVO mientras se arma y
 * se CONGELA en `snapshot` al firmar (integridad/auditoría). El resumen del Slice
 * 1 es DETERMINISTA (`provider = none`); el resumen por IA se enchufa después
 * detrás de la misma columna (Slice 2/3).
 */
@Injectable()
export class ShiftHandoverService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly compiler: ShiftHandoverCompilerService,
    private readonly reauth: ReauthService,
    private readonly audit: AuditService,
    private readonly shiftResolver: ShiftResolver,
    private readonly emitter: NotificationEmitterService,
    private readonly ai: AiService,
  ) {}

  // === Compilación (get-or-create del turno actual) ===========================

  async compile(userId: string, dto: CompileHandoverRequest, ctx: AuditContext): Promise<ShiftHandoverDetail> {
    await this.assertNodeAccess(userId, dto.orgNodeId);
    const at = dto.at ? new Date(dto.at) : new Date();
    const scope = await this.resolveScope(dto.orgNodeId, at);

    // Get-or-create: una entrega por (nodo, turno saliente, día operacional) no anulada.
    const existing = await this.prisma.shiftHandover.findFirst({
      where: {
        orgNodeId: scope.orgNodeId,
        shiftCode: scope.shiftCode,
        operationalDay: scope.operationalDay,
        status: { not: "CANCELED" },
      },
      include: { items: true },
    });

    let handover = existing;
    if (!handover) {
      const created = await this.prisma.shiftHandover.create({
        data: {
          orgNodeId: scope.orgNodeId,
          shiftCode: scope.shiftCode,
          shiftLabel: scope.shiftLabel,
          incomingShiftCode: scope.incomingShiftCode,
          operationalDay: scope.operationalDay,
          windowStart: scope.windowStart,
          windowEnd: scope.windowEnd,
          timezone: scope.timezone,
          calendarId: scope.calendarId,
          status: "COMPILING",
          summaryProvider: "none",
          createdById: userId,
        },
        include: { items: true },
      });
      await this.addActivity(created.id, "CREATED", `Entrega ${shiftHandoverCode(created.number)} iniciada`, ctx);
      await this.rollBatonFromPrevious(created.id, scope);
      handover = await this.loadHandover(created.id);
    }

    // Sólo se sincroniza/recompila mientras está en borrador.
    if (handover.status === "COMPILING") {
      const cockpit = await this.compiler.compile(userId, this.toCompileScope(handover, scope));
      await this.syncBaton(handover.id, cockpit);
      handover = await this.loadHandover(handover.id);
    }

    await this.audit.record({ ...ctx, action: "shifthandover.compiled", entityType: "ShiftHandover", entityId: handover.id });
    return this.toDetail(userId, handover);
  }

  // === Lectura ===============================================================

  async getDetail(userId: string, id: string): Promise<ShiftHandoverDetail> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    return this.toDetail(userId, handover);
  }

  /**
   * Exporta el ACTA de entrega de turno en PDF (Fase 5 — Slice 4). Se arma del
   * snapshot CONGELADO (vía `toDetail`, que sirve el snapshot cuando la entrega ya
   * está firmada) ⇒ fiel e inmutable (AC-PDF-1). Reusa el permiso de lectura (gate
   * en el controller); el alcance de dato (ABAC por nodo) lo impone aquí (AC-PDF-4).
   * Gobernanza (fork d): el acta OFICIAL solo existe desde SIGNED_OUT/ACKNOWLEDGED;
   * en COMPILING/CANCELED se rechaza con 409 (no hay snapshot ni firmas). Cada
   * exportación se AUDITA con el folio + hash de integridad (AC-PDF-5).
   */
  async exportActa(userId: string, id: string, ctx: AuditContext): Promise<{ buffer: Buffer; filename: string; code: string }> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    if (handover.status === "COMPILING" || handover.status === "CANCELED") {
      throw new ConflictException("El acta oficial solo está disponible para una entrega firmada (SIGNED_OUT/ACKNOWLEDGED).");
    }

    const detail = await this.toDetail(userId, handover);
    const nodePathLabel = await this.resolveNodePathLabel(handover.orgNodeId);
    const integrityHash = actaIntegrityHash(detail);
    const exporter = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true, email: true } });
    const exportedByName = exporter?.displayName ?? exporter?.email ?? "—";

    const doc = buildActaDocument({
      detail,
      nodePathLabel,
      integrityHash,
      exportedAt: new Date().toISOString(),
      exportedByName,
    });
    const buffer = await renderActaPdf(doc);

    await this.audit.record({
      ...ctx,
      action: "shifthandover.acta.exported",
      entityType: "ShiftHandover",
      entityId: handover.id,
      after: { code: detail.code, status: handover.status, integrityHash },
    });

    return { buffer, filename: actaFilename(detail.code, detail.nodeName, detail.operationalDay), code: detail.code };
  }

  /** Cadena legible de ancestros del nodo ("Planta › Área › Línea") para el encabezado del acta. */
  private async resolveNodePathLabel(nodeId: string): Promise<string> {
    const node = await this.prisma.orgNode.findUnique({ where: { id: nodeId }, select: { path: true } });
    const ids = (node?.path ?? "").split("/").filter(Boolean);
    const ancestorIds = ids.slice(0, -1); // el último id es el nodo mismo (ya se muestra como "Nodo")
    if (ancestorIds.length === 0) return "";
    const ancestors = await this.prisma.orgNode.findMany({ where: { id: { in: ancestorIds } }, select: { id: true, name: true } });
    const byId = new Map(ancestors.map((n) => [n.id, n.name]));
    return ancestorIds.map((i) => byId.get(i) ?? "…").join(" › ");
  }

  async list(userId: string, q: ShiftHandoverListQuery): Promise<ShiftHandoverListResponse> {
    const accessible = await this.scope.getAccessibleNodeIds(userId);
    if (accessible && accessible.size === 0) return { items: [], total: 0, page: q.page, pageSize: q.pageSize };

    const where: Prisma.ShiftHandoverWhereInput = {
      ...(accessible ? { orgNodeId: { in: [...accessible] } } : {}),
      ...(q.orgNodeId ? { orgNodeId: q.orgNodeId } : {}),
      ...(q.shiftCode ? { shiftCode: q.shiftCode } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(q.fromDay || q.toDay
        ? { operationalDay: { ...(q.fromDay ? { gte: q.fromDay } : {}), ...(q.toDay ? { lte: q.toDay } : {}) } }
        : {}),
    };
    if (q.search && q.search.trim()) {
      const term = q.search.trim();
      const numMatch = term.match(/(\d+)/);
      where.OR = [
        { outgoingByName: { contains: term, mode: "insensitive" } },
        { incomingByName: { contains: term, mode: "insensitive" } },
        ...(numMatch ? [{ number: Number(numMatch[1]) }] : []),
      ];
    }

    const [total, rows] = await Promise.all([
      this.prisma.shiftHandover.count({ where }),
      this.prisma.shiftHandover.findMany({
        where,
        include: { items: { select: { status: true } }, orgNode: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
      }),
    ]);
    return {
      items: rows.map((r) => this.toListItem(r, r.orgNode.name, r.items)),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  // === Edición del borrador ==================================================

  async updateSummary(userId: string, id: string, dto: UpdateHandoverSummaryRequest, _ctx: AuditContext): Promise<ShiftHandoverDetail> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    this.assertCompiling(handover);

    let summaryText: string | undefined = dto.summaryText;
    // Texto manual ⇒ "none"; salvo que el cockpit PERSISTA un texto generado por IA en vivo
    // (streaming, Slice 3): manda `summaryProvider` para conservar la procedencia sin re-generar.
    let summaryProvider: string | undefined =
      summaryText !== undefined ? (dto.summaryProvider ?? "none") : undefined;

    if (dto.regenerate || (summaryText === undefined && dto.generalStatus)) {
      const generalStatus = dto.generalStatus ?? (handover.generalStatus as HandoverGeneralStatus | null);
      const { fallbackText, grounding } = await this.buildSummaryInputs(userId, handover, generalStatus);

      if (dto.regenerate && dto.useAi) {
        // Resumen por IA: GROUNDED al cockpit congelado, con degradación elegante a determinista.
        const res = await this.ai.generateSummary({ fallbackText, grounding }, { handoverId: id, userId });
        summaryText = res.text;
        summaryProvider = res.generatedByAi ? res.provider : "none";
      } else {
        summaryText = fallbackText;
        summaryProvider = "none";
      }
    }

    await this.prisma.shiftHandover.update({
      where: { id },
      data: {
        generalStatus: dto.generalStatus ?? undefined,
        summaryText: summaryText ?? undefined,
        summaryProvider: summaryProvider ?? undefined,
        updatedAt: new Date(),
      },
    });
    return this.toDetail(userId, await this.loadHandover(id));
  }

  /**
   * Arma los insumos del resumen (determinista + grounding) recompilando el cockpit EN VIVO.
   * Compartido por `updateSummary` (no-streaming) y `streamSummary` (SSE) para que ambos usen
   * exactamente la misma fuente de verdad (AC-IA-2). Resuelve el nombre del nodo (como toDetail).
   */
  private async buildSummaryInputs(
    userId: string,
    handover: HandoverWithRelations,
    generalStatus: HandoverGeneralStatus | null,
  ): Promise<{ fallbackText: string; grounding: SummaryGrounding }> {
    const node = await this.prisma.orgNode.findUnique({ where: { id: handover.orgNodeId }, select: { name: true, path: true } });
    const cockpit = await this.compiler.compile(userId, {
      ...this.toCompileScope(handover, null),
      nodeName: node?.name ?? "—",
      nodePath: node?.path ?? "",
      incomingShiftLabel: null,
    });
    const openItems = handover.items.filter((i) => isHandoverItemOpen(i.status)).map((i) => ({ title: i.title }));
    const generalStatusLabel = generalStatus ? GENERAL_STATUS_LABELS[generalStatus] : undefined;
    const fallbackText = buildDeterministicSummary(cockpit, openItems, { generalStatus, generalStatusLabel });
    const grounding = this.buildSummaryGrounding(cockpit, openItems, generalStatusLabel ?? "Sin declarar");
    return { fallbackText, grounding };
  }

  /**
   * Resumen de turno por IA en STREAMING (Slice 3). Verifica acceso por nodo (ABAC) y que la
   * entrega esté en COMPILING, recompila el cockpit EN VIVO para el grounding y delega en el
   * gateway de IA, que emite los deltas + el cierre. El cockpit PERSISTE el texto final aparte
   * (PATCH auditado): este generador NO escribe en la entrega. La firma sigue siendo humana.
   */
  async *streamSummary(
    userId: string,
    id: string,
    generalStatusOverride: HandoverGeneralStatus | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<SummaryStreamEvent> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    this.assertCompiling(handover);
    const generalStatus = generalStatusOverride ?? (handover.generalStatus as HandoverGeneralStatus | null);
    const { fallbackText, grounding } = await this.buildSummaryInputs(userId, handover, generalStatus);
    yield* this.ai.streamSummary({ fallbackText, grounding }, { handoverId: id, userId }, signal);
  }

  /**
   * Puente dominio→IA: arma el grounding (datos CONGELADOS) que el resumen por IA puede usar.
   * Mapea el cockpit compilado a la estructura genérica de `@lyra/llm` (AC-IA-2). Nada que no
   * esté aquí puede aparecer en el resumen generado.
   */
  private buildSummaryGrounding(
    cockpit: HandoverCockpit,
    openItems: readonly { title: string }[],
    generalStatusLabel: string,
  ): SummaryGrounding {
    const tz = cockpit.scope.timezone;
    return {
      nodeName: cockpit.scope.nodeName,
      shiftLabel: cockpit.scope.shiftLabel ?? cockpit.scope.shiftCode ?? "turno",
      operationalDay: cockpit.scope.operationalDay,
      generalStatusLabel,
      entriesCount: cockpit.entries.length,
      incidents: cockpit.incidents.map((i) => ({
        folio: i.folio,
        title: i.title,
        typeName: i.typeName,
        severity: i.severity,
        critical: i.critical,
        overdue: i.overdue,
        dueLabel: this.formatDueLabel(i.dueAt, tz),
        stateName: i.stateName,
      })),
      exceptions: cockpit.exceptions.map((e) => ({ kind: e.kind, detail: e.detail, fieldLabel: e.fieldLabel })),
      followups: cockpit.followups.map((f) => ({
        kind: f.kind,
        code: f.code,
        title: f.title,
        incidentFolio: f.incidentFolio,
        overdue: f.overdue,
        dueLabel: this.formatDueLabel(f.dueAt, tz),
      })),
      rounds: {
        done: cockpit.rounds.filter((r) => r.status === "COMPLETED").length,
        overdue: cockpit.rounds.filter((r) => r.status === "OVERDUE").length,
        total: cockpit.rounds.length,
      },
      openItems: openItems.map((i) => i.title),
    };
  }

  /** Plazo formateado (es-CL + TZ del nodo) para el grounding; null si no hay. El modelo solo lo cita. */
  private formatDueLabel(iso: string | null, tz: string): string | null {
    if (!iso) return null;
    return new Intl.DateTimeFormat("es-CL", {
      timeZone: tz,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  }

  async addItem(userId: string, id: string, dto: AddHandoverItemRequest, ctx: AuditContext): Promise<ShiftHandoverDetail> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    this.assertCompiling(handover);
    const maxSort = handover.items.reduce((m, i) => Math.max(m, i.sortOrder), 0);
    await this.prisma.shiftHandoverItem.create({
      data: {
        handoverId: id,
        source: "MANUAL",
        status: "OPEN",
        title: dto.title,
        detail: dto.detail ?? null,
        category: dto.category ?? null,
        severity: dto.severity ?? null,
        originHandoverId: id,
        sortOrder: maxSort + 1,
      },
    });
    await this.addActivity(id, "ITEM_ADDED", `Pendiente agregado: ${dto.title}`, ctx);
    return this.toDetail(userId, await this.loadHandover(id));
  }

  async updateItem(userId: string, id: string, itemId: string, dto: UpdateHandoverItemRequest, ctx: AuditContext): Promise<ShiftHandoverDetail> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    const item = handover.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundException("Pendiente no encontrado");
    // Cerrar/reabrir un pendiente se permite mientras la entrega no esté reconocida.
    if (handover.status === "ACKNOWLEDGED" || handover.status === "CANCELED") {
      throw new BadRequestException("La entrega ya no admite cambios en sus pendientes");
    }
    await this.prisma.shiftHandoverItem.update({
      where: { id: itemId },
      data: {
        status: dto.status ?? undefined,
        title: dto.title ?? undefined,
        detail: dto.detail === undefined ? undefined : dto.detail,
        updatedAt: new Date(),
      },
    });
    if (dto.status === "CLOSED") await this.addActivity(id, "ITEM_CLOSED", `Pendiente cerrado: ${item.title}`, ctx);
    return this.toDetail(userId, await this.loadHandover(id));
  }

  // === Firma (saliente) y acuse (entrante) — Part 11 =========================

  async signOut(userId: string, id: string, dto: SignOutHandoverRequest, ctx: AuditContext): Promise<ShiftHandoverDetail> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    this.assertCompiling(handover);

    // Re-autenticación Part 11 (§11.200). MFA = futuro configurable; aquí se acepta si lo trae.
    const reauth = await this.reauth.verifyForSignature(userId, { password: dto.password, mfaCode: dto.mfaCode }, { requireMfa: false });

    // Compila el cockpit definitivo y lo CONGELA como snapshot.
    const cockpit = await this.compiler.compile(userId, this.toCompileScope(handover, null));
    const openItems = handover.items.filter((i) => isHandoverItemOpen(i.status)).map((i) => ({ title: i.title }));
    const summaryText =
      handover.summaryText ??
      buildDeterministicSummary(cockpit, openItems, {
        generalStatus: dto.generalStatus,
        generalStatusLabel: GENERAL_STATUS_LABELS[dto.generalStatus],
      });
    const meaning = `Entrego el ${handover.shiftLabel ?? handover.shiftCode ?? "turno"} y certifico que la información es veraz y completa.`;
    const now = new Date();

    await this.prisma.shiftHandover.update({
      where: { id },
      data: {
        status: "SIGNED_OUT",
        generalStatus: dto.generalStatus,
        summaryText,
        summaryProvider: handover.summaryProvider ?? "none",
        snapshot: cockpit as unknown as Prisma.InputJsonValue,
        snapshotAt: now,
        outgoingById: userId,
        outgoingByName: reauth.signerName,
        signedOutAt: now,
        signOutMeaning: meaning,
        signOutMethod: reauth.method,
      },
    });
    await this.addActivity(id, "SIGNED_OUT", `Turno entregado y firmado por ${reauth.signerName}`, ctx, reauth.signerName);
    await this.audit.record({
      ...ctx,
      action: "shifthandover.signed_out",
      entityType: "ShiftHandover",
      entityId: id,
      after: { generalStatus: dto.generalStatus, method: reauth.method },
    });

    // Aviso al turno entrante (Bloque N): correo + campanita, ABAC en el resolver.
    await this.emitHandoverReady(id, handover, reauth.signerName, dto.generalStatus, openItems.length);

    return this.toDetail(userId, await this.loadHandover(id));
  }

  async acknowledge(userId: string, id: string, dto: AcknowledgeHandoverRequest, ctx: AuditContext): Promise<ShiftHandoverDetail> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    if (handover.status !== "SIGNED_OUT") throw new BadRequestException("La entrega no está firmada o ya fue reconocida");
    // Segregación de funciones: el entrante NO puede ser el mismo que entregó.
    if (handover.outgoingById && handover.outgoingById === userId) {
      throw new BadRequestException("El turno entrante debe ser una persona distinta de quien entregó");
    }

    const reauth = await this.reauth.verifyForSignature(userId, { password: dto.password, mfaCode: dto.mfaCode }, { requireMfa: false });
    const meaning = `Recibo el ${handover.shiftLabel ?? handover.shiftCode ?? "turno"} y acuso recibo del resumen y los pendientes.`;
    const now = new Date();

    await this.prisma.shiftHandover.update({
      where: { id },
      data: {
        status: "ACKNOWLEDGED",
        incomingById: userId,
        incomingByName: reauth.signerName,
        acknowledgedAt: now,
        ackMeaning: meaning,
        ackMethod: reauth.method,
        ackReadSummary: dto.readSummary,
        ackReviewedItems: dto.reviewedItems,
        ackNoObservations: dto.noObservations,
        ackObservations: dto.observations ?? null,
      },
    });
    await this.addActivity(id, "ACKNOWLEDGED", `Turno recibido y reconocido por ${reauth.signerName}`, ctx, reauth.signerName);
    await this.audit.record({
      ...ctx,
      action: "shifthandover.acknowledged",
      entityType: "ShiftHandover",
      entityId: id,
      after: { noObservations: dto.noObservations, method: reauth.method },
    });
    return this.toDetail(userId, await this.loadHandover(id));
  }

  async cancel(userId: string, id: string, dto: CancelHandoverRequest, ctx: AuditContext): Promise<ShiftHandoverDetail> {
    const handover = await this.loadHandover(id);
    await this.assertNodeAccess(userId, handover.orgNodeId);
    if (handover.status === "ACKNOWLEDGED") throw new BadRequestException("Una entrega reconocida no puede anularse");
    if (handover.status === "CANCELED") throw new BadRequestException("La entrega ya está anulada");
    await this.prisma.shiftHandover.update({
      where: { id },
      data: { status: "CANCELED", canceledAt: new Date(), cancelReason: dto.reason, canceledById: userId },
    });
    await this.addActivity(id, "CANCELED", `Entrega anulada: ${dto.reason}`, ctx);
    await this.audit.record({ ...ctx, action: "shifthandover.canceled", entityType: "ShiftHandover", entityId: id, after: { reason: dto.reason } });
    return this.toDetail(userId, await this.loadHandover(id));
  }

  // === Baton (rolling) =======================================================

  /** Copia los pendientes MANUALES abiertos de la entrega previa del nodo como CARRIED. */
  private async rollBatonFromPrevious(newId: string, scope: ResolvedScope): Promise<void> {
    const prev = await this.prisma.shiftHandover.findFirst({
      where: { orgNodeId: scope.orgNodeId, id: { not: newId }, status: { not: "CANCELED" } },
      orderBy: [{ createdAt: "desc" }],
      include: { items: true },
    });
    if (!prev) return;
    const carry = prev.items.filter((i) => i.source === "MANUAL" && isHandoverItemOpen(i.status));
    if (carry.length === 0) return;
    await this.prisma.shiftHandoverItem.createMany({
      data: carry.map((i, idx) => ({
        handoverId: newId,
        source: "MANUAL" as const,
        status: "CARRIED" as const,
        title: i.title,
        detail: i.detail,
        category: i.category,
        severity: i.severity,
        originHandoverId: i.originHandoverId ?? prev.id,
        sortOrder: idx + 1,
      })),
    });
  }

  /**
   * Sincroniza los ítems de la baton derivados del DOMINIO con el cockpit vivo:
   * agrega ítems para objetos abiertos no presentes, y CIERRA los ítems cuyo
   * objeto referenciado ya no está abierto. Los ítems MANUALES no se tocan.
   */
  private async syncBaton(handoverId: string, cockpit: HandoverCockpit): Promise<void> {
    const items = await this.prisma.shiftHandoverItem.findMany({ where: { handoverId } });
    const byRef = new Map(items.filter((i) => i.refType && i.refId).map((i) => [`${i.refType}|${i.refId}`, i]));

    type Desired = { refType: string; refId: string; source: "INCIDENT" | "INCIDENT_ACTION" | "INCIDENT_REPORT"; title: string; detail: string | null; category: string; severity: number | null };
    const desired: Desired[] = [];
    for (const inc of cockpit.incidents) {
      desired.push({ refType: "Incident", refId: inc.id, source: "INCIDENT", title: `${inc.folio} · ${inc.title}`, detail: inc.stateName, category: "INCIDENTS", severity: inc.severity });
    }
    for (const f of cockpit.followups.filter((x) => x.overdue || x.status === "OPEN" || x.status === "IN_PROGRESS" || x.status === "PENDING")) {
      desired.push({
        refType: f.kind === "ACTION" ? "IncidentAction" : "IncidentReport",
        refId: f.id,
        source: f.kind === "ACTION" ? "INCIDENT_ACTION" : "INCIDENT_REPORT",
        title: `${f.code} · ${f.title}`,
        detail: f.incidentFolio,
        category: "FOLLOWUP",
        severity: null,
      });
    }

    const desiredKeys = new Set(desired.map((d) => `${d.refType}|${d.refId}`));
    let sort = items.reduce((m, i) => Math.max(m, i.sortOrder), 0);
    const toCreate: Prisma.ShiftHandoverItemCreateManyInput[] = [];
    for (const d of desired) {
      if (byRef.has(`${d.refType}|${d.refId}`)) continue;
      toCreate.push({
        handoverId,
        source: d.source,
        status: "OPEN",
        refType: d.refType,
        refId: d.refId,
        title: d.title,
        detail: d.detail,
        category: d.category,
        severity: d.severity,
        originHandoverId: handoverId,
        sortOrder: ++sort,
      });
    }
    if (toCreate.length > 0) await this.prisma.shiftHandoverItem.createMany({ data: toCreate });

    // Cierra los ítems de dominio cuyo objeto ya no está abierto.
    const staleIds = items
      .filter((i) => i.source !== "MANUAL" && i.refType && i.refId && isHandoverItemOpen(i.status) && !desiredKeys.has(`${i.refType}|${i.refId}`))
      .map((i) => i.id);
    if (staleIds.length > 0) {
      await this.prisma.shiftHandoverItem.updateMany({ where: { id: { in: staleIds } }, data: { status: "CLOSED" } });
    }
  }

  // === Notificación al entrante ==============================================

  private async emitHandoverReady(
    id: string,
    handover: HandoverWithRelations,
    outgoingByName: string,
    generalStatus: HandoverGeneralStatus,
    openItemCount: number,
  ): Promise<void> {
    await this.emitter.emit(
      "handover.ready",
      {
        handoverId: id,
        orgNodeId: handover.orgNodeId,
        incomingShiftCode: handover.incomingShiftCode,
        shiftLabel: handover.shiftLabel,
        outgoingByName,
        generalStatus,
        openItemCount,
      },
      { dedupeKey: `handover.ready|${id}` },
    );
  }

  // === Scope / construcción ==================================================

  private async resolveScope(orgNodeId: string, at: Date): Promise<ResolvedScope> {
    const node = await this.prisma.orgNode.findFirst({ where: { id: orgNodeId, deletedAt: null }, select: { id: true, name: true, path: true } });
    if (!node) throw new NotFoundException("Nodo no encontrado");
    const cal = await this.shiftResolver.calendarForNode(orgNodeId);
    const withCal = await this.shiftResolver.resolveWithCalendar(at, orgNodeId);
    if (!cal) {
      // Sin calendario: degradación elegante (día civil, sin turno).
      const day = at.toISOString().slice(0, 10);
      const start = new Date(`${day}T00:00:00.000Z`);
      return {
        orgNodeId: node.id,
        nodeName: node.name,
        nodePath: node.path,
        shiftCode: null,
        shiftLabel: null,
        incomingShiftCode: null,
        incomingShiftLabel: null,
        operationalDay: day,
        windowStart: start,
        windowEnd: new Date(start.getTime() + 24 * 60 * 60 * 1000),
        timezone: "UTC",
        calendarId: null,
      };
    }
    const w = resolveHandoverWindow(at, cal);
    return {
      orgNodeId: node.id,
      nodeName: node.name,
      nodePath: node.path,
      shiftCode: w.shiftCode,
      shiftLabel: w.shiftLabel,
      incomingShiftCode: w.incomingShiftCode,
      incomingShiftLabel: w.incomingShiftLabel,
      operationalDay: w.operationalDay,
      windowStart: w.windowStart,
      windowEnd: w.windowEnd,
      timezone: cal.timezone,
      calendarId: withCal?.calendarId ?? null,
    };
  }

  /** CompileScope desde una entrega ya persistida (+ datos de nodo del scope si lo tenemos). */
  private toCompileScope(handover: ShiftHandover, scope: ResolvedScope | null): CompileScope {
    return {
      orgNodeId: handover.orgNodeId,
      nodeName: scope?.nodeName ?? "",
      nodePath: scope?.nodePath ?? "",
      shiftCode: handover.shiftCode,
      shiftLabel: handover.shiftLabel,
      incomingShiftCode: handover.incomingShiftCode,
      incomingShiftLabel: scope?.incomingShiftLabel ?? null,
      operationalDay: handover.operationalDay,
      windowStart: handover.windowStart,
      windowEnd: handover.windowEnd,
      timezone: handover.timezone,
    };
  }

  private async toDetail(userId: string, handover: HandoverWithRelations): Promise<ShiftHandoverDetail> {
    const node = await this.prisma.orgNode.findUnique({ where: { id: handover.orgNodeId }, select: { name: true, path: true } });
    const nodeName = node?.name ?? "—";

    let cockpit: HandoverCockpit;
    let frozen: boolean;
    if (handover.status === "COMPILING") {
      cockpit = await this.compiler.compile(userId, {
        ...this.toCompileScope(handover, null),
        nodeName,
        nodePath: node?.path ?? "",
        incomingShiftLabel: null,
      });
      frozen = false;
    } else if (handover.snapshot) {
      cockpit = handover.snapshot as unknown as HandoverCockpit;
      frozen = true;
    } else {
      cockpit = await this.compiler.compile(userId, { ...this.toCompileScope(handover, null), nodeName, nodePath: node?.path ?? "", incomingShiftLabel: null });
      frozen = false;
    }

    const activities = await this.prisma.shiftHandoverActivity.findMany({
      where: { handoverId: handover.id },
      orderBy: { occurredAt: "asc" },
    });

    const base = this.toListItem(handover, nodeName, handover.items);
    return {
      ...base,
      summaryText: handover.summaryText,
      summaryProvider: handover.summaryProvider,
      cockpit,
      frozen,
      items: handover.items
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((i) => ({
          id: i.id,
          source: i.source,
          status: i.status,
          refType: i.refType,
          refId: i.refId,
          title: i.title,
          detail: i.detail,
          category: i.category,
          severity: i.severity,
          originHandoverId: i.originHandoverId,
          sortOrder: i.sortOrder,
          createdAt: i.createdAt.toISOString(),
        })),
      signOut: {
        byId: handover.outgoingById,
        byName: handover.outgoingByName,
        at: handover.signedOutAt?.toISOString() ?? null,
        meaning: handover.signOutMeaning,
        method: handover.signOutMethod,
      },
      acknowledgement: {
        byId: handover.incomingById,
        byName: handover.incomingByName,
        at: handover.acknowledgedAt?.toISOString() ?? null,
        meaning: handover.ackMeaning,
        method: handover.ackMethod,
      },
      ackState: {
        readSummary: handover.ackReadSummary,
        reviewedItems: handover.ackReviewedItems,
        noObservations: handover.ackNoObservations,
        observations: handover.ackObservations,
      },
      cancelReason: handover.cancelReason,
      activities: activities.map((a) => ({
        id: a.id,
        kind: a.kind,
        summary: a.summary,
        actorName: a.actorName,
        occurredAt: a.occurredAt.toISOString(),
      })),
      canSign: handover.status === "COMPILING",
      canAcknowledge: handover.status === "SIGNED_OUT" && handover.outgoingById !== userId,
    };
  }

  private toListItem(handover: ShiftHandover, nodeName: string, items: { status: string }[]): ShiftHandoverListItem {
    return {
      id: handover.id,
      code: shiftHandoverCode(handover.number),
      status: handover.status,
      orgNodeId: handover.orgNodeId,
      nodeName,
      shiftCode: handover.shiftCode,
      shiftLabel: handover.shiftLabel,
      operationalDay: handover.operationalDay,
      generalStatus: handover.generalStatus as HandoverGeneralStatus | null,
      outgoingByName: handover.outgoingByName,
      incomingByName: handover.incomingByName,
      signedOutAt: handover.signedOutAt?.toISOString() ?? null,
      acknowledgedAt: handover.acknowledgedAt?.toISOString() ?? null,
      openItemCount: items.filter((i) => i.status === "OPEN" || i.status === "CARRIED").length,
      createdAt: handover.createdAt.toISOString(),
    };
  }

  // === helpers ===============================================================

  private async loadHandover(id: string): Promise<HandoverWithRelations> {
    const row = await this.prisma.shiftHandover.findUnique({ where: { id }, include: { items: true } });
    if (!row) throw new NotFoundException("Entrega de turno no encontrada");
    return row;
  }

  private assertCompiling(handover: ShiftHandover): void {
    if (handover.status !== "COMPILING") throw new BadRequestException("La entrega ya fue firmada o anulada");
  }

  private async assertNodeAccess(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
  }

  private async addActivity(handoverId: string, kind: string, summary: string, ctx: AuditContext, actorName?: string | null): Promise<void> {
    await this.prisma.shiftHandoverActivity.create({
      data: { handoverId, kind, summary, actorId: ctx.actorId ?? null, actorName: actorName ?? null },
    });
  }
}

/** Alcance resuelto del turno (nodo + ventana + calendario). */
interface ResolvedScope extends CompileScope {
  calendarId: string | null;
}
