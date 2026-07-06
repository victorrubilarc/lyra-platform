import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NotificationEvent } from "@prisma/client";
import {
  FIELD_VARIABLE_PREFIX,
  allowedVariablesForTemplate,
  extractPlaceholders,
  fieldVariableName,
  incidentActionCode,
  incidentReportCode,
  isFieldVariable,
  notificationEventDef,
  pickTemplateForScope,
  renderTemplate,
  shouldEscalate,
  transitionNotifyConfigSchema,
  workOrderCode,
  workOrderShouldEscalate,
  type TransitionNotifyConfig,
} from "@lyra/contracts";
import type { Env } from "../config/env.schema";
import { PrismaService } from "../prisma/prisma.service";
import { ScopeService } from "../authz/scope.service";
import { SchedulesService } from "../schedules/schedules.service";
import { workflowVersionInclude } from "../log-entries/log-entries.service";

/** Locale por defecto de las plantillas (el modelo soporta i18n por plantilla). */
const DEFAULT_LOCALE = "es-CL";

/** Un mensaje resuelto y RENDERIZADO, listo para insertar en la bandeja de salida. */
export interface ResolvedMessage {
  /** Canal de entrega de esta fila (EMAIL = correo, INAPP = campanita). */
  channel: "EMAIL" | "INAPP";
  /** null = destinatario EXTERNO (correo sin usuario; salta ABAC y preferencias). */
  recipientUserId: string | null;
  recipientEmail: string;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  dedupeKey: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}

/** Resolución intermedia de un evento: destinatarios + contexto compartido. */
interface EventResolution {
  /** Usuarios destinatarios DERIVADOS del dominio (ya filtrados por ABAC). */
  userIds: Set<string>;
  /** Correos EXTERNOS (épico notif. avanzadas): sin ABAC ni preferencias, auditados. */
  externalEmails: string[];
  /** Contexto de render común a todos los destinatarios (sin `recipient.*`). */
  context: Record<string, string>;
  /** Nodo/plantilla del evento, para filtrar destinatarios de SUSCRIPCIÓN por ABAC. */
  orgNodeId: string | null;
  templateId: string | null;
  /** Plantilla FORZADA por la config de la transición (id). undefined = resolver por ámbito. */
  forceTemplateId?: string | null;
  /** Entrada + versión congelada, para los comodines de campo `{{campo.<key>}}` (si aplica). */
  fieldEntryId?: string | null;
  fieldTemplateVersionId?: string | null;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
}

/**
 * ETAPA 2 del transactional outbox: dado un `NotificationEvent` encolado, resuelve
 * los DESTINATARIOS (dominio + suscripciones), aplica ABAC y preferencias, elige la
 * plantilla y RENDERIZA un mensaje por persona. NUNCA notifica algo que el
 * destinatario no podría ver: todo destinatario pasa por `canAccessNode` +
 * `canAccessTemplate`. El render es seguro (placeholders whitelisteados, sin eval).
 * La dedup por destinatario usa el id del evento encolado (1 fan-out por suceso),
 * apoyada en el `dedupeKey` único del propio `NotificationEvent` (1 evento por
 * ronda vencida / breach de SLA).
 */
