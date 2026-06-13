import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  LogEntryChangesResponse,
  LogEntryFieldChangeDto,
  LogEntryIndicators,
  LogEntryListItem,
  LogEntryListQuery,
  LogEntryListResponse,
  LogEntrySortField,
  LogEntryStats,
  LogEntrySummaryValue,
  LogEntryTimelineEvent,
  LogEntryTimelineResponse,
  RelatedLogEntries,
  SignatureVerifyResult,
  SignatureVerifyVerdict,
  ThresholdBand,
  TimelineQuery,
} from "@lyra/contracts";
import { canonicalSignaturePayload, formatEntryFolio, upgradeFieldConfig } from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { ScopeService } from "../authz/scope.service";
import { toCsv } from "../common/csv";
import { EncryptionService } from "../crypto/encryption.service";
import { PrismaService } from "../prisma/prisma.service";
import { LogEntriesService } from "./log-entries.service";

/** Relaciones mínimas para pintar una fila del listado (payload LIGERO: sin valores). */
const listInclude = {
  template: { select: { name: true, gridFieldKeys: true } },
  templateVersion: { select: { versionNumber: true } },
  orgNode: { select: { name: true } },
  equipment: { select: { name: true, tag: true } },
} satisfies Prisma.LogEntryInclude;

type ListRow = Prisma.LogEntryGetPayload<{ include: typeof listInclude }>;

/** Cursor keyset del listado (opaco para el cliente). */
interface ListCursor {
  s: LogEntrySortField;
  d: "asc" | "desc";
  /** Valor del campo de orden de la última fila (ISO para fechas, número para folio). */
  v: string | number;
  id: string;
}

/** Cursor de timeline / log de cambios: instante + id del último evento emitido. */
interface TimeCursor {
  t: string;
  id: string;
}

