import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { NotificationEvent } from "@prisma/client";
import {
  FIELD_VARIABLE_PREFIX,
  allowedVariablesForTemplate,
  extractPlaceholders,
  fieldVariableName,
  isFieldVariable,
  notificationEventDef,
  pickTemplateForScope,
  renderTemplate,
  transitionNotifyConfigSchema,
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
    const pushMessage = (recipientUserId: string | null, email: string, name: string, dedupeKey: string) => {
      const context: Record<string, string> = { ...baseContext, "recipient.name": name };
      // Defensa en profundidad: el contexto solo expone variables permitidas de la plantilla.
      for (const key of Object.keys(context)) if (!allowed.has(key)) delete context[key];
      messages.push({
        recipientUserId,
        recipientEmail: email,
        subject: renderTemplate(template.subject, context),
        bodyText: renderTemplate(template.bodyText, context),
        bodyHtml: renderTemplate(template.bodyHtml, context),
        dedupeKey,
        relatedEntityType: resolution.relatedEntityType,
        relatedEntityId: resolution.relatedEntityId,
      });
    };

    // Destinatarios INTERNOS: usuario activo + correo, menos los que optaron por NO recibir.
    const userIds = [...resolution.userIds];
    if (userIds.length > 0) {
      const [users, optedOut] = await Promise.all([
        this.prisma.user.findMany({
          where: { id: { in: userIds }, status: { not: "DISABLED" } },
          select: { id: true, email: true, displayName: true },
        }),
        this.prisma.notificationPreference.findMany({
          where: { userId: { in: userIds }, eventKey: event.eventKey, channel: "EMAIL", mode: "OFF" },
          select: { userId: true },
        }),
      ]);
      const offSet = new Set(optedOut.map((p) => p.userId));
      for (const user of users) {
        if (offSet.has(user.id) || !user.email) continue;
        pushMessage(user.id, user.email, user.displayName, `${event.eventKey}|${event.id}|${user.id}`);
      }
    }

    // Destinatarios EXTERNOS: sin usuario, sin ABAC, sin preferencias (gobernanza explícita).
    for (const email of new Set(resolution.externalEmails)) {
      pushMessage(null, email, email, `${event.eventKey}|${event.id}|ext:${email}`);
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
    if (!orgNodeId || !templateId) return [...userIds];
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