@Injectable()
export class NotificationResolverService {
  private readonly logger = new Logger(NotificationResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: ScopeService,
    private readonly schedules: SchedulesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Resuelve y renderiza todos los mensajes de un evento (vacío = sin destinatarios). */
  async resolve(event: NotificationEvent): Promise<ResolvedMessage[]> {
    const def = notificationEventDef(event.eventKey);
    if (!def) return [];
    const payload = (event.payload ?? {}) as Record<string, unknown>;

    let resolution: EventResolution | null;
    switch (event.eventKey) {
      case "round.overdue":
        resolution = await this.resolveRoundOverdue(payload);
        break;
      case "entry.sla.breached":
        resolution = await this.resolveSlaBreached(payload);
        break;
      case "entry.transition":
        resolution = await this.resolveTransition(payload);
        break;
      case "entry.signature.pending":
        resolution = await this.resolveSignaturePending(payload);
        break;
      case "incident.sla.breached":
        resolution = await this.resolveIncidentSlaBreached(payload);
        break;
      case "incident.overdue":
        resolution = await this.resolveIncidentOverdue(payload);
        break;
      case "incident.action.overdue":
        resolution = await this.resolveIncidentActionOverdue(payload);
        break;
      case "incident.report.due":
        resolution = await this.resolveIncidentReportDue(payload);
        break;
      case "workorder.overdue":
        resolution = await this.resolveWorkOrderOverdue(payload);
        break;
      case "workorder.stalled":
        resolution = await this.resolveWorkOrderStalled(payload);
        break;
      case "workorder.activity.overdue":
        resolution = await this.resolveWorkOrderActivityOverdue(payload);
        break;
      case "worker.competency.expiring":
        resolution = await this.resolveWorkerCompetency(payload, "expiring");
        break;
      case "worker.competency.expired":
        resolution = await this.resolveWorkerCompetency(payload, "expired");
        break;
      case "contractor.accreditation.expiring":
        resolution = await this.resolveContractorAccreditation(payload, "expiring");
        break;
      case "contractor.accreditation.expired":
        resolution = await this.resolveContractorAccreditation(payload, "expired");
        break;
      case "handover.ready":
        resolution = await this.resolveHandoverReady(payload);
        break;
      case "license.state.changed":
      case "license.expiring":
      case "license.restricted":
        resolution = await this.resolveLicenseEvent(event.eventKey, payload);
        break;
      default:
        resolution = null;
    }
    if (!resolution) return [];

    // Suscriptores explícitos (watchers), filtrados por ABAC contra el evento.
    const subUsers = await this.subscriptionRecipients(event.eventKey, resolution.orgNodeId, resolution.templateId);
    for (const uid of subUsers) resolution.userIds.add(uid);
    if (resolution.userIds.size === 0 && resolution.externalEmails.length === 0) return [];

    // Plantilla: forzada por la transición (id) o resuelta por ÁMBITO (bitácora → genérica).
    const template = await this.resolveTemplate(event.eventKey, resolution.templateId, resolution.forceTemplateId);
    if (!template) {
      this.logger.warn(`Sin plantilla activa para ${event.eventKey} (${DEFAULT_LOCALE}); no se enviará`);
      return [];
    }

    // Comodines de campo `{{campo.<key>}}`: solo si la plantilla es ESPECÍFICA de una bitácora
    // y el evento aporta una entrada. Los valores salen de la versión CONGELADA (ausente ⇒ "").
    const fieldKeys =
      template.templateId && resolution.fieldEntryId && resolution.fieldTemplateVersionId
        ? this.fieldKeysInTemplate([template.subject, template.bodyText, template.bodyHtml])
        : [];
    const fieldContext =
      fieldKeys.length > 0
        ? await this.buildFieldContext(resolution.fieldEntryId!, resolution.fieldTemplateVersionId!, fieldKeys)
        : {};

    const allowed = allowedVariablesForTemplate(event.eventKey, fieldKeys);
    const appUrl = this.appUrl();
    const baseContext: Record<string, string> = {
      ...resolution.context,
      ...fieldContext,
      "app.name": "Lyra WatchLog",
      "app.url": appUrl,
    };

    const messages: ResolvedMessage[] = [];
    const pushMessage = (
      channel: "EMAIL" | "INAPP",
      recipientUserId: string | null,
      email: string,
      name: string,
      recipientKey: string,
    ) => {
      const context: Record<string, string> = { ...baseContext, "recipient.name": name };
      // Defensa en profundidad: el contexto solo expone variables permitidas de la plantilla.
      for (const key of Object.keys(context)) if (!allowed.has(key)) delete context[key];
      messages.push({
        channel,
        recipientUserId,
        recipientEmail: email,
        subject: renderTemplate(template.subject, context),
        bodyText: renderTemplate(template.bodyText, context),
        bodyHtml: renderTemplate(template.bodyHtml, context),
        // El canal entra en el dedupeKey: un mismo destinatario recibe email E in-app
        // del mismo suceso sin chocar el índice único.
        dedupeKey: `${event.eventKey}|${event.id}|${channel}|${recipientKey}`,
        relatedEntityType: resolution.relatedEntityType,
        relatedEntityId: resolution.relatedEntityId,
      });
    };

    // Destinatarios INTERNOS: usuario activo, menos los que optaron por NO recibir EN ESE
    // CANAL. EMAIL exige correo; INAPP (la campanita) no. Ambos canales por defecto ON.
    const userIds = [...resolution.userIds];
    if (userIds.length > 0) {
      const [users, optedOut] = await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: userIds }, status: { not: "DISABLED" } },
          select: { id: true, email: true, displayName: true },
        }),
        this.prisma.notificationPreference.findMany({
          where: { userId: { in: userIds }, eventKey: event.eventKey, mode: "OFF" },
          select: { userId: true, channel: true },
        }),
      ]);
      const offEmail = new Set(optedOut.filter((p) => p.channel === "EMAIL").map((p) => p.userId));
      const offInApp = new Set(optedOut.filter((p) => p.channel === "INAPP").map((p) => p.userId));
      for (const user of users) {
        if (user.email && !offEmail.has(user.id)) {
          pushMessage("EMAIL", user.id, user.email, user.displayName, user.id);
        }
        if (!offInApp.has(user.id)) {
          pushMessage("INAPP", user.id, user.email ?? "", user.displayName, user.id);
        }
      }
    }

    // Destinatarios EXTERNOS: sin usuario, sin ABAC, sin preferencias (gobernanza explícita).
    // Solo correo (no tienen campanita).
    for (const email of new Set(resolution.externalEmails)) {
      pushMessage("EMAIL", null, email, email, `ext:${email}`);
    }

    return messages;
  }

  /**
   * Resuelve la plantilla a usar: si la transición FORZÓ una (id), esa (activa); si no,
   * la más ESPECÍFICA por ámbito (bitácora) con fallback a la genérica (pickTemplateForScope).
   */
  private async resolveTemplate(
    eventKey: string,
    logbookTemplateId: string | null,
    forceTemplateId?: string | null,
  ) {
    if (forceTemplateId) {
      const forced = await this.prisma.notificationTemplate.findFirst({
        where: { id: forceTemplateId, eventKey, channel: "EMAIL", active: true },
      });
      if (forced) return forced;
      // La forzada ya no existe/está inactiva ⇒ degrada con elegancia al ámbito.
    }
    const scopeOr = logbookTemplateId ? [{ templateId: logbookTemplateId }, { templateId: null }] : [{ templateId: null }];
    const candidates = await this.prisma.notificationTemplate.findMany({
      where: { eventKey, channel: "EMAIL", locale: DEFAULT_LOCALE, OR: scopeOr },
    });
    return pickTemplateForScope(candidates, logbookTemplateId);
  }

  /** Keys de campo (`campo.<key>`) referenciadas en los textos de una plantilla. */
  private fieldKeysInTemplate(texts: readonly string[]): string[] {
    const keys = new Set<string>();
    for (const t of texts) {
      for (const p of extractPlaceholders(t)) {
        if (isFieldVariable(p)) keys.add(p.slice(FIELD_VARIABLE_PREFIX.length));
      }
    }
    return [...keys];
  }

  /**
   * Construye el contexto `{{campo.<key>}}` de una entrada: lee los valores de la versión
   * CONGELADA, los formatea (reusa el formateo del resumen) y los expone por su prefijo.
   * Un campo ausente queda en "" (degradación elegante: la plantilla no se rompe).
   */
  private async buildFieldContext(
    entryId: string,
    templateVersionId: string,
    fieldKeys: string[],
  ): Promise<Record<string, string>> {
    const [version, values] = await Promise.all([
      this.prisma.templateVersion.findUnique({
        where: { id: templateVersionId },
        select: { sections: { select: { fields: { select: { key: true, config: true } } } } },
      }),
      this.prisma.logEntryValue.findMany({
        where: { logEntryId: entryId, fieldKey: { in: fieldKeys } },
        select: { fieldKey: true, value: true },
      }),
    ]);
    const configByKey = new Map<string, Record<string, unknown>>();
    for (const s of version?.sections ?? []) {
      for (const f of s.fields) configByKey.set(f.key, (f.config as Record<string, unknown>) ?? {});
    }
    const valueByKey = new Map(values.map((v) => [v.fieldKey, v.value]));
    const ctx: Record<string, string> = {};
    for (const key of fieldKeys) {
      const config = configByKey.get(key) ?? {};
      const text = formatSummaryScalar(valueByKey.get(key), config);
      const unit = text !== "" && typeof config.unit === "string" ? ` ${config.unit}` : "";
      ctx[fieldVariableName(key)] = text === "" ? "" : `${text}${unit}`;
    }
    return ctx;
  }

  // --- Resolución por evento -------------------------------------------------

  private async resolveRoundOverdue(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const occurrenceId = String(payload.occurrenceId ?? "");
    if (!occurrenceId) return null;
    const r = await this.schedules.resolveOverdueRecipients(occurrenceId);
    if (!r) return null;
    return {
      userIds: new Set(r.userIds),
      externalEmails: [],
      orgNodeId: r.orgNodeId,
      templateId: r.templateId,
      relatedEntityType: "RoundOccurrence",
      relatedEntityId: occurrenceId,
      context: {
        "schedule.name": r.scheduleName ?? "—",
        "template.name": r.templateName ?? "—",
        "node.name": r.nodeName ?? "—",
        "equipment.tag": r.equipmentTag ?? "—",
        "occurrence.scheduledFor": this.formatDateTime(r.scheduledFor),
        "occurrence.dueAt": this.formatDateTime(r.dueAt),
        "occurrence.overdueBy": this.formatDuration(Math.round((Date.now() - r.dueAt.getTime()) / 60000)),
      },
    };
  }

  private async resolveSlaBreached(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const entryId = String(payload.entryId ?? "");
    const stateKey = String(payload.stateKey ?? "");
    if (!entryId || !stateKey) return null;
    const entry = await this.loadEntryForNotification(entryId);
    if (!entry || entry.currentStateKey !== stateKey || entry.status !== "DRAFT") return null;
    const state = entry.states.get(stateKey);
    const userIds = await this.stateActorUserIds(entry, stateKey, {});
    const sinceIso = String(payload.currentStateSince ?? entry.currentStateSince?.toISOString() ?? "");
    const since = sinceIso ? new Date(sinceIso) : entry.currentStateSince;
    const delayedMin = since ? Math.round((Date.now() - since.getTime()) / 60000) - (state?.maxStayMinutes ?? 0) : 0;
    return {
      userIds: new Set(userIds),
      externalEmails: [],
      orgNodeId: entry.orgNodeId,
      templateId: entry.templateId,
      fieldEntryId: entry.id,
      fieldTemplateVersionId: entry.templateVersionId,
      relatedEntityType: "LogEntry",
      relatedEntityId: entryId,
      context: {
        ...this.entryContext(entry),
        "entry.state": state?.name ?? stateKey,
        "entry.sla": this.formatDuration(state?.maxStayMinutes ?? 0),
        "entry.delayedBy": this.formatDuration(Math.max(0, delayedMin)),
      },
    };
  }

  private async resolveTransition(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const entryId = String(payload.entryId ?? "");
    const toStateKey = String(payload.toStateKey ?? "");
    const fromStateKey = String(payload.fromStateKey ?? "");
    const transitionKey = payload.transitionKey ? String(payload.transitionKey) : "";
    const actorId = payload.actorId ? String(payload.actorId) : null;
    if (!entryId || !toStateKey) return null;
    const entry = await this.loadEntryForNotification(entryId);
    if (!entry) return null;

    // Config de aviso CONGELADA en la transición ejecutada (épico notif. avanzadas).
    const cfg = transitionKey ? (entry.transitions.find((t) => t.key === transitionKey)?.notify ?? null) : null;

    const userIds = new Set<string>();
    const externalEmails: string[] = [];
    let forceTemplateId: string | null | undefined;

    if (cfg && cfg.enabled) {
      // Destinatarios EXPLÍCITOS de la transición (los internos pasan ABAC; externos no).
      forceTemplateId = cfg.templateId ?? undefined;
      if (cfg.roleIds.length) for (const u of await this.usersOfRoles(cfg.roleIds, entry)) userIds.add(u);
      if (cfg.userIds.length) for (const u of await this.filterByAbac(cfg.userIds, entry.orgNodeId, entry.templateId)) userIds.add(u);
      if (cfg.includeAuthor && entry.createdById)
        for (const u of await this.filterByAbac([entry.createdById], entry.orgNodeId, entry.templateId)) userIds.add(u);
      if (cfg.includeActor && actorId)
        for (const u of await this.filterByAbac([actorId], entry.orgNodeId, entry.templateId)) userIds.add(u);
      if (cfg.includeDestinationRoles)
        for (const u of await this.stateActorUserIds(entry, toStateKey, { excludeUserId: actorId })) userIds.add(u);
      for (const e of cfg.externalEmails) externalEmails.push(e);
    } else if (await this.transitionDefaultEnabled()) {
      // DEFAULT de sistema (sin config explícita): conducta clásica = roles del estado destino,
      // menos quien ejecutó (no auto-aviso).
      for (const u of await this.stateActorUserIds(entry, toStateKey, { excludeUserId: actorId })) userIds.add(u);
    }

    return {
      userIds,
      externalEmails,
      orgNodeId: entry.orgNodeId,
      templateId: entry.templateId,
      forceTemplateId,
      fieldEntryId: entry.id,
      fieldTemplateVersionId: entry.templateVersionId,
      relatedEntityType: "LogEntry",
      relatedEntityId: entryId,
      context: {
        ...this.entryContext(entry),
        "entry.fromState": entry.states.get(fromStateKey)?.name ?? fromStateKey,
        "entry.toState": entry.states.get(toStateKey)?.name ?? toStateKey,
        "entry.actor": actorId ? await this.userName(actorId) : "—",
      },
    };
  }

  /** Expande roles a usuarios (en vivo) filtrados por ABAC del nodo/plantilla de la entrada. */
  private async usersOfRoles(roleIds: string[], entry: LoadedEntry): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const rows = await this.prisma.userRole.findMany({ where: { roleId: { in: roleIds } }, select: { userId: true } });
    return this.filterByAbac([...new Set(rows.map((r) => r.userId))], entry.orgNodeId, entry.templateId);
  }

  /** Default de sistema: ¿las transiciones SIN config avisan a los roles del estado destino? */
  private async transitionDefaultEnabled(): Promise<boolean> {
    const s = await this.prisma.systemSettings.findFirst({ select: { notifyTransitionDefaultDestinationRoles: true } });
    return s?.notifyTransitionDefaultDestinationRoles ?? true;
  }

  private async resolveSignaturePending(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const entryId = String(payload.entryId ?? "");
    const stateKey = String(payload.stateKey ?? "");
    if (!entryId || !stateKey) return null;
    const entry = await this.loadEntryForNotification(entryId);
    if (!entry || entry.currentStateKey !== stateKey) return null; // ya avanzó/firmó
    const userIds = await this.stateActorUserIds(entry, stateKey, { signatureOnly: true });
    return {
      userIds: new Set(userIds),
      externalEmails: [],
      orgNodeId: entry.orgNodeId,
      templateId: entry.templateId,
      fieldEntryId: entry.id,
      fieldTemplateVersionId: entry.templateVersionId,
      relatedEntityType: "LogEntry",
      relatedEntityId: entryId,
      context: {
        ...this.entryContext(entry),
        "entry.state": entry.states.get(stateKey)?.name ?? stateKey,
      },
    };
  }

  // --- Resolvers de INCIDENCIAS (Fase 4.4) -----------------------------------

  /** Permanencia de estado excedida: avisa al responsable + roles del estado actual. */
  private async resolveIncidentSlaBreached(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const incidentId = String(payload.incidentId ?? "");
    const stateKey = String(payload.stateKey ?? "");
    if (!incidentId) return null;
    const inc = await this.loadIncidentForNotification(incidentId);
    if (!inc || inc.lifecycle !== "OPEN") return null;
    if (stateKey && inc.currentStateKey !== stateKey) return null; // ya avanzó de estado
    const userIds = await this.incidentRecipients(inc, { includeStateRoles: true });
    const since = inc.currentStateSince ?? new Date();
    const delayedMin = Math.round((Date.now() - since.getTime()) / 60000) - (inc.currentStateMaxStay ?? 0);
    return {
      ...this.baseIncidentResolution(inc, incidentId, userIds),
      context: {
        ...this.incidentContext(inc),
        "incident.sla": this.formatDuration(inc.currentStateMaxStay ?? 0),
        "incident.delayedBy": this.formatDuration(Math.max(0, delayedMin)),
      },
    };
  }

  /** Plazo de resolución vencido: responsable + roles del estado + (si aplica) escalamiento. */
  private async resolveIncidentOverdue(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const incidentId = String(payload.incidentId ?? "");
    if (!incidentId) return null;
    const inc = await this.loadIncidentForNotification(incidentId);
    if (!inc || inc.lifecycle !== "OPEN" || !inc.dueAt || inc.dueAt.getTime() >= Date.now()) return null;
    const escalate = shouldEscalate(inc.dueAt, inc.escalationAfterMinutes, Date.now());
    const userIds = await this.incidentRecipients(inc, {
      includeStateRoles: true,
      escalationRoleId: escalate ? inc.escalationRoleId : null,
    });
    const overdueBy = Math.round((Date.now() - inc.dueAt.getTime()) / 60000);
    return {
      ...this.baseIncidentResolution(inc, incidentId, userIds),
      context: {
        ...this.incidentContext(inc),
        "incident.dueAt": this.formatDateTime(inc.dueAt),
        "incident.overdueBy": this.formatDuration(overdueBy),
      },
    };
  }

  /** Acción CAPA vencida: responsable de la acción (persona+rol) + responsable de la incidencia. */
  private async resolveIncidentActionOverdue(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const incidentId = String(payload.incidentId ?? "");
    const actionId = String(payload.actionId ?? "");
    if (!incidentId || !actionId) return null;
    const inc = await this.loadIncidentForNotification(incidentId);
    if (!inc || inc.lifecycle !== "OPEN") return null;
    const action = await this.prisma.incidentAction.findUnique({
      where: { id: actionId },
      select: { id: true, number: true, title: true, dueAt: true, status: true, responsibleId: true, responsibleRoleId: true },
    });
    if (!action || !action.dueAt || !["OPEN", "IN_PROGRESS"].includes(action.status)) return null;
    const candidates = new Set<string>();
    if (action.responsibleId) candidates.add(action.responsibleId);
    if (action.responsibleRoleId) for (const u of await this.usersOfRoleIds([action.responsibleRoleId])) candidates.add(u);
    if (inc.ownerId) candidates.add(inc.ownerId);
    const userIds = new Set(await this.filterByNode([...candidates], inc.orgNodeId));
    const overdueBy = Math.round((Date.now() - action.dueAt.getTime()) / 60000);
    return {
      ...this.baseIncidentResolution(inc, incidentId, userIds),
      context: {
        ...this.incidentContext(inc),
        "action.code": incidentActionCode(action.number),
        "action.title": action.title,
        "action.dueAt": this.formatDateTime(action.dueAt),
        "action.overdueBy": this.formatDuration(overdueBy),
      },
    };
  }

  /** Reporte regulatorio por vencer: responsable de la incidencia + roles del estado. */
  private async resolveIncidentReportDue(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const incidentId = String(payload.incidentId ?? "");
    const reportId = String(payload.reportId ?? "");
    if (!incidentId || !reportId) return null;
    const inc = await this.loadIncidentForNotification(incidentId);
    if (!inc || inc.lifecycle !== "OPEN") return null;
    const report = await this.prisma.incidentReport.findUnique({
      where: { id: reportId },
      select: { id: true, number: true, authorityName: true, dueAt: true, status: true },
    });
    if (!report || !report.dueAt || report.status !== "PENDING") return null;
    const userIds = await this.incidentRecipients(inc, { includeStateRoles: true });
    const overdueBy = Math.round((Date.now() - report.dueAt.getTime()) / 60000);
    return {
      ...this.baseIncidentResolution(inc, incidentId, userIds),
      context: {
        ...this.incidentContext(inc),
        "report.code": incidentReportCode(report.number),
        "report.authority": report.authorityName ?? "—",
        "report.dueAt": this.formatDateTime(report.dueAt),
        "report.overdueBy": this.formatDuration(overdueBy),
      },
    };
  }

  /**
   * Entrega de turno lista (handover.ready, Fase 5): avisa a quienes PUEDEN recibir
   * el turno entrante en ese nodo = usuarios con un rol que concede
   * `shifthandover:acknowledge`, filtrados por ABAC de nodo, EXCLUIDO quien entregó
   * (segregación de funciones). Si nadie califica, no se notifica (vacío).
   */
  private async resolveHandoverReady(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const handoverId = String(payload.handoverId ?? "");
    if (!handoverId) return null;
    const h = await this.prisma.shiftHandover.findUnique({
      where: { id: handoverId },
      select: {
        id: true,
        number: true,
        orgNodeId: true,
        shiftLabel: true,
        shiftCode: true,
        incomingShiftCode: true,
        outgoingById: true,
        outgoingByName: true,
        generalStatus: true,
        orgNode: { select: { name: true } },
      },
    });
    if (!h) return null;

    const roleIds = await this.rolesWithPermission("shifthandover:acknowledge");
    let candidates = await this.usersOfRoleIds(roleIds);
    if (h.outgoingById) candidates = candidates.filter((u) => u !== h.outgoingById);
    const userIds = new Set(await this.filterByNode(candidates, h.orgNodeId));

    const openItems = String(payload.openItemCount ?? "0");
    const appUrl = this.appUrl();
    return {
      userIds,
      externalEmails: [],
      orgNodeId: h.orgNodeId,
      templateId: null,
      relatedEntityType: "ShiftHandover",
      relatedEntityId: handoverId,
      context: {
        "handover.code": `SH-${String(h.number).padStart(4, "0")}`,
        "handover.node": h.orgNode?.name ?? "—",
        "handover.shift": h.shiftLabel ?? h.shiftCode ?? "—",
        "handover.incomingShift": h.incomingShiftCode ?? "—",
        "handover.outgoingBy": h.outgoingByName ?? String(payload.outgoingByName ?? "—"),
        "handover.generalStatus": this.generalStatusLabel(h.generalStatus),
        "handover.openItems": openItems,
        "handover.url": `${appUrl}/cambio-turno?handoverId=${handoverId}`,
      },
    };
  }

  private generalStatusLabel(status: string | null): string {
    switch (status) {
      case "OPERATIONAL":
        return "Operativo";
      case "OPERATIONAL_WITH_OBSERVATIONS":
        return "Operativo con observaciones";
      case "STOPPED_MAINTENANCE":
        return "Detenido por mantención";
      case "STOPPED_FAILURE":
        return "Detenido por falla";
      default:
        return "—";
    }
  }

  // --- Resolver de LICENCIA (L6) ---------------------------------------------

  /**
   * Avisos de licencia de la instalación. Destinatarios = usuarios con un rol
   * que concede `settings:manage` (los administradores del sistema — permiso
   * CONFIGURABLE, jamás un nombre de rol en duro), SIN filtro ABAC de nodo: la
   * licencia es de la INSTALACIÓN completa, no de un área. El contexto se
   * formatea DESDE EL PAYLOAD del evento (congelado por la instancia que
   * detectó el estado, `LicenseService.noticePayload`): con BD compartida
   * entre instancias, el dispatcher que toma el evento puede tener OTRO estado
   * local — el suceso manda. Sin licenseId/customer/huella/linaje (L2c/L6c).
   */
  private async resolveLicenseEvent(
    eventKey: string,
    payload: Record<string, unknown>,
  ): Promise<EventResolution | null> {
    const status = typeof payload.status === "string" ? payload.status : "";
    if (!status) return null;

    const roleIds = await this.rolesWithPermission("settings:manage");
    const userIds = new Set(await this.usersOfRoleIds(roleIds));

    const graceDaysRemaining = typeof payload.graceDaysRemaining === "number" ? payload.graceDaysRemaining : undefined;
    const daysToExpiry = typeof payload.daysToExpiry === "number" ? payload.daysToExpiry : undefined;
    const daysLeft =
      status === "EN_GRACIA"
        ? graceDaysRemaining
        : daysToExpiry !== undefined && daysToExpiry >= 0
          ? daysToExpiry
          : undefined;
    const context: Record<string, string> = {
      "license.status": licenseStatusLabel(status),
      "license.reason": typeof payload.reason === "string" && payload.reason ? licenseReasonLabel(payload.reason) : "—",
      "license.edition": typeof payload.edition === "string" && payload.edition ? payload.edition : "—",
      "license.expiresAt":
        typeof payload.expiresAt === "string" && payload.expiresAt
          ? this.formatDateTime(new Date(payload.expiresAt))
          : "—",
      "license.daysLeft": daysLeft !== undefined ? String(daysLeft) : "—",
    };
    if (eventKey === "license.state.changed") {
      context["license.fromStatus"] = licenseStatusLabel(String(payload.from ?? ""));
      context["license.toStatus"] = licenseStatusLabel(String(payload.to ?? ""));
    }

    return {
      userIds,
      externalEmails: [],
      // Sin nodo/plantilla: los suscriptores explícitos no se filtran por ABAC.
      orgNodeId: null,
      templateId: null,
      // Id FIJO "system" (fila única): el installationId real NO viaja a la bandeja.
      relatedEntityType: "LicenseInstallation",
      relatedEntityId: "system",
      context,
    };
  }

  /** Roles que conceden un permiso (por su clave del catálogo). */
  private async rolesWithPermission(permissionKey: string): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { permission: { key: permissionKey } },
      select: { roleId: true },
    });
    return [...new Set(rows.map((r) => r.roleId))];
  }

  /** Parte común de la EventResolution de una incidencia (orgNode, related, sin templateId/campos). */
  private baseIncidentResolution(inc: LoadedIncident, incidentId: string, userIds: Set<string>): EventResolution {
    return {
      userIds,
      externalEmails: [],
      orgNodeId: inc.orgNodeId,
      templateId: null,
      relatedEntityType: "Incident",
      relatedEntityId: incidentId,
      context: {},
    };
  }

  /**
   * Destinatarios de una incidencia: responsable asignado + (opcional) usuarios de los
   * roles autorizados a actuar desde el estado actual + (opcional) rol de escalamiento.
   * Todo filtrado por ABAC de NODO (las incidencias no se restringen por plantilla).
   */
  private async incidentRecipients(
    inc: LoadedIncident,
    opts: { includeStateRoles?: boolean; escalationRoleId?: string | null },
  ): Promise<Set<string>> {
    const candidates = new Set<string>();
    if (inc.ownerId) candidates.add(inc.ownerId);
    if (opts.includeStateRoles && inc.currentStateKey) {
      const roleIds = new Set<string>();
      for (const t of inc.transitions) if (t.fromStateKey === inc.currentStateKey) for (const rid of t.roleIds) roleIds.add(rid);
      for (const u of await this.usersOfRoleIds([...roleIds])) candidates.add(u);
    }
    if (opts.escalationRoleId) for (const u of await this.usersOfRoleIds([opts.escalationRoleId])) candidates.add(u);
    return new Set(await this.filterByNode([...candidates], inc.orgNodeId));
  }

  /** Expande roles a usuarios (sin ABAC; el llamador filtra por nodo). */
  private async usersOfRoleIds(roleIds: string[]): Promise<string[]> {
    if (roleIds.length === 0) return [];
    const rows = await this.prisma.userRole.findMany({ where: { roleId: { in: roleIds } }, select: { userId: true } });
    return [...new Set(rows.map((r) => r.userId))];
  }

  /** Filtra usuarios por ABAC de NODO (incidencias no usan plantilla). */
  private async filterByNode(userIds: string[], orgNodeId: string): Promise<string[]> {
    const out: string[] = [];
    for (const uid of userIds) if (await this.scope.canAccessNode(uid, orgNodeId)) out.push(uid);
    return out;
  }

  private incidentContext(inc: LoadedIncident): Record<string, string> {
    return {
      "incident.folio": `INC-${String(inc.number).padStart(4, "0")}`,
      "incident.title": inc.title,
      "incident.type": inc.typeName ?? "—",
      "incident.severity": String(inc.severity),
      "incident.node": inc.nodeName ?? "—",
      "incident.state": inc.currentStateName ?? "—",
      "incident.owner": inc.ownerName ?? "—",
      "incident.url": `${this.appUrl()}/incidencias?incidentId=${inc.id}`,
    };
  }

  /** Carga una incidencia + su versión de flujo congelada (estados + roles de transición). */
  private async loadIncidentForNotification(incidentId: string): Promise<LoadedIncident | null> {
    const inc = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: {
        id: true,
        number: true,
        title: true,
        severity: true,
        orgNodeId: true,
        ownerId: true,
        lifecycle: true,
        dueAt: true,
        currentStateKey: true,
        currentStateSince: true,
        workflowDefinitionVersionId: true,
        type: { select: { name: true, escalationAfterMinutes: true, escalationRoleId: true } },
        orgNode: { select: { name: true } },
      },
    });
    if (!inc) return null;
    let currentStateName: string | null = null;
    let currentStateMaxStay: number | null = null;
    let transitions: Array<{ fromStateKey: string; roleIds: string[] }> = [];
    if (inc.workflowDefinitionVersionId) {
      const wf = await this.prisma.workflowDefinitionVersion.findUnique({
        where: { id: inc.workflowDefinitionVersionId },
        include: workflowVersionInclude,
      });
      if (wf) {
        const state = wf.states.find((s) => s.key === inc.currentStateKey);
        currentStateName = state?.name ?? null;
        currentStateMaxStay = state?.maxStayMinutes ?? null;
        transitions = wf.transitions.map((t) => ({ fromStateKey: t.fromState.key, roleIds: t.roles.map((r) => r.roleId) }));
      }
    }
    const ownerName = inc.ownerId ? await this.userName(inc.ownerId) : null;
    return {
      id: inc.id,
      number: inc.number,
      title: inc.title,
      severity: inc.severity,
      typeName: inc.type?.name ?? null,
      orgNodeId: inc.orgNodeId,
      nodeName: inc.orgNode?.name ?? null,
      ownerId: inc.ownerId,
      ownerName,
      lifecycle: inc.lifecycle,
      dueAt: inc.dueAt,
      currentStateKey: inc.currentStateKey,
      currentStateName,
      currentStateSince: inc.currentStateSince,
      currentStateMaxStay,
      escalationAfterMinutes: inc.type?.escalationAfterMinutes ?? null,
      escalationRoleId: inc.type?.escalationRoleId ?? null,
      transitions,
    };
  }

  // --- Resolvers de ÓRDENES DE TRABAJO (OT S6) -------------------------------

  /** Plazo de resolución vencido: responsable + roles del estado + (si aplica) escalamiento. */
  private async resolveWorkOrderOverdue(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const workOrderId = String(payload.workOrderId ?? "");
    if (!workOrderId) return null;
    const wo = await this.loadWorkOrderForNotification(workOrderId);
    if (!wo || wo.lifecycle !== "OPEN" || !wo.dueAt || wo.dueAt.getTime() >= Date.now()) return null;
    const escalate = workOrderShouldEscalate(wo.dueAt, wo.escalationAfterMinutes, Date.now());
    const userIds = await this.workOrderRecipients(wo, {
      includeStateRoles: true,
      escalationRoleId: escalate ? wo.escalationRoleId : null,
    });
    const overdueBy = Math.round((Date.now() - wo.dueAt.getTime()) / 60000);
    return {
      ...this.baseWorkOrderResolution(wo, workOrderId, userIds),
      context: {
        ...this.workOrderContext(wo),
        "workorder.dueAt": this.formatDateTime(wo.dueAt),
        "workorder.overdueBy": this.formatDuration(overdueBy),
      },
    };
  }

  /** Permanencia de estado excedida ("estancada"): responsable + roles del estado actual. */
  private async resolveWorkOrderStalled(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const workOrderId = String(payload.workOrderId ?? "");
    const stateKey = String(payload.stateKey ?? "");
    if (!workOrderId) return null;
    const wo = await this.loadWorkOrderForNotification(workOrderId);
    if (!wo || wo.lifecycle !== "OPEN") return null;
    if (stateKey && wo.currentStateKey !== stateKey) return null; // ya avanzó de estado
    const userIds = await this.workOrderRecipients(wo, { includeStateRoles: true });
    const since = wo.currentStateSince ?? new Date();
    const delayedMin = Math.round((Date.now() - since.getTime()) / 60000) - (wo.currentStateMaxStay ?? 0);
    return {
      ...this.baseWorkOrderResolution(wo, workOrderId, userIds),
      context: {
        ...this.workOrderContext(wo),
        "workorder.sla": this.formatDuration(wo.currentStateMaxStay ?? 0),
        "workorder.delayedBy": this.formatDuration(Math.max(0, delayedMin)),
      },
    };
  }

  /** Actividad del plan vencida: responsable de la actividad (persona+rol) + responsable de la OT. */
  private async resolveWorkOrderActivityOverdue(payload: Record<string, unknown>): Promise<EventResolution | null> {
    const workOrderId = String(payload.workOrderId ?? "");
    const activityId = String(payload.activityId ?? "");
    if (!workOrderId || !activityId) return null;
    const wo = await this.loadWorkOrderForNotification(workOrderId);
    if (!wo || wo.lifecycle !== "OPEN") return null;
    const activity = await this.prisma.workActivity.findUnique({
      where: { id: activityId },
      select: { id: true, title: true, status: true, baselineEnd: true, plannedEnd: true, responsibleId: true, responsibleRoleId: true },
    });
    if (!activity || ["DONE", "CANCELED"].includes(activity.status)) return null;
    const end = activity.baselineEnd ?? activity.plannedEnd;
    if (!end || end.getTime() >= Date.now()) return null;
    const candidates = new Set<string>();
    if (activity.responsibleId) candidates.add(activity.responsibleId);
    if (activity.responsibleRoleId) for (const u of await this.usersOfRoleIds([activity.responsibleRoleId])) candidates.add(u);
    if (wo.ownerId) candidates.add(wo.ownerId);
    const userIds = new Set(await this.filterByNode([...candidates], wo.orgNodeId));
    const overdueBy = Math.round((Date.now() - end.getTime()) / 60000);
    return {
      ...this.baseWorkOrderResolution(wo, workOrderId, userIds),
      context: {
        ...this.workOrderContext(wo),
        "activity.title": activity.title,
        "activity.dueAt": this.formatDateTime(end),
        "activity.overdueBy": this.formatDuration(overdueBy),
      },
    };
  }

  /**
   * Competencia por vencer/vencida de una persona en el roster de una OT abierta (Dotación
   * S2). Destinatarios = responsable de la OT + roles del estado actual (ABAC por nodo).
   * El destinatario "la persona" queda para el futuro (traza ISN). Re-verifica en vivo.
   */
  private async resolveWorkerCompetency(payload: Record<string, unknown>, mode: "expiring" | "expired"): Promise<EventResolution | null> {
    const workOrderId = String(payload.workOrderId ?? "");
    const competencyId = String(payload.competencyId ?? "");
    if (!workOrderId || !competencyId) return null;
    const wo = await this.loadWorkOrderForNotification(workOrderId);
    if (!wo || wo.lifecycle !== "OPEN") return null;
    // Re-verificar contra el estado ACTUAL: la competencia sigue existiendo y la persona
    // sigue en el roster (evita avisar tras renovar/quitar entre el barrido y el envío).
    const comp = await this.prisma.personCompetency.findFirst({
      where: { id: competencyId, deletedAt: null },
      select: { id: true, personId: true, expiresAt: true, competencyType: { select: { name: true } } },
    });
    if (!comp || !comp.expiresAt) return null;
    const expired = comp.expiresAt.getTime() <= Date.now();
    if (mode === "expired" && !expired) return null;
    if (mode === "expiring" && expired) return null;
    const stillOnRoster = await this.prisma.workOrderWorker.count({ where: { workOrderId, personId: comp.personId, removedAt: null } });
    if (stillOnRoster === 0) return null;
    const personName = String(payload.personName ?? "");
    const userIds = await this.workOrderRecipients(wo, { includeStateRoles: true });
    const minutesTo = Math.round((comp.expiresAt.getTime() - Date.now()) / 60000);
    return {
      ...this.baseWorkOrderResolution(wo, workOrderId, userIds),
      context: {
        ...this.workOrderContext(wo),
        "worker.name": personName,
        "worker.competency": comp.competencyType.name,
        "worker.expiresAt": this.formatDateTime(comp.expiresAt),
        "worker.expiresIn": mode === "expiring" ? this.formatDuration(Math.max(0, minutesTo)) : this.formatDuration(Math.max(0, -minutesTo)),
      },
    };
  }

  /**
   * Acreditación de EMPRESA contratista por vencer/vencida con personal en el roster de una OT
   * abierta cuyo tipo la exige (Dotación S3). Destinatarios = responsable de la OT + roles del
   * estado actual (ABAC por nodo). Re-verifica en vivo el estado de la empresa y que siga con
   * personal en el roster (evita avisar tras re-acreditar/quitar entre el barrido y el envío).
   */
  private async resolveContractorAccreditation(payload: Record<string, unknown>, mode: "expiring" | "expired"): Promise<EventResolution | null> {
    const workOrderId = String(payload.workOrderId ?? "");
    const companyId = String(payload.companyId ?? "");
    if (!workOrderId || !companyId) return null;
    const wo = await this.loadWorkOrderForNotification(workOrderId);
    if (!wo || wo.lifecycle !== "OPEN") return null;
    const company = await this.prisma.contractorCompany.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { name: true, accreditationGrade: true, accreditationStatus: true, accreditedUntil: true },
    });
    if (!company || !company.accreditedUntil) return null;
    // Re-verificar contra el estado ACTUAL: sólo ACCREDITED/CONDITIONAL siguen siendo "por
    // vencer/vencida" (otros estados ya son un rojo distinto); y el vencimiento debe calzar.
    if (company.accreditationStatus !== "ACCREDITED" && company.accreditationStatus !== "CONDITIONAL") return null;
    const expired = company.accreditedUntil.getTime() <= Date.now();
    if (mode === "expired" && !expired) return null;
    if (mode === "expiring" && expired) return null;
    // Sigue con personal contratista de esa empresa en el roster de esta OT.
    const stillStaffed = await this.prisma.workOrderWorker.count({
      where: { workOrderId, removedAt: null, person: { contractorCompanyId: companyId, kind: "CONTRACTOR" } },
    });
    if (stillStaffed === 0) return null;
    const userIds = await this.workOrderRecipients(wo, { includeStateRoles: true });
    const minutesTo = Math.round((company.accreditedUntil.getTime() - Date.now()) / 60000);
    return {
      ...this.baseWorkOrderResolution(wo, workOrderId, userIds),
      context: {
        ...this.workOrderContext(wo),
        "company.name": company.name,
        "company.grade": company.accreditationGrade ?? "—",
        "company.accreditedUntil": this.formatDateTime(company.accreditedUntil),
        "company.expiresIn": mode === "expiring" ? this.formatDuration(Math.max(0, minutesTo)) : this.formatDuration(Math.max(0, -minutesTo)),
      },
    };
  }

  /** Parte común de la EventResolution de una OT (orgNode, related, sin templateId/campos). */
  private baseWorkOrderResolution(wo: LoadedWorkOrder, workOrderId: string, userIds: Set<string>): EventResolution {
    return {
      userIds,
      externalEmails: [],
      orgNodeId: wo.orgNodeId,
      templateId: null,
      relatedEntityType: "WorkOrder",
      relatedEntityId: workOrderId,
      context: {},
    };
  }

  /**
   * Destinatarios de una OT: responsable asignado + (opcional) usuarios de los roles
   * autorizados a actuar desde el estado actual + (opcional) rol de escalamiento. Todo
   * filtrado por ABAC de NODO (espejo de `incidentRecipients`).
   */
  private async workOrderRecipients(
    wo: LoadedWorkOrder,
    opts: { includeStateRoles?: boolean; escalationRoleId?: string | null },
  ): Promise<Set<string>> {
    const candidates = new Set<string>();
    if (wo.ownerId) candidates.add(wo.ownerId);
    if (opts.includeStateRoles && wo.currentStateKey) {
      const roleIds = new Set<string>();
      for (const t of wo.transitions) if (t.fromStateKey === wo.currentStateKey) for (const rid of t.roleIds) roleIds.add(rid);
      for (const u of await this.usersOfRoleIds([...roleIds])) candidates.add(u);
    }
    if (opts.escalationRoleId) for (const u of await this.usersOfRoleIds([opts.escalationRoleId])) candidates.add(u);
    return new Set(await this.filterByNode([...candidates], wo.orgNodeId));
  }

  private workOrderContext(wo: LoadedWorkOrder): Record<string, string> {
    return {
      "workorder.folio": workOrderCode(wo.folio, wo.number),
      "workorder.title": wo.title,
      "workorder.type": wo.typeName ?? "—",
      "workorder.criticality": String(wo.criticality),
      "workorder.node": wo.nodeName ?? "—",
      "workorder.state": wo.currentStateName ?? "—",
      "workorder.owner": wo.ownerName ?? "—",
      "workorder.url": `${this.appUrl()}/ordenes-trabajo/${wo.id}`,
    };
  }

  /** Carga una OT + su versión de flujo congelada (estados + roles de transición). */
  private async loadWorkOrderForNotification(workOrderId: string): Promise<LoadedWorkOrder | null> {
    const wo = await this.prisma.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        number: true,
        folio: true,
        title: true,
        criticality: true,
        orgNodeId: true,
        ownerId: true,
        lifecycle: true,
        dueAt: true,
        currentStateKey: true,
        currentStateSince: true,
        workflowDefinitionVersionId: true,
        type: { select: { name: true, escalationAfterMinutes: true, escalationRoleId: true } },
        orgNode: { select: { name: true } },
      },
    });
    if (!wo) return null;
    let currentStateName: string | null = null;
    let currentStateMaxStay: number | null = null;
    let transitions: Array<{ fromStateKey: string; roleIds: string[] }> = [];
    if (wo.workflowDefinitionVersionId) {
      const wf = await this.prisma.workflowDefinitionVersion.findUnique({
        where: { id: wo.workflowDefinitionVersionId },
        include: workflowVersionInclude,
      });
      if (wf) {
        const state = wf.states.find((s) => s.key === wo.currentStateKey);
        currentStateName = state?.name ?? null;
        currentStateMaxStay = state?.maxStayMinutes ?? null;
        transitions = wf.transitions.map((t) => ({ fromStateKey: t.fromState.key, roleIds: t.roles.map((r) => r.roleId) }));
      }
    }
    const ownerName = wo.ownerId ? await this.userName(wo.ownerId) : null;
    return {
      id: wo.id,
      number: wo.number,
      folio: wo.folio,
      title: wo.title,
      criticality: wo.criticality,
      typeName: wo.type?.name ?? null,
      orgNodeId: wo.orgNodeId,
      nodeName: wo.orgNode?.name ?? null,
      ownerId: wo.ownerId,
      ownerName,
      lifecycle: wo.lifecycle,
      dueAt: wo.dueAt,
      currentStateKey: wo.currentStateKey,
      currentStateName,
      currentStateSince: wo.currentStateSince,
      currentStateMaxStay,
      escalationAfterMinutes: wo.type?.escalationAfterMinutes ?? null,
      escalationRoleId: wo.type?.escalationRoleId ?? null,
      transitions,
    };
  }

  // --- Helpers de entrada / workflow -----------------------------------------

  private async loadEntryForNotification(entryId: string): Promise<LoadedEntry | null> {
    const entry = await this.prisma.logEntry.findUnique({
      where: { id: entryId },
      select: {
        id: true,
        entryNumber: true,
        orgNodeId: true,
        templateId: true,
        templateVersionId: true,
        createdById: true,
        currentStateKey: true,
        currentStateSince: true,
        status: true,
        workflowDefinitionVersionId: true,
        template: { select: { name: true, gridFieldKeys: true } },
        orgNode: { select: { name: true } },
      },
    });
    if (!entry || !entry.workflowDefinitionVersionId) return null;
    const wf = await this.prisma.workflowDefinitionVersion.findUnique({
      where: { id: entry.workflowDefinitionVersionId },
      include: workflowVersionInclude,
    });
    if (!wf) return null;
    return {
      id: entry.id,
      entryNumber: entry.entryNumber,
      orgNodeId: entry.orgNodeId,
      templateId: entry.templateId,
      templateVersionId: entry.templateVersionId,
      createdById: entry.createdById,
      currentStateKey: entry.currentStateKey,
      currentStateSince: entry.currentStateSince,
      status: entry.status,
      templateName: entry.template?.name ?? null,
      nodeName: entry.orgNode?.name ?? null,
      summaryText: await this.buildEntrySummary(entry.id, entry.templateVersionId, entry.template?.gridFieldKeys ?? []),
      states: new Map(wf.states.map((s) => [s.key, { name: s.name, maxStayMinutes: s.maxStayMinutes }])),
      transitions: wf.transitions.map((t) => ({
        key: t.key,
        fromStateKey: t.fromState.key,
        requireSignature: t.requireSignature,
        roleIds: t.roles.map((r) => r.roleId),
        notify: parseNotifyConfig(t.notifyConfig),
      })),
    };
  }

  /**
   * `{{entry.summary}}`: los campos de RESUMEN configurados en la plantilla
   * (`gridFieldKeys`), formateados "Etiqueta: valor unidad" y unidos por " · ". Reusa
   * la gobernanza existente (mismos campos que la grilla); resuelve code→label de los
   * SELECT inline y la unidad de los NUMBER. Omite los vacíos. Cadena vacía si la
   * plantilla no configuró resumen (la variable simplemente no aporta texto).
   */
  private async buildEntrySummary(entryId: string, templateVersionId: string, gridFieldKeys: string[]): Promise<string> {
    const keys = gridFieldKeys.filter(Boolean);
    if (keys.length === 0) return "";
    const [version, values] = await Promise.all([
      this.prisma.templateVersion.findUnique({
        where: { id: templateVersionId },
        select: { sections: { select: { fields: { select: { key: true, label: true, config: true } } } } },
      }),
      this.prisma.logEntryValue.findMany({
        where: { logEntryId: entryId, fieldKey: { in: keys } },
        select: { fieldKey: true, value: true },
      }),
    ]);
    const meta = new Map<string, { label: string; config: Record<string, unknown> }>();
    for (const s of version?.sections ?? []) {
      for (const f of s.fields) meta.set(f.key, { label: f.label, config: (f.config as Record<string, unknown>) ?? {} });
    }
    const valueByKey = new Map(values.map((v) => [v.fieldKey, v.value]));
    const parts: string[] = [];
    for (const key of keys) {
      const m = meta.get(key);
      if (!m) continue;
      const raw = valueByKey.get(key);
      const text = formatSummaryScalar(raw, m.config);
      if (text === "") continue;
      const unit = typeof m.config.unit === "string" ? ` ${m.config.unit}` : "";
      parts.push(`${m.label}: ${text}${unit}`);
    }
    return parts.join(" · ");
  }

  /**
   * Usuarios responsables de un estado = roles autorizados en las transiciones que
   * SALEN de ese estado (filtrable a las que exigen firma), expandidos a usuarios y
   * filtrados por ABAC (nodo ∩ plantilla). Sin roles en las transiciones (transición
   * abierta) ⇒ sin destinatario derivado (no se spamea a toda la plataforma).
   */
  private async stateActorUserIds(
    entry: LoadedEntry,
    stateKey: string,
    opts: { signatureOnly?: boolean; excludeUserId?: string | null },
  ): Promise<string[]> {
    const roleIds = new Set<string>();
    for (const t of entry.transitions) {
      if (t.fromStateKey !== stateKey) continue;
      if (opts.signatureOnly && !t.requireSignature) continue;
      for (const rid of t.roleIds) roleIds.add(rid);
    }
    if (roleIds.size === 0) return [];
    const rows = await this.prisma.userRole.findMany({
      where: { roleId: { in: [...roleIds] } },
      select: { userId: true },
    });
    const candidates = [...new Set(rows.map((r) => r.userId))].filter((u) => u !== opts.excludeUserId);
    return this.filterByAbac(candidates, entry.orgNodeId, entry.templateId);
  }

  /** Suscriptores explícitos (usuario + rol-expandido) de un evento, filtrados por ABAC. */
  private async subscriptionRecipients(
    eventKey: string,
    orgNodeId: string | null,
    templateId: string | null,
  ): Promise<string[]> {
    const subs = await this.prisma.notificationSubscription.findMany({
      where: { eventKey, enabled: true },
      select: { subjectUserId: true, subjectRoleId: true, templateId: true },
    });
    if (subs.length === 0) return [];
    const userIds = new Set<string>();
    for (const s of subs) {
      if (s.templateId && s.templateId !== templateId) continue; // filtro propio de la suscripción
      if (s.subjectUserId) userIds.add(s.subjectUserId);
      else if (s.subjectRoleId) {
        const rows = await this.prisma.userRole.findMany({ where: { roleId: s.subjectRoleId }, select: { userId: true } });
        for (const r of rows) userIds.add(r.userId);
      }
    }
    if (!orgNodeId) return [...userIds];
    // Incidencias no tienen plantilla: ABAC solo por nodo. Resto: nodo ∩ plantilla.
    if (!templateId) return this.filterByNode([...userIds], orgNodeId);
    return this.filterByAbac([...userIds], orgNodeId, templateId);
  }

  /** Filtra usuarios por ABAC: deben alcanzar el nodo Y la plantilla del evento. */
  private async filterByAbac(userIds: string[], orgNodeId: string, templateId: string): Promise<string[]> {
    const out: string[] = [];
    for (const uid of userIds) {
      if ((await this.scope.canAccessNode(uid, orgNodeId)) && (await this.scope.canAccessTemplate(uid, templateId))) {
        out.push(uid);
      }
    }
    return out;
  }

  private entryContext(entry: LoadedEntry): Record<string, string> {
    return {
      "entry.folio": `#${entry.entryNumber}`,
      "entry.template": entry.templateName ?? "—",
      "entry.node": entry.nodeName ?? "—",
      "entry.url": `${this.appUrl()}/bitacoras/${entry.id}`,
      "entry.summary": entry.summaryText,
    };
  }

  private async userName(userId: string): Promise<string> {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return u?.displayName ?? "—";
  }

  private appUrl(): string {
    return this.config.get("APP_PUBLIC_URL", { infer: true }).replace(/\/+$/, "");
  }

  // --- Formato (es-CL) -------------------------------------------------------

  private formatDateTime(d: Date): string {
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "America/Santiago",
    }).format(d);
  }

  private formatDuration(totalMinutes: number): string {
    const m = Math.max(0, Math.round(totalMinutes));
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    const rem = m % 60;
    if (h < 24) return rem === 0 ? `${h} h` : `${h} h ${rem} min`;
    const days = Math.floor(h / 24);
    const remH = h % 24;
    return remH === 0 ? `${days} d` : `${days} d ${remH} h`;
  }
}