function encodeCursor(cursor: unknown): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor<T>(raw: string): T | null {
  try {
    return JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

/**
 * Lado de LECTURA del módulo de Bitácoras (Fase 2.6): listado enterprise con
 * filtros + keyset, KPIs, export CSV, audit trail unificado, log de cambios,
 * relaciones y verificación de integridad de firmas. Separado del lado de
 * ESCRITURA (`LogEntriesService`, que conserva crear/guardar/transicionar) para
 * que ninguno de los dos crezca inmanejable; reusa sus helpers internos.
 *
 * Regla de oro: TODOS los filtros y el ABAC se aplican aquí, en SQL; el cliente
 * jamás filtra autorización.
 */
@Injectable()
export class LogbookQueryService {
  /** Tope de filas por exportación (espejo de AuditService.EXPORT_MAX_ROWS). */
  static readonly EXPORT_MAX_ROWS = 100_000;
  /** Tamaño de página por defecto del listado. */
  static readonly DEFAULT_TAKE = 50;
  /** Entradas relacionadas por panel (contexto, no un listado). */
  static readonly RELATED_TAKE = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly enc: EncryptionService,
    private readonly entries: LogEntriesService,
  ) {}

  // --- Listado (grilla /bitacoras) --------------------------------------------

  async list(userId: string, query: LogEntryListQuery): Promise<LogEntryListResponse> {
    const where = await this.buildWhere(userId, query);
    const sort: LogEntrySortField = query.sort ?? "recordedAt";
    const dir = query.dir ?? "desc";
    const take = query.take ?? LogbookQueryService.DEFAULT_TAKE;

    const cursorWhere = this.cursorWhere(query.cursor, sort, dir);
    const rows = await this.prisma.logEntry.findMany({
      where: cursorWhere ? { AND: [where, cursorWhere] } : where,
      orderBy: [{ [sort]: dir }, { id: dir }],
      take: take + 1, // +1 para saber si hay página siguiente
      include: listInclude,
    });

    const page = rows.slice(0, take);
    const items = await this.enrich(page);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > take && last
        ? encodeCursor({ s: sort, d: dir, v: this.sortValueOf(last, sort), id: last.id } satisfies ListCursor)
        : null;
    return { items, nextCursor };
  }

  /** KPIs del set filtrado (mismo `where` que el listado). */
  async stats(userId: string, query: LogEntryListQuery): Promise<LogEntryStats> {
    const where = await this.buildWhere(userId, query);
    const [total, byStatus, pendingSignatures, withCrit, withWarn] = await Promise.all([
      this.prisma.logEntry.count({ where }),
      this.prisma.logEntry.groupBy({ by: ["status"], where, _count: { _all: true } }),
      this.prisma.logEntry.count({
        where: { AND: [where, { sections: { some: { requiresSignature: true, signatureId: null } } }] },
      }),
      this.prisma.logEntry.count({ where: { AND: [where, { values: { some: { thresholdBand: "CRIT" } } }] } }),
      this.prisma.logEntry.count({ where: { AND: [where, { values: { some: { thresholdBand: "WARN" } } }] } }),
    ]);

    const statusCount = { DRAFT: 0, SUBMITTED: 0, VOID: 0 };
    for (const row of byStatus) statusCount[row.status] = row._count._all;
    return { total, byStatus: statusCount, pendingSignatures, withCrit, withWarn };
  }

  /**
   * Exporta el set COMPLETO filtrado a CSV (`;` + BOM para Excel es-CL), iterando
   * por keyset en lotes (espejo del patrón de /security/audit/export).
   */
  async exportCsv(userId: string, query: LogEntryListQuery): Promise<{ csv: string; truncated: boolean }> {
    const where = await this.buildWhere(userId, query);
    const sort: LogEntrySortField = query.sort ?? "recordedAt";
    const dir = query.dir ?? "desc";

    const items: LogEntryListItem[] = [];
    let truncated = false;
    let cursor: ListCursor | null = null;
    const BATCH = 1000;

    for (;;) {
      const cursorWhere = cursor ? this.keysetWhere(cursor) : null;
      const rows: ListRow[] = await this.prisma.logEntry.findMany({
        where: cursorWhere ? { AND: [where, cursorWhere] } : where,
        orderBy: [{ [sort]: dir }, { id: dir }],
        take: BATCH,
        include: listInclude,
      });
      if (rows.length === 0) break;
      items.push(...(await this.enrich(rows)));
      if (items.length >= LogbookQueryService.EXPORT_MAX_ROWS) {
        items.length = LogbookQueryService.EXPORT_MAX_ROWS;
        truncated = true;
        break;
      }
      if (rows.length < BATCH) break;
      const last = rows[rows.length - 1]!;
      cursor = { s: sort, d: dir, v: this.sortValueOf(last, sort), id: last.id };
    }

    const csv = toCsv(
      items,
      [
        { header: "Folio", value: (r) => formatEntryFolio(r.entryNumber) },
        { header: "Plantilla", value: (r) => r.templateName },
        { header: "Versión", value: (r) => r.templateVersionNumber },
        { header: "Nodo", value: (r) => r.orgNodeName },
        { header: "Ruta", value: (r) => r.orgNodePath },
        { header: "Estado del flujo", value: (r) => r.currentStateName ?? r.currentStateKey },
        { header: "Estado", value: (r) => r.status },
        { header: "Turno", value: (r) => r.shiftCode },
        { header: "Día operacional", value: (r) => r.operationalDate },
        { header: "Periodo", value: (r) => r.periodKey },
        { header: "Fecha efectiva (ISO)", value: (r) => r.effectiveAt },
        { header: "Capturada (ISO)", value: (r) => r.recordedAt },
        { header: "Sellada (ISO)", value: (r) => r.sealedAt },
        { header: "Origen", value: (r) => r.entryOrigin },
        { header: "Fecha evento declarada (ISO)", value: (r) => r.declaredEffectiveAt },
        { header: "Motivo diferido", value: (r) => r.deferredReason },
        { header: "Autor", value: (r) => r.createdByName },
        { header: "Equipo", value: (r) => r.equipmentName },
        { header: "Secciones completadas", value: (r) => r.indicators.sectionsCompleted },
        { header: "Secciones totales", value: (r) => r.indicators.sectionsTotal },
        { header: "Firmas", value: (r) => r.indicators.signaturesCount },
        { header: "Firmas pendientes", value: (r) => r.indicators.pendingSignatures },
        { header: "Transiciones", value: (r) => r.indicators.transitionsCount },
        { header: "Banda de umbral", value: (r) => r.indicators.worstThresholdBand },
      ],
      ";",
    );
    return { csv, truncated };
  }

  // --- Audit trail unificado / log de cambios ----------------------------------

  /**
   * Línea de tiempo ALCOA+ de la entrada: fusión cronológica (DESC) de creación,
   * cambios por campo, transiciones (con su firma), firmas de sección y sellado.
   * Se arma en backend: k-way merge de las tablas con cursor (occurredAt, id) —
   * el cliente no puede paginar 3 tablas a la vez de forma correcta.
   */
  async timeline(userId: string, id: string, query: TimelineQuery): Promise<LogEntryTimelineResponse> {
    const entry = await this.entries.loadEntry(id);
    await this.entries.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);
    const take = query.take ?? 50;
    const before = query.cursor ? decodeCursor<TimeCursor>(query.cursor) : null;
    if (query.cursor && !before) throw new BadRequestException("Cursor inválido");
    const beforeAt = before ? new Date(before.t) : null;

    // Metadatos legibles desde las definiciones CONGELADAS (labels históricos).
    const version = await this.entries.loadVersion(entry.templateVersionId);
    const fieldMeta = new Map<string, { label: string; sectionKey: string }>();
    const sectionTitle = new Map<string, string>();
    for (const s of version.sections) {
      sectionTitle.set(s.key, s.title);
      for (const f of s.fields) fieldMeta.set(f.key, { label: f.label, sectionKey: s.key });
    }
    const wf = entry.workflowDefinitionVersionId
      ? await this.entries.loadWorkflowVersion(entry.workflowDefinitionVersionId)
      : null;
    const stateName = new Map((wf?.states ?? []).map((s) => [s.key, s.name]));
    const transitionLabel = new Map((wf?.transitions ?? []).map((t) => [t.key, t.label]));

    // Predicado keyset (estricto hacia atrás en el tiempo, desempate por id).
    const cursorFilter = (column: "changedAt" | "occurredAt" | "signedAt"): Prisma.LogEntryFieldChangeWhereInput =>
      beforeAt && before
        ? ({ OR: [{ [column]: { lt: beforeAt } }, { [column]: beforeAt, id: { lt: before.id } }] } as never)
        : {};

    const [changes, transitions, sectionSigs] = await Promise.all([
      this.prisma.logEntryFieldChange.findMany({
        where: { logEntryId: id, ...cursorFilter("changedAt") },
        orderBy: [{ changedAt: "desc" }, { id: "desc" }],
        take: take + 1,
      }),
      this.prisma.logEntryTransition.findMany({
        where: { logEntryId: id, ...(cursorFilter("occurredAt") as Prisma.LogEntryTransitionWhereInput) },
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        take: take + 1,
      }),
      this.prisma.logEntrySignature.findMany({
        where: {
          logEntryId: id,
          context: "SECTION_COMPLETION",
          ...(cursorFilter("signedAt") as Prisma.LogEntrySignatureWhereInput),
        },
        orderBy: [{ signedAt: "desc" }, { id: "desc" }],
        take: take + 1,
      }),
    ]);

    // Firmas embebidas en su transición (no son un evento aparte: son su manifestación).
    const transitionSigIds = transitions.map((t) => t.signatureId).filter((x): x is string => Boolean(x));
    const transitionSigs = transitionSigIds.length
      ? await this.prisma.logEntrySignature.findMany({ where: { id: { in: transitionSigIds } } })
      : [];
    const sigById = new Map(transitionSigs.map((s) => [s.id, s]));
    const actorNames = await this.entries.namesByUserId([
      entry.createdById,
      entry.deferredDeclaredById,
      ...changes.map((c) => c.changedById),
      ...transitions.map((t) => t.actorId),
    ]);

    const events: LogEntryTimelineEvent[] = [];
    for (const c of changes) {
      const meta = fieldMeta.get(c.fieldKey);
      events.push({
        kind: "FIELD_CHANGE",
        id: c.id,
        at: c.changedAt.toISOString(),
        actorName: c.changedById ? (actorNames.get(c.changedById) ?? null) : null,
        fieldKey: c.fieldKey,
        fieldLabel: meta?.label ?? null,
        sectionKey: meta?.sectionKey ?? null,
        before: (c.before ?? null) as unknown,
        after: (c.after ?? null) as unknown,
        reason: c.reason,
      });
    }
    for (const t of transitions) {
      const sig = t.signatureId ? sigById.get(t.signatureId) : undefined;
      events.push({
        kind: "TRANSITION",
        id: t.id,
        at: t.occurredAt.toISOString(),
        actorName: t.actorId ? (actorNames.get(t.actorId) ?? null) : null,
        transitionKey: t.transitionKey,
        label: transitionLabel.get(t.transitionKey) ?? null,
        fromStateKey: t.fromStateKey,
        toStateKey: t.toStateKey,
        fromStateName: stateName.get(t.fromStateKey) ?? null,
        toStateName: stateName.get(t.toStateKey) ?? null,
        reason: t.reason,
        signature: sig
          ? { signerName: sig.signerName, meaning: sig.meaning, signedAt: sig.signedAt.toISOString() }
          : null,
      });
    }
    for (const s of sectionSigs) {
      events.push({
        kind: "SECTION_SIGNED",
        id: s.id,
        at: s.signedAt.toISOString(),
        sectionKey: s.sectionKey ?? "",
        sectionTitle: s.sectionKey ? (sectionTitle.get(s.sectionKey) ?? null) : null,
        signerName: s.signerName,
        meaning: s.meaning,
        method: s.method,
      });
    }

    // Eventos sintéticos desde la cabecera (id estable; respetan el cursor).
    const passesCursor = (at: Date, eventId: string): boolean =>
      !beforeAt || !before || at < beforeAt || (at.getTime() === beforeAt.getTime() && eventId < before.id);
    if (entry.sealedAt && passesCursor(entry.sealedAt, `sealed:${id}`)) {
      events.push({ kind: "SEALED", id: `sealed:${id}`, at: entry.sealedAt.toISOString() });
    }
    // Declaración VIGENTE de registro diferido (2.7.0). Las declaraciones previas
    // (correcciones) quedan en AuditLog y en los FieldChange del campo de fecha.
    if (entry.entryOrigin === "DEFERRED" && entry.deferredDeclaredAt && passesCursor(entry.deferredDeclaredAt, `deferred:${id}`)) {
      events.push({
        kind: "DEFERRED_DECLARED",
        id: `deferred:${id}`,
        at: entry.deferredDeclaredAt.toISOString(),
        actorName: entry.deferredDeclaredById ? (actorNames.get(entry.deferredDeclaredById) ?? null) : null,
        declaredEffectiveAt: (entry.declaredEffectiveAt ?? entry.effectiveAt).toISOString(),
        reason: entry.deferredReason,
      });
    }
    if (passesCursor(entry.createdAt, `created:${id}`)) {
      events.push({
        kind: "CREATED",
        id: `created:${id}`,
        at: entry.createdAt.toISOString(),
        actorName: entry.createdById ? (actorNames.get(entry.createdById) ?? null) : null,
      });
    }

    // Merge DESC por (at, id); ISO 8601 ordena lexicográficamente = cronológicamente.
    events.sort((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1));
    const pageEvents = events.slice(0, take);
    const lastEvent = pageEvents[pageEvents.length - 1];
    const nextCursor =
      events.length > take && lastEvent
        ? encodeCursor({ t: lastEvent.at, id: lastEvent.id } satisfies TimeCursor)
        : null;
    return { events: pageEvents, nextCursor };
  }

  /** Log de cambios por campo, paginado (append-only y sin tope ⇒ endpoint propio). */
  async changes(userId: string, id: string, query: TimelineQuery): Promise<LogEntryChangesResponse> {
    const entry = await this.entries.loadEntry(id);
    await this.entries.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);
    const take = query.take ?? 50;
    const before = query.cursor ? decodeCursor<TimeCursor>(query.cursor) : null;
    if (query.cursor && !before) throw new BadRequestException("Cursor inválido");

    const version = await this.entries.loadVersion(entry.templateVersionId);
    const fieldMeta = new Map<string, { label: string; sectionKey: string }>();
    for (const s of version.sections) for (const f of s.fields) fieldMeta.set(f.key, { label: f.label, sectionKey: s.key });

    const rows = await this.prisma.logEntryFieldChange.findMany({
      where: {
        logEntryId: id,
        ...(before
          ? { OR: [{ changedAt: { lt: new Date(before.t) } }, { changedAt: new Date(before.t), id: { lt: before.id } }] }
          : {}),
      },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
      take: take + 1,
    });
    const page = rows.slice(0, take);
    const names = await this.entries.namesByUserId(page.map((r) => r.changedById));

    const items: LogEntryFieldChangeDto[] = page.map((r) => ({
      id: r.id,
      fieldKey: r.fieldKey,
      fieldLabel: fieldMeta.get(r.fieldKey)?.label ?? null,
      sectionKey: fieldMeta.get(r.fieldKey)?.sectionKey ?? null,
      before: (r.before ?? null) as unknown,
      after: (r.after ?? null) as unknown,
      reason: r.reason,
      changedByName: r.changedById ? (names.get(r.changedById) ?? null) : null,
      changedAt: r.changedAt.toISOString(),
    }));
    const last = page[page.length - 1];
    return {
      items,
      nextCursor:
        rows.length > take && last ? encodeCursor({ t: last.changedAt.toISOString(), id: last.id } satisfies TimeCursor) : null,
    };
  }

  /** Entradas relacionadas: mismo nodo+periodo y mismo turno (estilo event frames de PI). */
  async related(userId: string, id: string): Promise<RelatedLogEntries> {
    const entry = await this.entries.loadEntry(id);
    await this.entries.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);
    const accessible = await this.scope.getAccessibleNodeIds(userId);

    const base: Prisma.LogEntryWhereInput = { deletedAt: null, id: { not: id } };
    const abac: Prisma.LogEntryWhereInput = accessible !== null ? { orgNodeId: { in: [...accessible] } } : {};

    const [samePeriodRows, sameShiftRows] = await Promise.all([
      entry.periodKey
        ? this.prisma.logEntry.findMany({
            where: { ...base, orgNodeId: entry.orgNodeId, periodKey: entry.periodKey },
            orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
            take: LogbookQueryService.RELATED_TAKE,
            include: listInclude,
          })
        : Promise.resolve([] as ListRow[]),
      entry.operationalDate && entry.shiftCode
        ? this.prisma.logEntry.findMany({
            where: { ...base, ...abac, operationalDate: entry.operationalDate, shiftCode: entry.shiftCode },
            orderBy: [{ effectiveAt: "desc" }, { id: "desc" }],
            take: LogbookQueryService.RELATED_TAKE,
            include: listInclude,
          })
        : Promise.resolve([] as ListRow[]),
    ]);

    return {
      samePeriod: await this.enrich(samePeriodRows),
      sameShift: await this.enrich(sameShiftRows),
    };
  }

  // --- Verificación de integridad de firma (§11.70) ----------------------------

  /**
   * Recomputa el hash canónico de la firma y emite un veredicto:
   *  1) con los valores ACTUALES ⇒ VALID (nada cambió desde la firma);
   *  2) si no, REBOBINA el historial de cambios posteriores a `signedAt`
   *     (append-only, `changedAt` estampado con el mismo reloj que la firma)
   *     ⇒ VALID_RECORD_CHANGED_AFTER si coincide;
   *  3) si tampoco ⇒ INVALID (el contenido firmado no es reconstruible).
   * La verificación es un acto de revisión: queda auditada.
   */
  async verifySignature(
    userId: string,
    id: string,
    signatureId: string,
    ctx: AuditContext,
  ): Promise<SignatureVerifyResult> {
    const entry = await this.entries.loadEntry(id);
    await this.entries.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);
    const sig = await this.prisma.logEntrySignature.findFirst({ where: { id: signatureId, logEntryId: id } });
    if (!sig) throw new NotFoundException("Firma no encontrada en la entrada");

    const current = await this.entries.loadValuesByKey(id);
    const changesAfter = await this.prisma.logEntryFieldChange.findMany({
      where: { logEntryId: id, changedAt: { gt: sig.signedAt } },
      orderBy: [{ changedAt: "desc" }, { id: "desc" }],
    });

    // El from/to de una firma de transición vive en su LogEntryTransition.
    let fromStateKey: string | null = null;
    let toStateKey: string | null = null;
    if (sig.context === "TRANSITION") {
      const transition = await this.prisma.logEntryTransition.findFirst({
        where: { logEntryId: id, signatureId: sig.id },
      });
      fromStateKey = transition?.fromStateKey ?? null;
      toStateKey = transition?.toStateKey ?? null;
    }

    const hashOf = (values: Record<string, unknown>): string =>
      this.enc.sha256(
        canonicalSignaturePayload({
          entryId: id,
          templateVersionId: entry.templateVersionId,
          context: sig.context,
          transitionKey: sig.transitionKey,
          sectionKey: sig.sectionKey,
          fromStateKey,
          toStateKey,
          signerId: sig.signerId ?? "",
          meaning: sig.meaning,
          signedAt: sig.signedAt.toISOString(),
          values,
        }),
      );

    let verdict: SignatureVerifyVerdict;
    if (hashOf(current) === sig.payloadHash) {
      verdict = "VALID";
    } else {
      // Rebobinado: revierte los cambios posteriores, del más nuevo al más viejo.
      const rewound: Record<string, unknown> = { ...current };
      for (const change of changesAfter) rewound[change.fieldKey] = (change.before ?? null) as unknown;
      verdict = hashOf(rewound) === sig.payloadHash ? "VALID_RECORD_CHANGED_AFTER" : "INVALID";
    }

    await this.audit.record({
      ...ctx,
      action: "logentry.signature.verified",
      entityType: "LogEntrySignature",
      entityId: sig.id,
      metadata: { logEntryId: id, verdict, changesAfterSignature: changesAfter.length },
    });

    return {
      signatureId: sig.id,
      verdict,
      payloadHash: sig.payloadHash,
      changesAfterSignature: changesAfter.length,
      verifiedAt: new Date().toISOString(),
    };
  }

  // --- Internos ----------------------------------------------------------------

  /**
   * `where` compartido por listado / stats / export: ABAC SIEMPRE + todos los
   * filtros del contrato aplicados en SQL.
   */
  private async buildWhere(userId: string, query: LogEntryListQuery): Promise<Prisma.LogEntryWhereInput> {
    const and: Prisma.LogEntryWhereInput[] = [{ deletedAt: null }];

    const accessible = await this.scope.getAccessibleNodeIds(userId);
    if (accessible !== null) and.push({ orgNodeId: { in: [...accessible] } });

    // 2.º eje ABAC (Fase 2.8): alcance por PLANTILLA. Allow-list ⇒ filtra la
    // grilla/stats/export por las plantillas asignadas (AND con el eje de nodo).
    const accessibleTemplates = await this.scope.getAccessibleTemplateIds(userId);
    if (accessibleTemplates !== null) and.push({ templateId: { in: [...accessibleTemplates] } });

    if (query.orgNodeId) {
      if (query.includeDescendants) {
        const node = await this.prisma.orgNode.findFirst({
          where: { id: query.orgNodeId, deletedAt: null },
          select: { path: true },
        });
        if (!node) throw new BadRequestException("El nodo del filtro no existe");
        and.push({ orgNode: { path: { startsWith: node.path } } });
      } else {
        and.push({ orgNodeId: query.orgNodeId });
      }
    }

    if (query.templateId) and.push({ templateId: query.templateId });
    if (query.equipmentId) and.push({ equipmentId: query.equipmentId });
    if (query.status) and.push({ status: query.status });
    if (query.stateKey) and.push({ currentStateKey: query.stateKey });
    if (query.shiftCode) and.push({ shiftCode: query.shiftCode });
    if (query.periodKey) and.push({ periodKey: query.periodKey });
    if (query.operationalDate) and.push({ operationalDate: query.operationalDate });
    if (query.createdById) and.push({ createdById: query.createdById });
    if (query.entryOrigin) and.push({ entryOrigin: query.entryOrigin });

    if (query.effectiveFrom || query.effectiveTo) {
      and.push({
        effectiveAt: {
          ...(query.effectiveFrom ? { gte: new Date(query.effectiveFrom) } : {}),
          ...(query.effectiveTo ? { lte: new Date(query.effectiveTo) } : {}),
        },
      });
    }
    if (query.recordedFrom || query.recordedTo) {
      and.push({
        recordedAt: {
          ...(query.recordedFrom ? { gte: new Date(query.recordedFrom) } : {}),
          ...(query.recordedTo ? { lte: new Date(query.recordedTo) } : {}),
        },
      });
    }

    if (query.pendingSignature) {
      and.push({ sections: { some: { requiresSignature: true, signatureId: null } } });
    }
    if (query.thresholdBand) {
      const bands: ThresholdBand[] = query.thresholdBand === "ANY" ? ["WARN", "CRIT"] : [query.thresholdBand];
      and.push({ values: { some: { thresholdBand: { in: bands } } } });
    }

    if (query.q) {
      const or: Prisma.LogEntryWhereInput[] = [
        { template: { name: { contains: query.q, mode: "insensitive" } } },
        { orgNode: { name: { contains: query.q, mode: "insensitive" } } },
      ];
      // Búsqueda por CONTENIDO (2.8.1a): valores de los campos candidatos `showInGrid`
      // que contengan el texto — "lo que ves es lo que buscas". Acotada a la unión de
      // los `gridFieldKeys` de TODAS las plantillas (un set chico) y combinada en OR
      // con folio/plantilla/nodo, todo DENTRO del AND con el ABAC ⇒ no fuga de alcance.
      // Limitación MVP: matchea el valor ALMACENADO (texto/code); para SELECT de lista
      // el code no coincide con el label (búsqueda por label = deuda, ver BACKLOG).
      const candidateKeys = await this.allGridFieldKeys();
      if (candidateKeys.length > 0) {
        or.push({
          values: { some: { fieldKey: { in: candidateKeys }, value: { string_contains: query.q } } },
        });
      }
      // "BIT-000123", "000123" o "123" ⇒ además busca por folio exacto.
      const folio = /^(?:[A-Za-z]+-)?0*(\d+)$/.exec(query.q);
      if (folio?.[1]) {
        const n = Number(folio[1]);
        if (Number.isSafeInteger(n)) or.push({ entryNumber: n });
      }
      and.push({ OR: or });
    }

    return { AND: and };
  }

  /** Decodifica y valida el cursor del listado contra el orden pedido. */
  private cursorWhere(
    raw: string | undefined,
    sort: LogEntrySortField,
    dir: "asc" | "desc",
  ): Prisma.LogEntryWhereInput | null {
    if (!raw) return null;
    const cursor = decodeCursor<ListCursor>(raw);
    if (!cursor || cursor.s !== sort || cursor.d !== dir) {
      throw new BadRequestException("El cursor no corresponde al orden actual");
    }
    return this.keysetWhere(cursor);
  }

  /** Predicado keyset (valor, id) estrictamente posterior al cursor en el orden dado. */
  private keysetWhere(cursor: ListCursor): Prisma.LogEntryWhereInput {
    const value = cursor.s === "entryNumber" ? Number(cursor.v) : new Date(String(cursor.v));
    const op = cursor.d === "desc" ? "lt" : "gt";
    return {
      OR: [{ [cursor.s]: { [op]: value } }, { [cursor.s]: value, id: { [op]: cursor.id } }],
    };
  }

  private sortValueOf(row: ListRow, sort: LogEntrySortField): string | number {
    if (sort === "entryNumber") return row.entryNumber;
    return row[sort].toISOString();
  }

  /**
   * Enriquecimiento por PÁGINA (≤100 filas), todo batched — nombres, rutas,
   * estado del flujo (nombre+color de la versión CONGELADA) e indicadores de
   * review-by-exception. Cero N+1.
   */
  private async enrich(rows: ListRow[]): Promise<LogEntryListItem[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.id);
    const wfVersionIds = [...new Set(rows.map((r) => r.workflowDefinitionVersionId).filter((x): x is string => Boolean(x)))];

    const [paths, names, states, sectionRows, sigCounts, transitionCounts, bandRows] = await Promise.all([
      this.entries.nodePaths(new Set(rows.map((r) => r.orgNodeId))),
      this.entries.namesByUserId(rows.map((r) => r.createdById)),
      wfVersionIds.length
        ? this.prisma.workflowState.findMany({
            where: { workflowDefinitionVersionId: { in: wfVersionIds } },
            select: { workflowDefinitionVersionId: true, key: true, name: true, color: true },
          })
        : Promise.resolve([]),
      this.prisma.logEntrySection.findMany({
        where: { logEntryId: { in: ids } },
        select: { logEntryId: true, state: true, requiresSignature: true, signatureId: true },
      }),
      this.prisma.logEntrySignature.groupBy({ by: ["logEntryId"], where: { logEntryId: { in: ids } }, _count: { _all: true } }),
      this.prisma.logEntryTransition.groupBy({ by: ["logEntryId"], where: { logEntryId: { in: ids } }, _count: { _all: true } }),
      this.prisma.logEntryValue.findMany({
        where: { logEntryId: { in: ids }, thresholdBand: { not: null } },
        select: { logEntryId: true, thresholdBand: true },
      }),
    ]);

    const stateByVersionAndKey = new Map<string, { name: string; color: string | null }>();
    for (const s of states) stateByVersionAndKey.set(`${s.workflowDefinitionVersionId}:${s.key}`, { name: s.name, color: s.color });

    const indicatorsById = new Map<string, LogEntryIndicators>();
    const blank = (): LogEntryIndicators => ({
      sectionsTotal: 0,
      sectionsCompleted: 0,
      sectionsLocked: 0,
      pendingSignatures: 0,
      signaturesCount: 0,
      transitionsCount: 0,
      worstThresholdBand: null,
    });
    const indicatorsFor = (entryId: string): LogEntryIndicators => {
      let ind = indicatorsById.get(entryId);
      if (!ind) {
        ind = blank();
        indicatorsById.set(entryId, ind);
      }
      return ind;
    };
    for (const s of sectionRows) {
      const ind = indicatorsFor(s.logEntryId);
      ind.sectionsTotal += 1;
      // "Completada" cuenta también LOCKED: una sección LOCKED es una que se
      // completó y luego se SELLÓ al avanzar el flujo (si no se hubiera completado,
      // la guarda de completitud habría bloqueado la transición). Así el contador
      // refleja el avance real (p. ej. un registro aprobado muestra M/M, no 0/M).
      if (s.state === "COMPLETED" || s.state === "LOCKED") ind.sectionsCompleted += 1;
      if (s.state === "LOCKED") ind.sectionsLocked += 1;
      if (s.requiresSignature && !s.signatureId) ind.pendingSignatures += 1;
    }
    for (const g of sigCounts) indicatorsFor(g.logEntryId).signaturesCount = g._count._all;
    for (const g of transitionCounts) indicatorsFor(g.logEntryId).transitionsCount = g._count._all;
    for (const v of bandRows) {
      const ind = indicatorsFor(v.logEntryId);
      if (v.thresholdBand === "CRIT" || ind.worstThresholdBand === null) {
        ind.worstThresholdBand = v.thresholdBand;
      }
    }

    // Valores de RESUMEN de negocio (2.8.1a): campos candidatos `showInGrid` de cada
    // plantilla, con su meta CONGELADA. Todo batched (sin N+1); ver buildSummaries.
    const summariesById = await this.buildSummaries(rows);

    return rows.map((row) => {
      const state =
        row.workflowDefinitionVersionId && row.currentStateKey
          ? stateByVersionAndKey.get(`${row.workflowDefinitionVersionId}:${row.currentStateKey}`)
          : undefined;
      return {
        ...this.entries.mapEntry(row, row.template.name),
        templateVersionNumber: row.templateVersion.versionNumber,
        orgNodeName: row.orgNode.name,
        orgNodePath: paths.get(row.orgNodeId) ?? null,
        equipmentName: row.equipment?.name ?? null,
        equipmentTag: row.equipment?.tag ?? null,
        createdByName: row.createdById ? (names.get(row.createdById) ?? null) : null,
        currentStateName: state?.name ?? null,
        currentStateColor: state?.color ?? null,
        indicators: indicatorsById.get(row.id) ?? blank(),
        summaryValues: summariesById.get(row.id) ?? [],
      };
    });
  }

  /** Unión de los `gridFieldKeys` de TODAS las plantillas (set chico, para la
   * búsqueda por contenido). Una sola query; vacío = ninguna plantilla configuró resumen. */
  private async allGridFieldKeys(): Promise<string[]> {
    const rows = await this.prisma.template.findMany({
      where: { deletedAt: null, NOT: { gridFieldKeys: { isEmpty: true } } },
      select: { gridFieldKeys: true },
    });
    return [...new Set(rows.flatMap((r) => r.gridFieldKeys))];
  }

  /**
   * Construye los valores de RESUMEN por entrada (2.8.1a), batched (cero N+1):
   *  1) `gridFieldKeys` de las plantillas distintas de la página;
   *  2) `LogEntryValue` de esas entradas acotado a la unión de campos candidatos;
   *  3) meta CONGELADA del campo (label/dataType/config) por versión de plantilla;
   *  4) resolución batched de code→label para SELECT (inline desde la config; de
   *     `referenceList` desde `ReferenceItem`).
   * El valor viaja ESTRUCTURADO (no pre-formateado): el cliente aplica el formato
   * regional (números/fechas) con lib/format. Orden = el de `gridFieldKeys`; se
   * omiten los campos sin valor (el Resumen muestra solo lo lleno).
   */
  private async buildSummaries(rows: ListRow[]): Promise<Map<string, LogEntrySummaryValue[]>> {
    const result = new Map<string, LogEntrySummaryValue[]>();
    // gridFieldKeys por plantilla (de la fila, ya incluida en listInclude).
    const keysByTemplate = new Map<string, string[]>();
    for (const r of rows) keysByTemplate.set(r.templateId, r.template.gridFieldKeys ?? []);
    const allKeys = [...new Set([...keysByTemplate.values()].flat())].filter((k) => k);
    if (allKeys.length === 0) return result;

    const ids = rows.map((r) => r.id);
    const versionIds = [...new Set(rows.map((r) => r.templateVersionId))];

    const [valueRows, fieldRows] = await Promise.all([
      this.prisma.logEntryValue.findMany({
        where: { logEntryId: { in: ids }, fieldKey: { in: allKeys } },
        select: { logEntryId: true, fieldKey: true, value: true, dataType: true, thresholdBand: true },
      }),
      this.prisma.templateField.findMany({
        where: { section: { templateVersionId: { in: versionIds } }, key: { in: allKeys } },
        select: { key: true, type: true, label: true, dataType: true, config: true, section: { select: { templateVersionId: true } } },
      }),
    ]);

    // Meta de campo congelada por (versión, key).
    type FieldMeta = { label: string; unit: string | null; inlineLabels: Map<string, string>; refListKey: string | null };
    const metaByVersionKey = new Map<string, FieldMeta>();
    const refListKeys = new Set<string>();
    for (const f of fieldRows) {
      const cfg = upgradeFieldConfig(f.type, (f.config ?? {}) as Record<string, unknown>);
      const unit = typeof cfg.unit === "string" ? cfg.unit : null;
      const inlineLabels = new Map<string, string>();
      let refListKey: string | null = null;
      const src = cfg.optionSource as { kind?: string; items?: Array<{ code: string; label: string }>; listKey?: string } | undefined;
      if (src?.kind === "inline") for (const it of src.items ?? []) inlineLabels.set(it.code, it.label);
      else if (src?.kind === "referenceList" && typeof src.listKey === "string") {
        refListKey = src.listKey;
        refListKeys.add(src.listKey);
      }
      metaByVersionKey.set(`${f.section.templateVersionId}:${f.key}`, { label: f.label, unit, inlineLabels, refListKey });
    }

    // Resolución de code→label de listas de referencia (solo las usadas), batched.
    const refLabel = new Map<string, string>(); // `${listKey} ${code}` → label
    if (refListKeys.size > 0) {
      // Códigos efectivamente presentes en los valores de campos de tipo referenceList.
      const refFieldKeys = new Set(
        fieldRows.filter((f) => metaByVersionKey.get(`${f.section.templateVersionId}:${f.key}`)?.refListKey).map((f) => f.key),
      );
      const codes = new Set<string>();
      for (const v of valueRows) {
        if (!refFieldKeys.has(v.fieldKey)) continue;
        for (const c of asCodes(v.value)) codes.add(c);
      }
      if (codes.size > 0) {
        const lists = await this.prisma.referenceList.findMany({
          where: { key: { in: [...refListKeys] }, deletedAt: null },
          select: { id: true, key: true },
        });
        const listKeyById = new Map(lists.map((l) => [l.id, l.key]));
        const items = await this.prisma.referenceItem.findMany({
          where: { listId: { in: lists.map((l) => l.id) }, code: { in: [...codes] } },
          select: { listId: true, code: true, label: true },
        });
        for (const it of items) {
          const lk = listKeyById.get(it.listId);
          if (lk) refLabel.set(`${lk} ${it.code}`, it.label);
        }
      }
    }

    // Valor por (entrada, key).
    const valueByEntryKey = new Map<string, (typeof valueRows)[number]>();
    for (const v of valueRows) valueByEntryKey.set(`${v.logEntryId}:${v.fieldKey}`, v);

    for (const row of rows) {
      const keys = keysByTemplate.get(row.templateId) ?? [];
      if (keys.length === 0) continue;
      const out: LogEntrySummaryValue[] = [];
      for (const key of keys) {
        const v = valueByEntryKey.get(`${row.id}:${key}`);
        if (!v || v.value === null || v.value === undefined) continue;
        const meta = metaByVersionKey.get(`${row.templateVersionId}:${key}`);
        let optionLabel: string | null = null;
        if (meta) {
          if (meta.inlineLabels.size > 0) {
            optionLabel = asCodes(v.value).map((c) => meta.inlineLabels.get(c) ?? c).join(", ") || null;
          } else if (meta.refListKey) {
            const lk = meta.refListKey;
            optionLabel = asCodes(v.value).map((c) => refLabel.get(`${lk} ${c}`) ?? c).join(", ") || null;
          }
        }
        out.push({
          fieldKey: key,
          label: meta?.label ?? key,
          dataType: v.dataType,
          value: v.value as unknown,
          unit: meta?.unit ?? null,
          optionLabel,
          thresholdBand: v.thresholdBand,
        });
      }
      if (out.length > 0) result.set(row.id, out);
    }
    return result;
  }
}

/** Normaliza un value de SELECT/MULTISELECT a un arreglo de codes (string). */
function asCodes(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === "string");
  return [];
}