/** Entrada normalizada para resolver destinatarios + contexto de notificación. */
interface LoadedEntry {
  id: string;
  entryNumber: number;
  orgNodeId: string;
  templateId: string;
  templateVersionId: string;
  createdById: string | null;
  currentStateKey: string | null;
  currentStateSince: Date | null;
  status: string;
  templateName: string | null;
  nodeName: string | null;
  /** `{{entry.summary}}` ya formateado (campos de resumen de la plantilla). */
  summaryText: string;
  states: Map<string, { name: string; maxStayMinutes: number | null }>;
  transitions: Array<{
    key: string;
    fromStateKey: string;
    requireSignature: boolean;
    roleIds: string[];
    /** Config de aviso CONGELADA en la transición (null = sin config explícita). */
    notify: TransitionNotifyConfig | null;
  }>;
}

/** Incidencia normalizada para resolver destinatarios + contexto de notificación (4.4). */
interface LoadedIncident {
  id: string;
  number: number;
  title: string;
  severity: number;
  typeName: string | null;
  orgNodeId: string;
  nodeName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  lifecycle: string;
  dueAt: Date | null;
  currentStateKey: string | null;
  currentStateName: string | null;
  currentStateSince: Date | null;
  currentStateMaxStay: number | null;
  escalationAfterMinutes: number | null;
  escalationRoleId: string | null;
  transitions: Array<{ fromStateKey: string; roleIds: string[] }>;
}

/** OT normalizada para resolver destinatarios + contexto de notificación (OT S6). */
interface LoadedWorkOrder {
  id: string;
  number: number;
  folio: string | null;
  title: string;
  criticality: number;
  typeName: string | null;
  orgNodeId: string;
  nodeName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  lifecycle: string;
  dueAt: Date | null;
  currentStateKey: string | null;
  currentStateName: string | null;
  currentStateSince: Date | null;
  currentStateMaxStay: number | null;
  escalationAfterMinutes: number | null;
  escalationRoleId: string | null;
  transitions: Array<{ fromStateKey: string; roleIds: string[] }>;
}

/** Estados de licencia humanizados (es-CL) para las plantillas de aviso (L6). */
const LICENSE_STATUS_LABELS: Record<string, string> = {
  VALIDA: "Válida",
  POR_VENCER: "Por vencer",
  EN_GRACIA: "En gracia (vencida)",
  SOLO_LECTURA: "Solo lectura",
  BLOQUEADA: "Bloqueada",
  PENDIENTE_ACTIVACION: "Pendiente de activación",
  LIMITE_EXCEDIDO: "Límite excedido",
  MODULO_NO_LICENCIADO: "Módulo no licenciado",
};

/** Motivos de estado humanizados (es-CL); un motivo desconocido se muestra en crudo. */
const LICENSE_REASON_LABELS: Record<string, string> = {
  EXPIRING_SOON: "La licencia está por vencer",
  EXPIRED_IN_GRACE: "Licencia vencida, dentro del período de gracia",
  EXPIRED_BEYOND_GRACE: "Licencia vencida y período de gracia agotado",
  LIMITS_EXCEEDED: "La instalación supera los límites contratados",
  LICENSE_FILE_MISSING: "No hay archivo de licencia (instalación sin activar)",
  LINEAGE_MISMATCH: "La licencia no corresponde a esta instalación",
  FINGERPRINT_MISMATCH: "La licencia no corresponde a este servidor",
  INVALID_SIGNATURE: "La firma de la licencia no es válida",
  MALFORMED_JWS: "El archivo de licencia está dañado",
  INVALID_TEMPORAL_FIELDS: "El archivo de licencia tiene fechas inválidas",
  NOT_YET_VALID: "La licencia aún no entra en vigencia",
};

function licenseStatusLabel(status: string): string {
  return (status && LICENSE_STATUS_LABELS[status]) || status || "—";
}

function licenseReasonLabel(reason: string): string {
  return LICENSE_REASON_LABELS[reason] ?? reason;
}

/** Parsea (defensivo) la config de aviso congelada de una transición. JSON corrupto ⇒ null. */
function parseNotifyConfig(raw: unknown): TransitionNotifyConfig | null {
  if (raw == null) return null;
  const r = transitionNotifyConfigSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/**
 * Formatea un valor de campo de resumen a texto (resuelve code→label de SELECT
 * inline; Sí/No para booleanos). Vacío ⇒ "" (se omite del resumen).
 */
function formatSummaryScalar(raw: unknown, config: Record<string, unknown>): string {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "boolean") return raw ? "Sí" : "No";
  // SELECT inline: resuelve el código a su etiqueta.
  const options = Array.isArray(config.options) ? (config.options as Array<Record<string, unknown>>) : [];
  if ((typeof raw === "string" || typeof raw === "number") && options.length > 0) {
    const opt = options.find((o) => String(o.value ?? o.code) === String(raw));
    if (opt && typeof opt.label === "string") return opt.label;
  }
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "string") return raw;
  // Estructurado (tabla/matriz/rango/adjunto): no se incrusta en el resumen del correo.
  return "";
}
