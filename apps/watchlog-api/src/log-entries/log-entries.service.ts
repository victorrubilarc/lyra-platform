import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AvailableTransitionDto,
  ComputedFieldConfig,
  CreateLogEntryRequest,
  CrossRule,
  EditWindowAnchor,
  EditWindowInfo,
  EquipmentMode,
  ExecuteTransitionRequest,
  FieldForRules,
  FieldForValidation,
  LogEntryDetail,
  LogEntrySectionState,
  LogEntrySectionStateDto,
  LogEntrySignatureDto,
  LogEntrySignatureSummaryDto,
  LogEntryTransitionDto,
  LogEntryValueDto,
  SaveLogEntrySectionRequest,
  SectionBlockedReason,
  SetDeferralRequest,
  SignatureContext,
  SignatureMethod,
  SubmitLogEntryRequest,
  TemplateEligibleNodes,
  TemplateVersionDto,
  VoidLogEntryRequest,
  WorkflowVersionDto,
} from "@lyra/contracts";
import {
  availableTransitionsFor,
  canonicalSignaturePayload,
  editWindowDeadline,
  evaluateCrossRules,
  isEditWindowExpired,
  isEmptyValue,
  isFieldVisible,
  isSectionEditableInState,
  recomputeComputedValues,
  resolveEditWindow,
  resolveEffectiveAt,
  thresholdBandFor,
  upgradeFieldConfig,
  validateFieldValue,
} from "@lyra/contracts";
import { Prisma } from "@prisma/client";
import { ReauthService } from "../auth/reauth.service";
import { AuditService, type AuditContext } from "../audit/audit.service";
import { PermissionService } from "../authz/permission.service";
import { ScopeService } from "../authz/scope.service";
import { EncryptionService } from "../crypto/encryption.service";
import { ShiftResolver } from "../operational-calendar/shift-resolver";
import { FiscalResolver } from "../fiscal-calendar/fiscal-resolver";
import { OperationalPeriodService } from "../operational-periods/operational-periods.service";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";

/** Significado por defecto de la firma de completitud de sección (las secciones no
 * portan un campo de significado; las transiciones sí vía `signatureMeaning`). */
const SECTION_SIGNATURE_MEANING = "Sección completada y firmada";

/**
 * Permiso de excepción que permite escribir con la ventana de edición VENCIDA
 * (Fase 2.7.2). Espejo de `opsperiod:write-closed`, con una diferencia GxP: este
 * override exige MOTIVO auditado en cada escritura (corrección excepcional).
 */
export const EDIT_WINDOW_OVERRIDE_PERMISSION = "logentry:write-expired";

/** Huella de un override de ventana de edición concedido (para estampar/auditar). */
interface EditWindowOverride {
  reason: string;
  mfaVerified: boolean;
  windowExpiredAt: string;
}

/** Versión completa (secciones → campos → roles) para renderizar y validar. */
export const versionInclude = {
  sections: {
    orderBy: { order: "asc" },
    include: {
      roles: { select: { roleId: true } },
      fields: {
        orderBy: { order: "asc" },
        include: { roles: { select: { roleId: true } } },
      },
    },
  },
} satisfies Prisma.TemplateVersionInclude;

export type VersionWithGraph = Prisma.TemplateVersionGetPayload<{ include: typeof versionInclude }>;
export type LogEntryRow = Prisma.LogEntryGetPayload<Record<string, never>>;

/**
 * Subconjunto de la cabecera que `buildDetail`/`mapEntry` necesitan. Permite armar
 * el detalle tanto de una entrada REAL (`LogEntryRow`, superconjunto asignable)
 * como de una cabecera SINTÉTICA no persistida (vista previa de "nueva entrada",
 * Fase 2.8.2).
 */
export type EntrySource = Pick<
  LogEntryRow,
  | "id"
  | "entryNumber"
  | "templateId"
  | "templateVersionId"
  | "workflowDefinitionId"
  | "workflowDefinitionVersionId"
  | "orgNodeId"
  | "equipmentId"
  | "currentStateKey"
  | "status"
  | "recordedAt"
  | "effectiveAt"
  | "shiftCode"
  | "operationalDate"
  | "periodKey"
  | "sealedAt"
  | "entryOrigin"
  | "declaredEffectiveAt"
  | "deferredReason"
  | "deferredDeclaredById"
  | "deferredDeclaredAt"
  | "voidedAt"
  | "voidReason"
  | "voidedById"
  | "createdById"
  | "createdAt"
  | "updatedAt"
>;

/** Versión de flujo CONGELADA (estados + transiciones → roles) para ejecutar/render. */
export const workflowVersionInclude = {
  states: { orderBy: { order: "asc" } },
  transitions: {
    orderBy: { order: "asc" },
    include: {
      fromState: { select: { key: true } },
      toState: { select: { key: true } },
      // Nombre del rol resuelto: el visor muestra el RESPONSABLE por elemento sin
      // depender del builder (que tiene su propia lista de roles).
      roles: { select: { roleId: true, role: { select: { name: true } } } },
    },
  },
} satisfies Prisma.WorkflowDefinitionVersionInclude;

export type WorkflowVersionWithGraph = Prisma.WorkflowDefinitionVersionGetPayload<{
  include: typeof workflowVersionInclude;
}>;

/** Vista normalizada de un campo de la versión (para validar/autorizar). */
interface FieldDef {
  key: string;
  sectionKey: string;
  type: FieldForValidation["type"];
  dataType: FieldForValidation["dataType"];
  label: string;
  required: boolean;
  config: Record<string, unknown>;
  visibleWhen: { fieldKey: string; equals: string | number | boolean } | null;
  /** Campo FORMULADO (Req-7): fórmula que deriva el valor (read-only). null = tecleado. */
  computed: ComputedFieldConfig | null;
  /** Override de roles por campo (vacío = hereda la sección). */
  roleIds: string[];
}

/** Evento de dominio emitido al ejecutar una transición (gancho de plataforma). */
export interface TransitionEvent {
  logEntryId: string;
  transitionKey: string;
  fromStateKey: string;
  toStateKey: string;
  toIsFinal: boolean;
  actorId: string;
}

/**
 * Llenado de bitácoras (Fase 2.4) — EJECUCIÓN auditada de una plantilla.
 *
 * La autorización (RBAC dim. 1–2) la deciden los guards del controller; este
 * service decide lo que es DATO: editabilidad por SECCIÓN = (sección editable en
 * el estado actual) × (rol con permiso de sección) × (ABAC sobre el nodo), con
 * override de rol por campo. Valida el 100% de los valores en servidor, audita
 * por campo (antes/después) y estampa las dimensiones operacionales vía
 * `ShiftResolver`. Concurrencia optimista por sección (`version` check-and-bump).
 *
 * EJECUCIÓN DE FLUJO (Fase 2.5): `executeTransition` valida en backend (a) la
 * transición sale del estado actual, (b) el usuario tiene un rol-dato autorizado,
 * (c) ABAC sobre el nodo, (d) completitud de las secciones del estado de origen;
 * aplica el cambio de estado, recomputa qué secciones quedan editables/`LOCKED`,
 * sella las dimensiones en la 1ª salida del estado inicial y, si la transición lo
 * exige, captura una FIRMA electrónica Part 11 con re-autenticación (`ReauthService`).
 * Esta lógica vive aquí (no en un servicio aparte) para reusar toda la maquinaria
 * de secciones/valores/validación/sellado sin exponerla ni duplicarla.
 */
@Injectable()
export class LogEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly scope: ScopeService,
    private readonly shiftResolver: ShiftResolver,
    private readonly fiscalResolver: FiscalResolver,
    private readonly reauth: ReauthService,
    private readonly enc: EncryptionService,
    private readonly periods: OperationalPeriodService,
    private readonly permissions: PermissionService,
    private readonly settings: SettingsService,
  ) {}

  // --- Crear (abrir) una entrada ---------------------------------------------

  async create(userId: string, dto: CreateLogEntryRequest, ctx: AuditContext): Promise<LogEntryDetail> {
    const template = await this.prisma.template.findFirst({
      where: { id: dto.templateId, deletedAt: null },
      include: { nodeAssignments: { select: { orgNodeId: true, includeDescendants: true, orgNode: { select: { path: true } } } } },
    });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    if (template.status !== "PUBLISHED" || !template.currentVersionId) {
      throw new BadRequestException("La plantilla debe estar publicada para registrar entradas");
    }

    const orgNodeId = dto.orgNodeId ?? template.orgNodeId;
    if (!orgNodeId) {
      throw new BadRequestException("Debe indicar un nodo de la estructura para la entrada");
    }
    await this.assertNodeExists(orgNodeId);
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
    // Multi-nodo (2.8.0): el nodo debe pertenecer al alcance de estructura de la plantilla.
    await this.assertNodeAllowedForTemplate(orgNodeId, template.nodeAssignments);
    // 2.º eje ABAC (Fase 2.8): la plantilla debe estar en el alcance del usuario.
    await this.scope.assertTemplateInScope(userId, template.id);
    // Gobernanza del equipo por plantilla (2.8.0.2): gate DURO al materializar.
    this.assertEquipmentForMode(template.equipmentMode, dto.equipmentId);
    if (dto.equipmentId) await this.assertEquipmentInNode(dto.equipmentId, orgNodeId);

    const version = await this.prisma.templateVersion.findFirst({
      where: { id: template.currentVersionId },
      include: versionInclude,
    });
    if (!version) throw new BadRequestException("La plantilla no tiene una versión publicada válida");

    // Estado inicial del flujo congelado (si la versión tiene flujo).
    const currentStateKey = await this.initialStateKey(version.workflowDefinitionVersionId);

    const recordedAt = new Date();
    const declaredAt = dto.deferred ? new Date(dto.deferred.effectiveAt) : null;

    // Registro DIFERIDO (2.7.0): si la versión tiene campo EFFECTIVE_DATE el gesto
    // lo ESCRIBE (el campo sigue siendo la única fuente viva), con las mismas
    // guardas de sección/rol que saveSection. Si no existe, la fecha declarada
    // alimenta effectiveAt como fallback intermedio (campo → declarada → captura).
    const effField = dto.deferred ? this.effectiveDateFieldOf(version) : null;
    const effValue =
      dto.deferred && effField
        ? await this.prepareEffectiveDateWrite(userId, effField, currentStateKey, dto.deferred.effectiveAt)
        : null;

    // Sin más valores aún → effectiveAt = campo escrito / declarada / recordedAt;
    // se recalcula al guardar/enviar.
    const effectiveAt = resolveEffectiveAt(
      version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
      effField && effValue !== null ? { [effField.field.key]: effValue } : {},
      recordedAt,
      declaredAt,
    );
    // Guarda de período (2.7.1): no se puede abrir una entrada cuya fecha efectiva
    // caiga en un período en cierre/cerrado, salvo permiso de excepción. Cubre el
    // diferido: declarar una fecha en período cerrado se rechaza con PERIOD_CLOSED.
    await this.periods.assertWritable(effectiveAt, orgNodeId, await this.permissions.getEffectivePermissions(userId));

    const dims = await this.resolveDims(effectiveAt, orgNodeId);

    const data = {
      templateId: template.id,
      templateVersionId: version.id,
      workflowDefinitionId: version.workflowDefinitionId,
      workflowDefinitionVersionId: version.workflowDefinitionVersionId,
      orgNodeId,
      equipmentId: dto.equipmentId ?? null,
      currentStateKey,
      // Entra al estado inicial al crearse: base de cómputo del SLA (Workflow SLA).
      currentStateSince: recordedAt,
      status: "DRAFT" as const,
      recordedAt,
      effectiveAt,
      shiftCode: dims?.shiftCode ?? null,
      operationalDate: dims?.operationalDate ?? null,
      periodKey: dims?.periodKey ?? null,
      entryOrigin: (dto.deferred ? "DEFERRED" : "ONLINE") as Prisma.LogEntryCreateInput["entryOrigin"],
      declaredEffectiveAt: declaredAt,
      deferredReason: dto.deferred?.reason ?? null,
      deferredDeclaredById: dto.deferred ? userId : null,
      deferredDeclaredAt: dto.deferred ? recordedAt : null,
      createdById: userId,
      updatedById: userId,
      sections: {
        // `requiresSignature` se ESTAMPA desde la definición congelada (2.6):
        // así "firmas pendientes" es un filtro SQL sin join a la definición.
        create: version.sections.map((s) => ({
          sectionKey: s.key,
          state: "PENDING" as const,
          requiresSignature: s.requireSignature,
        })),
      },
    };

    // Con escritura del campo EFFECTIVE_DATE, entrada + valor + historial son un
    // solo commit; el camino común (sin diferido) no paga la transacción.
    const created =
      dto.deferred && effField && effValue !== null
        ? await this.prisma.$transaction(async (tx) => {
            const row = await tx.logEntry.create({ data });
            await this.writeEffectiveDateValue(tx, row.id, effField, effValue, dto.deferred!.reason, userId, recordedAt);
            return row;
          })
        : await this.prisma.logEntry.create({ data });

    await this.audit.record({
      ...ctx,
      action: "logentry.created",
      entityType: "LogEntry",
      entityId: created.id,
      after: {
        templateId: template.id,
        templateVersionId: version.id,
        orgNodeId,
        entryOrigin: dto.deferred ? "DEFERRED" : "ONLINE",
        ...(dto.deferred
          ? { declaredEffectiveAt: declaredAt!.toISOString(), deferredReason: dto.deferred.reason }
          : {}),
      },
    });
    return this.getDetail(userId, created.id);
  }

  // --- Detalle ---------------------------------------------------------------

  async getDetail(userId: string, id: string): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    await this.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);

    const version = await this.loadVersion(entry.templateVersionId);
    const template = await this.prisma.template.findUnique({ where: { id: entry.templateId } });
    const [sectionRows, valueRows, transitionRows, signatureRows, wfVersion, equipment] = await Promise.all([
      this.prisma.logEntrySection.findMany({ where: { logEntryId: id } }),
      this.prisma.logEntryValue.findMany({ where: { logEntryId: id } }),
      this.prisma.logEntryTransition.findMany({ where: { logEntryId: id }, orderBy: { occurredAt: "asc" } }),
      this.prisma.logEntrySignature.findMany({ where: { logEntryId: id }, orderBy: { signedAt: "asc" } }),
      entry.workflowDefinitionVersionId ? this.loadWorkflowVersion(entry.workflowDefinitionVersionId) : Promise.resolve(null),
      entry.equipmentId
        ? this.prisma.equipment.findUnique({ where: { id: entry.equipmentId }, select: { name: true } })
        : Promise.resolve(null),
    ]);

    return this.buildDetail(userId, entry, version, template, { sectionRows, valueRows, transitionRows, signatureRows }, wfVersion, equipment);
  }

  /**
   * Vista previa de una entrada NUEVA sin PERSISTIR (Fase 2.8.2 — "no crear
   * borradores huérfanos"): arma el MISMO `LogEntryDetail` que produciría
   * `create` + `getDetail`, pero con una cabecera sintética (id="") y sin filas en
   * BD. El frontend la usa para abrir el formulario en modo compose; la entrada
   * se materializa recién en el primer guardado real. Reutiliza toda la lógica de
   * `buildDetail` (editabilidad por sección/rol/estado, dimensiones, ventana de
   * edición, transiciones del estado inicial) — cero duplicación en el cliente.
   */
  async previewNew(
    userId: string,
    q: { templateId: string; orgNodeId?: string | null; equipmentId?: string | null },
  ): Promise<LogEntryDetail> {
    const template = await this.prisma.template.findFirst({
      where: { id: q.templateId, deletedAt: null },
      include: { nodeAssignments: { select: { orgNodeId: true, includeDescendants: true, orgNode: { select: { path: true } } } } },
    });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    if (template.status !== "PUBLISHED" || !template.currentVersionId) {
      throw new BadRequestException("La plantilla debe estar publicada para registrar entradas");
    }
    const orgNodeId = q.orgNodeId ?? template.orgNodeId;
    if (!orgNodeId) throw new BadRequestException("Debe indicar un nodo de la estructura para la entrada");
    await this.assertNodeExists(orgNodeId);
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("El nodo indicado está fuera de su alcance");
    }
    // Multi-nodo (2.8.0): el nodo debe pertenecer al alcance de estructura de la plantilla.
    await this.assertNodeAllowedForTemplate(orgNodeId, template.nodeAssignments);
    // 2.º eje ABAC (Fase 2.8): defensa en profundidad también en la vista previa.
    await this.scope.assertTemplateInScope(userId, template.id);
    // Gobernanza del equipo (2.8.0.2): en la vista previa solo se valida la consistencia
    // de NONE (no admite equipo); REQUIRED NO bloquea aquí (se está componiendo y el gate
    // duro corre al materializar en `create`).
    if (template.equipmentMode === "NONE" && q.equipmentId) {
      throw new BadRequestException("Esta plantilla no admite equipo en la entrada");
    }
    if (q.equipmentId) await this.assertEquipmentInNode(q.equipmentId, orgNodeId);

    const version = await this.loadVersion(template.currentVersionId);
    const currentStateKey = await this.initialStateKey(version.workflowDefinitionVersionId);
    const now = new Date();
    const dims = await this.resolveDims(now, orgNodeId);
    const [wfVersion, equipment] = await Promise.all([
      version.workflowDefinitionVersionId ? this.loadWorkflowVersion(version.workflowDefinitionVersionId) : Promise.resolve(null),
      q.equipmentId ? this.prisma.equipment.findUnique({ where: { id: q.equipmentId }, select: { name: true } }) : Promise.resolve(null),
    ]);

    // Cabecera SINTÉTICA: no se escribe en BD. effectiveAt = ahora (la fecha real
    // del diferido, si la hay, se aplica al materializar en `create`).
    const synthetic: EntrySource = {
      id: "",
      entryNumber: 0,
      templateId: template.id,
      templateVersionId: version.id,
      workflowDefinitionId: version.workflowDefinitionId,
      workflowDefinitionVersionId: version.workflowDefinitionVersionId,
      orgNodeId,
      equipmentId: q.equipmentId ?? null,
      currentStateKey,
      status: "DRAFT",
      recordedAt: now,
      effectiveAt: now,
      shiftCode: dims?.shiftCode ?? null,
      operationalDate: dims?.operationalDate ?? null,
      periodKey: dims?.periodKey ?? null,
      sealedAt: null,
      entryOrigin: "ONLINE",
      declaredEffectiveAt: null,
      deferredReason: null,
      deferredDeclaredById: null,
      deferredDeclaredAt: null,
      voidedAt: null,
      voidReason: null,
      voidedById: null,
      createdById: userId,
      createdAt: now,
      updatedAt: now,
    };
    return this.buildDetail(userId, synthetic, version, template, { sectionRows: [], valueRows: [], transitionRows: [], signatureRows: [] }, wfVersion, equipment);
  }

  /**
   * Arma el `LogEntryDetail` a partir de la cabecera (real o sintética) + las
   * filas de ejecución (vacías en la vista previa). Fuente única de la decisión de
   * editabilidad por sección, dimensiones, ventana de edición y transiciones.
   */
  private async buildDetail(
    userId: string,
    entry: EntrySource,
    version: VersionWithGraph,
    template: { name: string; editWindowAnchor: EditWindowAnchor | null; editWindowMinutes: number | null } | null,
    rows: {
      sectionRows: Array<{ sectionKey: string; state: LogEntrySectionState; filledById: string | null; filledAt: Date | null; version: number; signatureId: string | null }>;
      valueRows: Array<{ fieldKey: string; value: unknown; updatedAt: Date; updatedById: string | null }>;
      transitionRows: Array<{ id: string; transitionKey: string; fromStateKey: string; toStateKey: string; actorId: string | null; reason: string | null; signatureId: string | null; occurredAt: Date }>;
      signatureRows: Array<{ id: string; logEntryId: string; context: SignatureContext; transitionKey: string | null; sectionKey: string | null; signerId: string | null; signerName: string; meaning: string; method: SignatureMethod; payloadHash: string; signedAt: Date }>;
    },
    wfVersion: WorkflowVersionWithGraph | null,
    equipment: { name: string } | null,
  ): Promise<LogEntryDetail> {
    const { sectionRows, valueRows, transitionRows, signatureRows } = rows;
    const roleIds = await this.userRoleIds(userId);
    const actorNames = await this.namesByUserId([
      entry.createdById,
      entry.deferredDeclaredById,
      entry.voidedById,
      ...sectionRows.map((s) => s.filledById),
      ...transitionRows.map((t) => t.actorId),
    ]);
    const editable = entry.status === "DRAFT";
    const sigById = new Map(signatureRows.map((s) => [s.id, s]));
    const roleNames = await this.roleNamesById(
      version.sections.flatMap((s) => s.roles.map((r) => r.roleId)),
    );

    const perms = await this.permissions.getEffectivePermissions(userId);

    // Huella de período (2.7.1): si la fecha efectiva cae en un período en cierre/
    // cerrado y el actor NO tiene la excepción, todas las secciones quedan bloqueadas
    // con PERIOD_CLOSED (la congelación del período es un gate uniforme de la entrada).
    const periodBlocked =
      editable && (await this.periods.isWriteBlockedForActor(entry.effectiveAt, entry.orgNodeId, perms));

    // Huella de ventana de edición (2.7.2): la UI muestra proactivamente "Editable
    // hasta X" y, vencida, el motivo del bloqueo. Quien tiene el override NO queda
    // bloqueado (la UI le pedirá motivo al guardar; el backend lo exige igual).
    const windowSettings = await this.settings.editWindowSettings();
    const windowCfg = resolveEditWindow(
      {
        editWindowAnchor: template?.editWindowAnchor ?? null,
        editWindowMinutes: template?.editWindowMinutes ?? null,
      },
      windowSettings,
    );
    let editWindow: EditWindowInfo | null = null;
    let windowBlocked = false;
    if (windowCfg) {
      const deadline = editWindowDeadline(windowCfg, entry.recordedAt, entry.effectiveAt);
      const expired = isEditWindowExpired(deadline, new Date());
      const canOverride = perms.has(EDIT_WINDOW_OVERRIDE_PERMISSION);
      editWindow = {
        anchor: windowCfg.anchor,
        windowMinutes: windowCfg.windowMinutes,
        expiresAt: deadline.toISOString(),
        expired,
        canOverride,
        overrideRequiresMfa: windowSettings.requireMfaEditWindowOverride,
      };
      windowBlocked = editable && expired && !canOverride;
    }

    const sectionStates: LogEntrySectionStateDto[] = version.sections.map((def) => {
      const row = sectionRows.find((r) => r.sectionKey === def.key);
      const sig = row?.signatureId ? sigById.get(row.signatureId) : undefined;
      const sectionRoleIds = def.roles.map((r) => r.roleId);
      // Motivo de bloqueo para ESTE usuario (la UI lo comunica tal cual). Orden de
      // precedencia (del menos al más accionable): registro sellado → período
      // cerrado → ventana vencida → reglas de la sección.
      const blockedReason: SectionBlockedReason | null = !editable
        ? "ENTRY_CLOSED"
        : periodBlocked
          ? "PERIOD_CLOSED"
          : windowBlocked
            ? "EDIT_WINDOW_EXPIRED"
            : this.sectionBlockedReasonFor(def.editableInStateKey, sectionRoleIds, entry.currentStateKey, roleIds);
      return {
        sectionKey: def.key,
        state: row?.state ?? "PENDING",
        filledById: row?.filledById ?? null,
        filledByName: row?.filledById ? (actorNames.get(row.filledById) ?? null) : null,
        filledAt: row?.filledAt?.toISOString() ?? null,
        version: row?.version ?? 0,
        editable: blockedReason === null,
        blockedReason,
        assignedRoleNames: sectionRoleIds.map((id) => roleNames.get(id) ?? "—"),
        // Campos cuyo override de rol excluye al usuario (la UI los pinta read-only;
        // el guardado igual los rechaza con 403 — el backend siempre decide).
        readOnlyFieldKeys: def.fields
          .filter((f) => f.roles.length > 0 && !f.roles.some((r) => roleIds.has(r.roleId)))
          .map((f) => f.key),
        signature: sig ? this.signatureSummary(sig) : null,
      };
    });

    const values: LogEntryValueDto[] = valueRows.map((v) => ({
      fieldKey: v.fieldKey,
      value: (v.value ?? null) as unknown,
      updatedAt: v.updatedAt.toISOString(),
      updatedById: v.updatedById,
    }));

    // Transiciones que ESTE usuario puede ejecutar ahora (solo si sigue editable).
    const labelByKey = new Map((wfVersion?.transitions ?? []).map((t) => [t.key, t.label]));
    const availableTransitions: AvailableTransitionDto[] =
      editable && !periodBlocked && wfVersion
        ? availableTransitionsFor(
            wfVersion.transitions.map((t) => ({
              key: t.key,
              label: t.label,
              fromStateKey: t.fromState.key,
              toStateKey: t.toState.key,
              requireSignature: t.requireSignature,
              signatureMeaning: t.signatureMeaning,
              requireMfa: t.requireMfa,
              roleIds: t.roles.map((r) => r.roleId),
            })),
            wfVersion.states.map((s) => ({ key: s.key, name: s.name })),
            entry.currentStateKey,
            roleIds,
          )
        : [];

    const transitions: LogEntryTransitionDto[] = transitionRows.map((t) => ({
      id: t.id,
      transitionKey: t.transitionKey,
      label: labelByKey.get(t.transitionKey) ?? null,
      fromStateKey: t.fromStateKey,
      toStateKey: t.toStateKey,
      actorId: t.actorId,
      actorName: t.actorId ? (actorNames.get(t.actorId) ?? null) : null,
      reason: t.reason,
      signature: t.signatureId ? (this.signatureSummary(sigById.get(t.signatureId)) ?? null) : null,
      occurredAt: t.occurredAt.toISOString(),
    }));

    const signatures: LogEntrySignatureDto[] = signatureRows.map((s) => ({
      id: s.id,
      context: s.context,
      transitionKey: s.transitionKey,
      sectionKey: s.sectionKey,
      signerId: s.signerId,
      signerName: s.signerName,
      meaning: s.meaning,
      method: s.method,
      payloadHash: s.payloadHash,
      signedAt: s.signedAt.toISOString(),
    }));

    const currentStateName =
      wfVersion && entry.currentStateKey
        ? (wfVersion.states.find((s) => s.key === entry.currentStateKey)?.name ?? entry.currentStateKey)
        : null;

    return {
      ...this.mapEntry(entry, template?.name ?? "—"),
      orgNodePath: await this.nodePath(entry.orgNodeId),
      createdByName: entry.createdById ? (actorNames.get(entry.createdById) ?? null) : null,
      equipmentName: equipment?.name ?? null,
      deferredDeclaredByName: entry.deferredDeclaredById
        ? (actorNames.get(entry.deferredDeclaredById) ?? null)
        : null,
      voidedByName: entry.voidedById ? (actorNames.get(entry.voidedById) ?? null) : null,
      editWindow,
      version: this.mapVersion(version),
      workflowVersion: wfVersion ? this.mapWorkflowVersion(wfVersion) : null,
      currentStateName,
      sectionStates,
      values,
      availableTransitions,
      transitions,
      signatures,
    };
  }

  // --- Guardar una sección ---------------------------------------------------

  async saveSection(
    userId: string,
    id: string,
    sectionKey: string,
    dto: SaveLogEntrySectionRequest,
    ctx: AuditContext,
  ): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT") throw new BadRequestException("La entrada ya fue enviada o anulada");
    await this.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);

    const version = await this.loadVersion(entry.templateVersionId);
    const sectionDef = version.sections.find((s) => s.key === sectionKey);
    if (!sectionDef) throw new NotFoundException("Sección no encontrada en la versión");

    const roleIds = await this.userRoleIds(userId);
    const blockedReason = this.sectionBlockedReasonFor(
      sectionDef.editableInStateKey,
      sectionDef.roles.map((r) => r.roleId),
      entry.currentStateKey,
      roleIds,
    );
    if (blockedReason !== null) {
      throw new ForbiddenException(
        blockedReason === "MISSING_ROLE"
          ? "La sección está asignada a otro rol: su usuario no puede registrarla ni modificarla"
          : "La sección no se edita en la etapa actual del flujo",
      );
    }

    const sectionRow = await this.prisma.logEntrySection.findUnique({
      where: { logEntryId_sectionKey: { logEntryId: id, sectionKey } },
    });
    if (!sectionRow) throw new NotFoundException("Sección no instanciada");
    if (sectionRow.version !== dto.expectedVersion) {
      throw new ConflictException("La sección fue modificada por otra persona. Recargue para ver los cambios.");
    }

    const fieldsByKey = new Map(sectionDef.fields.map((f) => [f.key, this.toFieldDef(f, sectionKey)]));

    // Solo se aceptan campos de ESTA sección. Un campo FORMULADO es de SOLO LECTURA:
    // su valor lo deriva el servidor (no se confía en el cliente), nunca se teclea.
    for (const input of dto.values) {
      const def = fieldsByKey.get(input.fieldKey);
      if (!def) {
        throw new BadRequestException(`El campo "${input.fieldKey}" no pertenece a la sección`);
      }
      if (def.computed) {
        throw new BadRequestException(`El campo "${def.label}" es formulado (solo lectura): no admite valor`);
      }
    }

    // Snapshot de TODOS los valores actuales (para visibilidad y fecha efectiva).
    const existing = await this.prisma.logEntryValue.findMany({ where: { logEntryId: id } });

    // Override de rol por campo: si un campo declara roles y el usuario no los
    // tiene, no puede MODIFICAR su valor (granularidad por campo, fork 3). Un eco
    // sin cambio no bloquea: el resto de la sección debe poder guardarse.
    for (const input of dto.values) {
      const def = fieldsByKey.get(input.fieldKey)!;
      if (def.roleIds.length === 0 || def.roleIds.some((r) => roleIds.has(r))) continue;
      const beforeVal = (existing.find((e) => e.fieldKey === input.fieldKey)?.value ?? null) as unknown;
      if (JSON.stringify(beforeVal) !== JSON.stringify(input.value ?? null)) {
        throw new ForbiddenException(`El campo "${def.label}" está reservado a otro rol: no puede modificarlo`);
      }
    }

    const valuesByKey: Record<string, unknown> = {};
    for (const v of existing) valuesByKey[v.fieldKey] = (v.value ?? null) as unknown;
    for (const input of dto.values) valuesByKey[input.fieldKey] = input.value ?? null;

    // Motor de reglas (Req-7): el servidor recomputa los campos FORMULADOS desde
    // los valores persistidos (autoritativo) y los refleja en la foto antes de
    // validar/sellar/firmar — para que la validación cruzada, el umbral y la fecha
    // efectiva vean el valor calculado. Persistirlos ocurre dentro de la tx.
    const evalNow = new Date();
    Object.assign(valuesByKey, recomputeComputedValues(this.toFieldsForRules(version), valuesByKey, { now: evalNow }));

    // Guarda de período (2.7.1): la effectiveAt que ESTE guardado dejaría (la
    // congelada si ya está sellada; la recalculada de los valores si sigue en
    // borrador) no puede caer en un período en cierre/cerrado sin excepción. Se
    // valida antes de la validación de campos (gate duro de la entrada completa).
    const prospectiveEffectiveAt = entry.sealedAt
      ? entry.effectiveAt
      : resolveEffectiveAt(
          version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
          valuesByKey,
          entry.recordedAt,
          entry.declaredEffectiveAt,
        );
    await this.periods.assertWritable(
      prospectiveEffectiveAt,
      entry.orgNodeId,
      await this.permissions.getEffectivePermissions(userId),
    );
    // Guarda de ventana de edición (2.7.2), en AND con la de período ("gana la
    // más estricta", cada una con su propio bypass). Vencida ⇒ exige permiso de
    // excepción + motivo (+ MFA si el ajuste lo pide).
    const windowOverride = await this.assertEditWindowWritable(entry, userId, dto);

    // Validación 100% en servidor (tipo/rango/umbral/formato/catálogo), saltando
    // campos ocultos por visibleWhen. Los obligatorios solo se exigen al completar.
    const allowed = await this.resolveAllowedCodes([...fieldsByKey.values()]);
    const errors: string[] = [];
    const warnings: string[] = [];
    for (const input of dto.values) {
      const def = fieldsByKey.get(input.fieldKey)!;
      if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
      const res = validateFieldValue(def, input.value, { allowedCodes: allowed.get(def.key) });
      errors.push(...res.errors);
      warnings.push(...res.warnings);
    }

    if (dto.markComplete) {
      for (const def of fieldsByKey.values()) {
        // Un campo formulado no se teclea (read-only) ⇒ "obligatorio" no aplica.
        if (!def.required || def.computed) continue;
        if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
        if (isEmptyValue(valuesByKey[def.key])) errors.push(`${def.label}: obligatorio`);
      }
    }

    // Validación CRUZADA entre campos (Req-7): ERROR bloquea (como los obligatorios,
    // solo al COMPLETAR la sección); WARN informa. Una regla con un campo
    // referenciado vacío se OMITE (no se puede evaluar todavía). Evaluada sobre la
    // foto recomputada (puede referenciar valores formulados).
    const cross = evaluateCrossRules(this.versionRules(version), valuesByKey, { now: evalNow });
    if (dto.markComplete) errors.push(...cross.errors.map((e) => e.message));
    warnings.push(...cross.warnings.map((w) => w.message));
    if (errors.length > 0) {
      throw new BadRequestException({ message: "La sección tiene errores de validación", errors });
    }

    const now = new Date();
    const newState = dto.markComplete ? "COMPLETED" : "IN_PROGRESS";

    // Firma de completitud de sección (Part 11), si la sección la exige y se está
    // completando. Las secciones no portan flag de MFA → re-auth por contraseña.
    // La re-autenticación va ANTES de la transacción (no contamina la tx con I/O
    // de auth); si falla, lanza y nada se persiste.
    const mustSign = Boolean(dto.markComplete) && sectionDef.requireSignature;
    const reauth = mustSign
      ? await this.reauth.verifyForSignature(userId, { password: dto.password }, { requireMfa: false })
      : null;

    await this.prisma.$transaction(async (tx) => {
      for (const input of dto.values) {
        const def = fieldsByKey.get(input.fieldKey)!;
        const before = existing.find((e) => e.fieldKey === input.fieldKey);
        const beforeVal = (before?.value ?? null) as unknown;
        const afterVal = input.value ?? null;
        if (JSON.stringify(beforeVal) === JSON.stringify(afterVal)) continue; // sin cambio real

        // Banda ISA-18.2 ESTAMPADA al guardar (review-by-exception 2.6): la
        // validación ya la computó; persistirla evita re-evaluar configs al listar.
        const band = thresholdBandFor(def, afterVal);
        await tx.logEntryValue.upsert({
          where: { logEntryId_fieldKey: { logEntryId: id, fieldKey: input.fieldKey } },
          create: {
            logEntryId: id,
            sectionKey,
            fieldKey: input.fieldKey,
            dataType: def.dataType,
            value: this.toJson(afterVal),
            thresholdBand: band,
            updatedById: userId,
          },
          update: { value: this.toJson(afterVal), thresholdBand: band, updatedById: userId },
        });
        await tx.logEntryFieldChange.create({
          data: {
            logEntryId: id,
            fieldKey: input.fieldKey,
            before: this.toJson(beforeVal),
            after: this.toJson(afterVal),
            // Cambio hecho FUERA de ventana: el motivo del override queda también
            // en el historial por campo (no solo en el AuditLog), patrón GxP.
            reason: windowOverride?.reason ?? null,
            changedById: userId,
            // Mismo instante que la firma de completitud (si la hay): el rebobinado
            // de la verificación de integridad excluye con `> signedAt` exactamente
            // los cambios de ESTE guardado (no se puede confiar en el reloj de BD).
            changedAt: now,
          },
        });
      }

      // Estampa los campos FORMULADOS recomputados (Req-7) mientras la entrada NO
      // esté sellada (recalcula en DRAFT, congela al sellar — GxP). Va ANTES de la
      // firma para que el snapshot firmado coincida con lo persistido (§11.70 verify).
      if (!entry.sealedAt) {
        await this.stampComputedValues(tx, id, version, valuesByKey, userId, now);
      }

      // Snapshot canónico de TODOS los valores actuales (incluye los recién guardados).
      let signatureId: string | null = null;
      if (mustSign && reauth) {
        const signature = await this.createSignature(tx, {
          entry,
          context: "SECTION_COMPLETION",
          sectionKey,
          meaning: SECTION_SIGNATURE_MEANING,
          signerId: userId,
          signerName: reauth.signerName,
          method: reauth.method,
          valuesByKey,
          signedAt: now,
        });
        signatureId = signature.id;
      }

      await tx.logEntrySection.update({
        where: { id: sectionRow.id },
        data: {
          version: { increment: 1 },
          state: newState,
          filledById: userId,
          filledAt: now,
          ...(signatureId ? { signatureId } : {}),
        },
      });

      // Recalcula effectiveAt + dimensiones SOLO mientras la entrada no esté sellada
      // (el sellado lo congela la 1ª transición o el submit de un form sin flujo).
      if (!entry.sealedAt) {
        const effectiveAt = resolveEffectiveAt(
          version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
          valuesByKey,
          entry.recordedAt,
          entry.declaredEffectiveAt,
        );
        const dims = await this.resolveDims(effectiveAt, entry.orgNodeId);
        await tx.logEntry.update({
          where: { id },
          data: {
            effectiveAt,
            shiftCode: dims?.shiftCode ?? null,
            operationalDate: dims?.operationalDate ?? null,
            periodKey: dims?.periodKey ?? null,
            updatedById: userId,
          },
        });
      } else {
        await tx.logEntry.update({ where: { id }, data: { updatedById: userId } });
      }
    });

    if (windowOverride) {
      await this.auditEditWindowOverride(ctx, id, "section.saved", windowOverride, { sectionKey });
    }
    await this.audit.record({
      ...ctx,
      action: "logentry.section.saved",
      entityType: "LogEntry",
      entityId: id,
      metadata: {
        sectionKey,
        complete: Boolean(dto.markComplete),
        signed: mustSign,
        warnings: warnings.length,
        ...(windowOverride ? { editWindowOverride: true } : {}),
      },
    });
    return this.getDetail(userId, id);
  }

  // --- Enviar (finaliza un form SIN flujo; sella las dimensiones) -------------

  async submit(userId: string, id: string, dto: SubmitLogEntryRequest, ctx: AuditContext): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT") throw new BadRequestException("La entrada ya fue finalizada o anulada");
    await this.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);

    // Degradación elegante: `submit` finaliza SOLO plantillas sin flujo. Con flujo,
    // la finalización ocurre al transicionar a un estado final (executeTransition).
    if (entry.workflowDefinitionVersionId) {
      throw new BadRequestException("Esta plantilla tiene flujo: avance la entrada con una transición");
    }

    const version = await this.loadVersion(entry.templateVersionId);
    const valuesByKey = await this.loadValuesByKey(id);
    // Recompute autoritativo de los formulados antes de validar/sellar (Req-7).
    const evalNow = new Date();
    Object.assign(valuesByKey, recomputeComputedValues(this.toFieldsForRules(version), valuesByKey, { now: evalNow }));

    // Enviar SELLA el registro completo (commit GxP): la validación es OBJETIVA
    // (todas las secciones, no solo las del que envía) y exige cada sección con
    // campos en COMPLETED — espejo del guard (d) de executeTransition. Sin esto,
    // un actor podía sellar con secciones de otros roles incompletas y eludir la
    // firma de completitud de sección (TemplateSection.requireSignature).
    const inCurrentState = (section: VersionWithGraph["sections"][number]): boolean =>
      isSectionEditableInState(section.editableInStateKey, entry.currentStateKey);
    const errors = await this.collectCompletionErrors(version, valuesByKey, inCurrentState);
    // Validación CRUZADA (Req-7): los ERROR bloquean el sellado del registro completo.
    errors.push(...evaluateCrossRules(this.versionRules(version), valuesByKey, { now: evalNow }).errors.map((e) => e.message));
    const sectionRows = await this.prisma.logEntrySection.findMany({ where: { logEntryId: id } });
    for (const section of version.sections) {
      if (!inCurrentState(section) || section.fields.length === 0) continue;
      const row = sectionRows.find((r) => r.sectionKey === section.key);
      if (!row || row.state !== "COMPLETED") errors.push(`Sección "${section.title}" sin completar`);
    }
    if (errors.length > 0) {
      throw new BadRequestException({ message: "No se puede enviar: hay secciones incompletas o con errores", errors });
    }

    const sealedAt = new Date();
    const seal = await this.computeSeal(entry, version, valuesByKey);
    // Guarda de período (2.7.1): sellar es el commit GxP; su effectiveAt no puede
    // caer en un período en cierre/cerrado sin permiso de excepción.
    await this.periods.assertWritable(seal.effectiveAt, entry.orgNodeId, await this.permissions.getEffectivePermissions(userId));
    // Guarda de ventana (2.7.2): sellar tarde un borrador abandonado es exactamente
    // la finalización tardía que GxP exige flaguear (override con motivo).
    const windowOverride = await this.assertEditWindowWritable(entry, userId, dto);
    await this.prisma.$transaction(async (tx) => {
      // Estampa los formulados (última vez) ANTES de congelar: la entrada aún no
      // está sellada en este punto, así DB == valores validados al sellar.
      await this.stampComputedValues(tx, id, version, valuesByKey, userId, sealedAt);
      await tx.logEntry.update({
        where: { id },
        data: { status: "SUBMITTED", sealedAt, ...seal, updatedById: userId },
      });
    });
    if (windowOverride) {
      await this.auditEditWindowOverride(ctx, id, "submitted", windowOverride);
    }
    await this.audit.record({
      ...ctx,
      action: "logentry.submitted",
      entityType: "LogEntry",
      entityId: id,
      after: {
        effectiveAt: seal.effectiveAt.toISOString(),
        shiftCode: seal.shiftCode,
        periodKey: seal.periodKey,
        ...(windowOverride ? { editWindowOverride: true } : {}),
      },
    });
    return this.getDetail(userId, id);
  }

  // --- Declarar / corregir / quitar el registro DIFERIDO (Fase 2.7.0) --------

  /**
   * Declara la entrada como registro DIFERIDO (con fecha/hora real del evento y
   * motivo obligatorio — práctica GxP de late entry), la corrige, o la quita
   * (`deferred: null` ⇒ vuelve a ONLINE). Solo mientras la entrada está en
   * borrador y SIN sellar: el sellado congela effectiveAt y sus dimensiones, y
   * con ellas el origen declarado. Si la versión tiene campo EFFECTIVE_DATE, el
   * gesto lo escribe (mismas guardas de sección/rol que `saveSection`, con
   * `FieldChange` auditado y bump de versión de sección); ese campo sigue siendo
   * la fuente viva y SIEMPRE manda sobre la fecha declarada a nivel de entrada.
   */
  async setDeferral(userId: string, id: string, dto: SetDeferralRequest, ctx: AuditContext): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT" || entry.sealedAt) {
      throw new BadRequestException("La entrada ya fue sellada: el origen del registro es inmutable");
    }
    await this.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);

    const version = await this.loadVersion(entry.templateVersionId);
    const now = new Date();
    const declaredAt = dto.deferred ? new Date(dto.deferred.effectiveAt) : null;

    const effField = dto.deferred ? this.effectiveDateFieldOf(version) : null;
    const effValue =
      dto.deferred && effField
        ? await this.prepareEffectiveDateWrite(userId, effField, entry.currentStateKey, dto.deferred.effectiveAt)
        : null;

    // Recalcula effectiveAt con la cadena campo → declarada → captura. Al QUITAR
    // la marca, el campo EFFECTIVE_DATE (si quedó escrito) sigue mandando: es
    // dato visible y editable por el canal normal de llenado.
    const valuesByKey = await this.loadValuesByKey(id);
    if (effField && effValue !== null) valuesByKey[effField.field.key] = effValue;
    const effectiveAt = resolveEffectiveAt(
      version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
      valuesByKey,
      entry.recordedAt,
      declaredAt,
    );
    // Guarda de período (2.7.1, fork 5): declarar/corregir una fecha de evento que
    // cae en un período en cierre/cerrado se rechaza con PERIOD_CLOSED (misma guarda
    // y mismo motivo visible que el resto de las escrituras), salvo excepción.
    await this.periods.assertWritable(effectiveAt, entry.orgNodeId, await this.permissions.getEffectivePermissions(userId));
    // Guarda de ventana (2.7.2): declarar/corregir/quitar el diferimiento MUTA la
    // fecha efectiva (es corrección de dato) ⇒ misma guarda que saveSection.
    const windowOverride = await this.assertEditWindowWritable(entry, userId, dto);

    const dims = await this.resolveDims(effectiveAt, entry.orgNodeId);

    await this.prisma.$transaction(async (tx) => {
      if (dto.deferred && effField && effValue !== null) {
        await this.writeEffectiveDateValue(tx, id, effField, effValue, dto.deferred.reason, userId, now);
      }
      await tx.logEntry.update({
        where: { id },
        data: {
          entryOrigin: dto.deferred ? "DEFERRED" : "ONLINE",
          declaredEffectiveAt: declaredAt,
          deferredReason: dto.deferred?.reason ?? null,
          deferredDeclaredById: dto.deferred ? userId : null,
          deferredDeclaredAt: dto.deferred ? now : null,
          effectiveAt,
          shiftCode: dims?.shiftCode ?? null,
          operationalDate: dims?.operationalDate ?? null,
          periodKey: dims?.periodKey ?? null,
          updatedById: userId,
        },
      });
    });

    if (windowOverride) {
      await this.auditEditWindowOverride(ctx, id, dto.deferred ? "deferral.declared" : "deferral.cleared", windowOverride);
    }
    await this.audit.record({
      ...ctx,
      action: dto.deferred ? "logentry.deferral.declared" : "logentry.deferral.cleared",
      entityType: "LogEntry",
      entityId: id,
      before: {
        entryOrigin: entry.entryOrigin,
        declaredEffectiveAt: entry.declaredEffectiveAt?.toISOString() ?? null,
        deferredReason: entry.deferredReason,
      },
      after: dto.deferred
        ? { entryOrigin: "DEFERRED", declaredEffectiveAt: declaredAt!.toISOString(), deferredReason: dto.deferred.reason }
        : { entryOrigin: "ONLINE", declaredEffectiveAt: null, deferredReason: null },
    });
    return this.getDetail(userId, id);
  }

  // --- Anular (descartar) un borrador (Fase 2.8.2) ---------------------------

  /**
   * Anula LÓGICAMENTE un borrador (status → VOID): lo saca de las superficies
   * operacionales normales (la grilla excluye VOID por defecto) pero lo deja
   * TRAZABLE (recuperable por filtro status=VOID, con huella quién/cuándo/por qué).
   * NO es hard-delete ni borrado lógico (`deletedAt`): el AuditLog inmutable conserva
   * el rastro. Solo aplica a un DRAFT no sellado (la anulación GxP de un registro
   * SELLADO es otro control: transición inversa + firma §11.200, corte posterior).
   *
   * Autorización (decidida SIEMPRE en backend): el AUTOR puede anular su PROPIO
   * borrador (ownership, precedente SavedView 2.8.1b); anular el borrador AJENO
   * exige el permiso `logentry:void` (limpieza supervisora). En ambos casos rige el
   * ABAC (nodo × plantilla). El motivo (≥5) es OBLIGATORIO y queda auditado (ALCOA+).
   * Discrepar de un período cerrado / ventana vencida NO bloquea descartar (no es
   * corrección de dato; es retirar un borrador erróneo).
   */
  async voidEntry(userId: string, id: string, dto: VoidLogEntryRequest, ctx: AuditContext): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status === "VOID") {
      throw new BadRequestException("La entrada ya está anulada");
    }
    if (entry.status !== "DRAFT" || entry.sealedAt) {
      throw new BadRequestException("Solo se puede anular un borrador no sellado");
    }
    await this.assertNodeInScope(userId, entry.orgNodeId);
    await this.scope.assertTemplateInScope(userId, entry.templateId);

    // Ownership o permiso para anular ajenas. El autor de un borrador siempre puede
    // descartarlo; anular el de otro es una acción privilegiada (configurable).
    if (entry.createdById !== userId) {
      const perms = await this.permissions.getEffectivePermissions(userId);
      if (!perms.has("logentry:void")) {
        throw new ForbiddenException("No puede anular el borrador de otro usuario");
      }
    }

    const now = new Date();
    await this.prisma.logEntry.update({
      where: { id },
      data: {
        status: "VOID",
        voidedAt: now,
        voidReason: dto.reason,
        voidedById: userId,
        updatedById: userId,
      },
    });
    await this.audit.record({
      ...ctx,
      action: "logentry.voided",
      entityType: "LogEntry",
      entityId: id,
      before: { status: entry.status },
      after: { status: "VOID", voidReason: dto.reason },
    });
    return this.getDetail(userId, id);
  }

  /** Campo con `semanticRole = EFFECTIVE_DATE` de la versión congelada (≤1 por diseño). */
  private effectiveDateFieldOf(
    version: VersionWithGraph,
  ): { section: VersionWithGraph["sections"][number]; field: VersionWithGraph["sections"][number]["fields"][number] } | null {
    for (const section of version.sections) {
      const field = section.fields.find((f) => f.semanticRole === "EFFECTIVE_DATE");
      if (field) return { section, field };
    }
    return null;
  }

  /**
   * Guardas + valor para escribir el campo EFFECTIVE_DATE desde el gesto de
   * diferido: aplica las MISMAS reglas que `saveSection` (sección editable en el
   * estado actual × rol de sección × override de rol por campo — sin bypass) y
   * valida el valor contra la definición. Devuelve el valor a escribir.
   * Para campos DATE conserva la fecha CIVIL del operador (se toma del string
   * ISO original, no de la conversión UTC, que podría correr un día).
   */
  private async prepareEffectiveDateWrite(
    userId: string,
    eff: NonNullable<ReturnType<LogEntriesService["effectiveDateFieldOf"]>>,
    currentStateKey: string | null,
    rawEffectiveAt: string,
  ): Promise<string> {
    const roleIds = await this.userRoleIds(userId);
    const blocked = this.sectionBlockedReasonFor(
      eff.section.editableInStateKey,
      eff.section.roles.map((r) => r.roleId),
      currentStateKey,
      roleIds,
    );
    if (blocked === "MISSING_ROLE") {
      throw new ForbiddenException(
        `La fecha del evento se declara en el campo "${eff.field.label}", reservado a otro rol: no puede diferir esta entrada`,
      );
    }
    if (blocked !== null) {
      throw new BadRequestException(
        `La fecha del evento se declara en el campo "${eff.field.label}", que se edita en otra etapa del flujo`,
      );
    }
    const fieldRoleIds = eff.field.roles.map((r) => r.roleId);
    if (fieldRoleIds.length > 0 && !fieldRoleIds.some((r) => roleIds.has(r))) {
      throw new ForbiddenException(`El campo "${eff.field.label}" está reservado a otro rol: no puede diferir esta entrada`);
    }

    const value = eff.field.type === "DATE" ? rawEffectiveAt.slice(0, 10) : rawEffectiveAt;
    const def = this.toFieldDef(eff.field, eff.section.key);
    const res = validateFieldValue(def, value);
    if (res.errors.length > 0) {
      throw new BadRequestException({ message: "La fecha del evento no es válida para el campo de fecha efectiva", errors: res.errors });
    }
    return value;
  }

  /**
   * Escribe el campo EFFECTIVE_DATE desde el gesto de diferido: upsert del valor,
   * `FieldChange` auditado (el motivo del diferimiento queda como `reason`) y
   * bump de la versión de la sección (los editores concurrentes ven 409 y
   * recargan, igual que en cualquier escritura por fuera de su borrador).
   */
  private async writeEffectiveDateValue(
    tx: Prisma.TransactionClient,
    logEntryId: string,
    eff: NonNullable<ReturnType<LogEntriesService["effectiveDateFieldOf"]>>,
    value: string,
    reason: string,
    userId: string,
    now: Date,
  ): Promise<void> {
    const before = await tx.logEntryValue.findUnique({
      where: { logEntryId_fieldKey: { logEntryId, fieldKey: eff.field.key } },
    });
    const beforeVal = (before?.value ?? null) as unknown;
    if (JSON.stringify(beforeVal) === JSON.stringify(value)) return; // sin cambio real

    await tx.logEntryValue.upsert({
      where: { logEntryId_fieldKey: { logEntryId, fieldKey: eff.field.key } },
      create: {
        logEntryId,
        sectionKey: eff.section.key,
        fieldKey: eff.field.key,
        dataType: eff.field.dataType,
        value,
        updatedById: userId,
      },
      update: { value, updatedById: userId },
    });
    await tx.logEntryFieldChange.create({
      data: {
        logEntryId,
        fieldKey: eff.field.key,
        before: this.toJson(beforeVal),
        after: value,
        reason,
        changedById: userId,
        changedAt: now,
      },
    });
    await tx.logEntrySection.updateMany({
      where: { logEntryId, sectionKey: eff.section.key },
      data: { version: { increment: 1 } },
    });
  }

  // --- Ejecutar una transición de flujo (Fase 2.5) ---------------------------

  async executeTransition(
    userId: string,
    id: string,
    dto: ExecuteTransitionRequest,
    ctx: AuditContext,
  ): Promise<LogEntryDetail> {
    const entry = await this.loadEntry(id);
    if (entry.status !== "DRAFT") throw new BadRequestException("La entrada ya fue finalizada o anulada");
    await this.assertNodeInScope(userId, entry.orgNodeId); // guarda (c) ABAC
    await this.scope.assertTemplateInScope(userId, entry.templateId);
    if (!entry.workflowDefinitionVersionId || !entry.currentStateKey) {
      throw new BadRequestException("La entrada no tiene un flujo configurado");
    }

    const wfVersion = await this.loadWorkflowVersion(entry.workflowDefinitionVersionId);
    const transition = wfVersion.transitions.find((t) => t.key === dto.transitionKey);
    if (!transition) throw new NotFoundException("Transición no encontrada en el flujo");

    // (a) la transición sale del estado actual.
    if (transition.fromState.key !== entry.currentStateKey) {
      throw new ConflictException("La transición no parte del estado actual de la entrada");
    }

    // (b) el usuario tiene un rol-dato autorizado (vacío = abierta al permiso base).
    const roleIds = await this.userRoleIds(userId);
    const allowedRoleIds = transition.roles.map((r) => r.roleId);
    if (allowedRoleIds.length > 0 && !allowedRoleIds.some((r) => roleIds.has(r))) {
      throw new ForbiddenException("No tiene un rol autorizado para ejecutar esta transición");
    }

    const version = await this.loadVersion(entry.templateVersionId);
    const valuesByKey = await this.loadValuesByKey(id);
    // Recompute autoritativo de los formulados antes de validar/sellar (Req-7).
    const evalNow = new Date();
    Object.assign(valuesByKey, recomputeComputedValues(this.toFieldsForRules(version), valuesByKey, { now: evalNow }));
    const sectionRows = await this.prisma.logEntrySection.findMany({ where: { logEntryId: id } });
    const fromStateKey = entry.currentStateKey;
    const editableInFrom = (section: VersionWithGraph["sections"][number]): boolean =>
      isSectionEditableInState(section.editableInStateKey, fromStateKey);

    // Guarda de período (2.7.1): una transición ES una transacción que muta y puede
    // sellar dimensiones (Maximo rechaza por fecha). Se valida ANTES de la completitud
    // (gate duro: en período cerrado no tiene sentido pedir "complete las secciones" —
    // ni siquiera se pueden completar) y ANTES del re-auth (no consumir un código de
    // recuperación si bloquea). effectiveAt = la que se sellaría (1ª salida del inicial)
    // o la ya congelada. Las lecturas y la verificación de firma nunca se tocan.
    const sealsHere = !entry.sealedAt && wfVersion.states.find((s) => s.key === transition.fromState.key)!.isInitial;
    const transitionEffectiveAt = sealsHere
      ? resolveEffectiveAt(
          version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
          valuesByKey,
          entry.recordedAt,
          entry.declaredEffectiveAt,
        )
      : entry.effectiveAt;
    await this.periods.assertWritable(
      transitionEffectiveAt,
      entry.orgNodeId,
      await this.permissions.getEffectivePermissions(userId),
    );

    // (d) completitud: las secciones editables en el estado de ORIGEN deben estar
    // marcadas COMPLETED y sin errores de validación (defensa en profundidad).
    const errors = await this.collectCompletionErrors(version, valuesByKey, editableInFrom);
    // Validación CRUZADA (Req-7): los ERROR bloquean el avance del flujo.
    errors.push(...evaluateCrossRules(this.versionRules(version), valuesByKey, { now: evalNow }).errors.map((e) => e.message));
    for (const section of version.sections) {
      if (!editableInFrom(section) || section.fields.length === 0) continue;
      const row = sectionRows.find((r) => r.sectionKey === section.key);
      if (!row || row.state !== "COMPLETED") errors.push(`Sección "${section.title}" sin completar`);
    }
    if (errors.length > 0) {
      throw new BadRequestException({ message: "No se puede avanzar: hay secciones incompletas o con errores", errors });
    }

    // Firma (si la transición la exige): re-auth ANTES de la transacción. El
    // step-up MFA se aplica solo si la transición lo pide (requireMfa).
    const reauth = transition.requireSignature
      ? await this.reauth.verifyForSignature(
          userId,
          { password: dto.password, mfaCode: dto.mfaCode },
          { requireMfa: transition.requireMfa },
        )
      : null;

    const now = new Date();
    const fromState = wfVersion.states.find((s) => s.key === transition.fromState.key)!;
    const toState = wfVersion.states.find((s) => s.key === transition.toState.key)!;
    // Sellado: la 1ª transición que sale del estado inicial congela las dimensiones.
    const seal = !entry.sealedAt && fromState.isInitial ? await this.computeSeal(entry, version, valuesByKey) : null;
    // Reconciliación de status: terminal ⇒ SUBMITTED; si no, sigue DRAFT (trabajo en curso).
    const nextStatus = toState.isFinal ? "SUBMITTED" : "DRAFT";

    await this.prisma.$transaction(async (tx) => {
      // Estampa los formulados recomputados ANTES de la firma/sellado (Req-7): el
      // snapshot firmado debe coincidir con lo persistido (§11.70). Solo en DRAFT.
      if (!entry.sealedAt) {
        await this.stampComputedValues(tx, id, version, valuesByKey, userId, now);
      }
      let signatureId: string | null = null;
      if (transition.requireSignature && reauth) {
        const sig = await this.createSignature(tx, {
          entry,
          context: "TRANSITION",
          transitionKey: transition.key,
          fromStateKey: fromState.key,
          toStateKey: toState.key,
          meaning: transition.signatureMeaning ?? transition.label,
          signerId: userId,
          signerName: reauth.signerName,
          method: reauth.method,
          valuesByKey,
          signedAt: now,
        });
        signatureId = sig.id;
      }

      await tx.logEntryTransition.create({
        data: {
          logEntryId: id,
          workflowDefinitionVersionId: entry.workflowDefinitionVersionId!,
          transitionKey: transition.key,
          fromStateKey: fromState.key,
          toStateKey: toState.key,
          actorId: userId,
          actorEmail: ctx.actorEmail ?? null,
          reason: dto.reason ?? null,
          signatureId,
          occurredAt: now,
        },
      });

      // Recomputa la editabilidad objetiva de cada sección en el NUEVO estado.
      for (const section of version.sections) {
        const row = sectionRows.find((r) => r.sectionKey === section.key);
        if (!row) continue;
        const editableNow = isSectionEditableInState(section.editableInStateKey, toState.key);
        const next = this.nextSectionState(row.state, editableNow);
        if (next !== row.state) {
          await tx.logEntrySection.update({ where: { id: row.id }, data: { state: next } });
        }
      }

      await tx.logEntry.update({
        where: { id },
        data: {
          currentStateKey: toState.key,
          // Reinicia el reloj de SLA: ahora se entra al estado destino (Workflow SLA).
          currentStateSince: now,
          status: nextStatus,
          updatedById: userId,
          ...(seal ? { sealedAt: now, ...seal } : {}),
        },
      });
    });

    await this.audit.record({
      ...ctx,
      action: "logentry.transition.executed",
      entityType: "LogEntry",
      entityId: id,
      after: {
        transition: transition.key,
        from: fromState.key,
        to: toState.key,
        signed: transition.requireSignature,
        sealed: Boolean(seal),
        status: nextStatus,
      },
    });

    // Gancho de evento de dominio (Notificaciones / umbral→incidencia engancharán aquí).
    this.onTransitionExecuted({
      logEntryId: id,
      transitionKey: transition.key,
      fromStateKey: fromState.key,
      toStateKey: toState.key,
      toIsFinal: toState.isFinal,
      actorId: userId,
    });

    return this.getDetail(userId, id);
  }

  // --- Helpers (los marcados "interno" los comparte LogbookQueryService) ------

  /** Interno: carga la entrada viva o lanza 404. */
  async loadEntry(id: string): Promise<LogEntryRow> {
    const entry = await this.prisma.logEntry.findFirst({ where: { id, deletedAt: null } });
    if (!entry) throw new NotFoundException("Entrada no encontrada");
    return entry;
  }

  /** Interno: versión de plantilla congelada con su grafo completo. */
  async loadVersion(versionId: string): Promise<VersionWithGraph> {
    const version = await this.prisma.templateVersion.findUnique({ where: { id: versionId }, include: versionInclude });
    if (!version) throw new NotFoundException("Versión de plantilla no encontrada");
    return version;
  }

  /** Interno: versión de flujo congelada con estados y transiciones. */
  async loadWorkflowVersion(versionId: string): Promise<WorkflowVersionWithGraph> {
    const version = await this.prisma.workflowDefinitionVersion.findUnique({
      where: { id: versionId },
      include: workflowVersionInclude,
    });
    if (!version) throw new NotFoundException("Versión de flujo no encontrada");
    return version;
  }

  /** Interno: foto plana de los valores actuales de la entrada (fieldKey → value). */
  async loadValuesByKey(id: string): Promise<Record<string, unknown>> {
    const rows = await this.prisma.logEntryValue.findMany({ where: { logEntryId: id } });
    const map: Record<string, unknown> = {};
    for (const v of rows) map[v.fieldKey] = (v.value ?? null) as unknown;
    return map;
  }

  /**
   * Recolecta errores de validación de las secciones que cumplen `predicate`:
   * obligatorios vacíos (visibles) + valores inválidos por tipo/rango/catálogo.
   * Fuente compartida por `submit` (form sin flujo) y la guarda de completitud de
   * `executeTransition`. Salta campos ocultos por `visibleWhen`.
   */
  private async collectCompletionErrors(
    version: VersionWithGraph,
    valuesByKey: Record<string, unknown>,
    predicate: (section: VersionWithGraph["sections"][number]) => boolean,
  ): Promise<string[]> {
    const errors: string[] = [];
    for (const section of version.sections) {
      if (!predicate(section)) continue;
      const defs = section.fields.map((f) => this.toFieldDef(f, section.key));
      const allowed = await this.resolveAllowedCodes(defs);
      for (const def of defs) {
        if (!isFieldVisible(def.visibleWhen, valuesByKey)) continue;
        const val = valuesByKey[def.key];
        if (def.required && isEmptyValue(val)) {
          errors.push(`${def.label}: obligatorio`);
          continue;
        }
        errors.push(...validateFieldValue(def, val, { allowedCodes: allowed.get(def.key) }).errors);
      }
    }
    return errors;
  }

  /**
   * Resuelve las dimensiones a estampar en `LogEntry` desde dos ejes desacoplados
   * (Fase 2.7.1.1): turno/día operacional del `ShiftResolver` y `periodKey` del
   * `FiscalResolver` (que mapea el día operacional al período del calendario fiscal).
   */
  private async resolveDims(
    effectiveAt: Date,
    orgNodeId: string | null,
  ): Promise<{ shiftCode: string | null; operationalDate: string | null; periodKey: string | null }> {
    const shift = await this.shiftResolver.resolve(effectiveAt, orgNodeId);
    const fiscal = await this.fiscalResolver.resolvePeriodKey(shift?.operationalDate ?? null, orgNodeId);
    return {
      shiftCode: shift?.shiftCode ?? null,
      operationalDate: shift?.operationalDate ?? null,
      periodKey: fiscal?.periodKey ?? null,
    };
  }

  /** Calcula effectiveAt + dimensiones de turno a partir de los valores actuales. */
  private async computeSeal(
    entry: LogEntryRow,
    version: VersionWithGraph,
    valuesByKey: Record<string, unknown>,
  ): Promise<{ effectiveAt: Date; shiftCode: string | null; operationalDate: string | null; periodKey: string | null }> {
    const effectiveAt = resolveEffectiveAt(
      version.sections.map((s) => ({ fields: s.fields.map((f) => this.toFieldDtoLite(f)) })),
      valuesByKey,
      entry.recordedAt,
      entry.declaredEffectiveAt,
    );
    const dims = await this.resolveDims(effectiveAt, entry.orgNodeId);
    return {
      effectiveAt,
      shiftCode: dims?.shiftCode ?? null,
      operationalDate: dims?.operationalDate ?? null,
      periodKey: dims?.periodKey ?? null,
    };
  }

  /**
   * Próximo estado de una sección al recomputar editabilidad tras una transición:
   * no editable ⇒ LOCKED (preserva completitud/firma/autoría); editable y estaba
   * LOCKED ⇒ se reabre a PENDING (rework, conserva los valores); en otro caso se
   * mantiene el estado actual.
   */
  private nextSectionState(current: LogEntrySectionState, editableNow: boolean): LogEntrySectionState {
    if (!editableNow) return "LOCKED";
    return current === "LOCKED" ? "PENDING" : current;
  }

  /**
   * Crea una firma electrónica (Part 11): hashea el snapshot canónico (record–
   * signature linking §11.70) y persiste la manifestación (§11.50). Corre dentro
   * de la transacción de la acción firmada (transición o completitud de sección).
   */
  private async createSignature(
    tx: Prisma.TransactionClient,
    args: {
      entry: LogEntryRow;
      context: SignatureContext;
      transitionKey?: string | null;
      sectionKey?: string | null;
      fromStateKey?: string | null;
      toStateKey?: string | null;
      meaning: string;
      signerId: string;
      signerName: string;
      method: SignatureMethod;
      valuesByKey: Record<string, unknown>;
      signedAt: Date;
    },
  ): Promise<{ id: string }> {
    const payloadHash = this.enc.sha256(
      canonicalSignaturePayload({
        entryId: args.entry.id,
        templateVersionId: args.entry.templateVersionId,
        context: args.context,
        transitionKey: args.transitionKey ?? null,
        sectionKey: args.sectionKey ?? null,
        fromStateKey: args.fromStateKey ?? null,
        toStateKey: args.toStateKey ?? null,
        signerId: args.signerId,
        meaning: args.meaning,
        signedAt: args.signedAt.toISOString(),
        values: args.valuesByKey,
      }),
    );
    return tx.logEntrySignature.create({
      data: {
        logEntryId: args.entry.id,
        context: args.context,
        transitionKey: args.transitionKey ?? null,
        sectionKey: args.sectionKey ?? null,
        signerId: args.signerId,
        signerName: args.signerName,
        meaning: args.meaning,
        method: args.method,
        payloadHash,
        signedAt: args.signedAt,
      },
      select: { id: true },
    });
  }

  private signatureSummary(
    sig: Prisma.LogEntrySignatureGetPayload<Record<string, never>> | undefined,
  ): LogEntrySignatureSummaryDto | null {
    if (!sig) return null;
    return { signerName: sig.signerName, meaning: sig.meaning, signedAt: sig.signedAt.toISOString() };
  }

  /**
   * Gancho de evento de dominio: una transición se ejecutó. Punto de extensión
   * ÚNICO para el futuro bus de eventos/outbox → Notificaciones por transición y
   * regla umbral→incidencia (Fase 4). Hoy es no-op intencional: la transición ya
   * queda auditada, así que no se pierde nada. Ver docs/BACKLOG.md.
   */
  protected onTransitionExecuted(_event: TransitionEvent): void {
    /* TODO(plataforma de eventos / Fase 4): publicar al outbox `logentry.transition.executed`. */
  }

  private async initialStateKey(workflowDefinitionVersionId: string | null): Promise<string | null> {
    if (!workflowDefinitionVersionId) return null;
    const initial = await this.prisma.workflowState.findFirst({
      where: { workflowDefinitionVersionId, isInitial: true },
      select: { key: true },
    });
    return initial?.key ?? null;
  }

  private toFieldDef(
    f: VersionWithGraph["sections"][number]["fields"][number],
    sectionKey: string,
  ): FieldDef {
    return {
      key: f.key,
      sectionKey,
      type: f.type,
      dataType: f.dataType,
      label: f.label,
      required: f.required,
      config: upgradeFieldConfig(f.type, (f.config ?? {}) as Record<string, unknown>),
      visibleWhen: (f.visibleWhen as FieldDef["visibleWhen"]) ?? null,
      computed: (f.computed as ComputedFieldConfig | null) ?? null,
      roleIds: f.roles.map((r) => r.roleId),
    };
  }

  /** Lista plana de campos de la versión para el motor de reglas (key/dataType/computed). */
  private toFieldsForRules(version: VersionWithGraph): FieldForRules[] {
    const out: FieldForRules[] = [];
    for (const s of version.sections) {
      for (const f of s.fields) {
        out.push({ key: f.key, dataType: f.dataType, computed: (f.computed as ComputedFieldConfig | null) ?? null });
      }
    }
    return out;
  }

  /** Reglas de validación cruzada de la versión congelada (Req-7). [] = sin reglas. */
  private versionRules(version: VersionWithGraph): CrossRule[] {
    return (version.rules as CrossRule[] | null) ?? [];
  }

  /**
   * Recomputa los campos FORMULADOS desde `valuesByKey` (servidor AUTORITATIVO) y
   * PERSISTE los que cambiaron en `LogEntryValue` (banda de umbral estampada) con
   * su huella en `LogEntryFieldChange` (reason COMPUTED, actor = quien gatilló el
   * cambio — ALCOA+: el humano teclea insumos, el sistema deriva). Devuelve el
   * mapa recomputado. Solo se llama mientras la entrada NO esté sellada (congela al sellar).
   */
  private async stampComputedValues(
    tx: Prisma.TransactionClient,
    id: string,
    version: VersionWithGraph,
    valuesByKey: Record<string, unknown>,
    userId: string,
    now: Date,
  ): Promise<void> {
    const fieldByKey = new Map<string, { def: FieldDef }>();
    for (const s of version.sections) {
      for (const f of s.fields) {
        if (f.computed) fieldByKey.set(f.key, { def: this.toFieldDef(f, s.key) });
      }
    }
    if (fieldByKey.size === 0) return;

    const recomputed = recomputeComputedValues(this.toFieldsForRules(version), valuesByKey, { now });
    const computedKeys = [...fieldByKey.keys()];
    const currentRows = await tx.logEntryValue.findMany({
      where: { logEntryId: id, fieldKey: { in: computedKeys } },
    });
    const currentByKey = new Map(currentRows.map((r) => [r.fieldKey, (r.value ?? null) as unknown]));

    for (const key of computedKeys) {
      const { def } = fieldByKey.get(key)!;
      const after = recomputed[key] ?? null;
      const before = currentByKey.get(key) ?? null;
      // Refleja el valor recomputado también en el mapa en memoria (snapshot de firma).
      valuesByKey[key] = after;
      if (JSON.stringify(before) === JSON.stringify(after)) continue;
      const band = thresholdBandFor(def, after);
      await tx.logEntryValue.upsert({
        where: { logEntryId_fieldKey: { logEntryId: id, fieldKey: key } },
        create: {
          logEntryId: id,
          sectionKey: def.sectionKey,
          fieldKey: key,
          dataType: def.dataType,
          value: this.toJson(after),
          thresholdBand: band,
          updatedById: userId,
        },
        update: { value: this.toJson(after), thresholdBand: band, updatedById: userId },
      });
      await tx.logEntryFieldChange.create({
        data: {
          logEntryId: id,
          fieldKey: key,
          before: this.toJson(before),
          after: this.toJson(after),
          reason: "COMPUTED",
          changedById: userId,
          changedAt: now,
        },
      });
    }
  }

  private toFieldDtoLite(f: VersionWithGraph["sections"][number]["fields"][number]) {
    return { key: f.key, semanticRole: f.semanticRole } as TemplateVersionDto["sections"][number]["fields"][number];
  }

  /**
   * Resuelve el conjunto de `code` válidos para los campos SELECT/MULTISELECT
   * (inline desde el config; referenceList consultando los ítems activos). Para
   * `external` (Fase 3) no hay catálogo resoluble: se deja sin restricción.
   */
  private async resolveAllowedCodes(fields: FieldDef[]): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    const listKeyByField = new Map<string, string>();
    const listKeys = new Set<string>();

    for (const f of fields) {
      if (f.type !== "SELECT" && f.type !== "MULTISELECT") continue;
      const source = f.config.optionSource as { kind?: string; items?: { code: string }[]; listKey?: string } | undefined;
      if (source?.kind === "inline") {
        result.set(f.key, new Set((source.items ?? []).map((i) => i.code)));
      } else if (source?.kind === "referenceList" && source.listKey) {
        listKeyByField.set(f.key, source.listKey);
        listKeys.add(source.listKey);
      }
    }

    if (listKeys.size > 0) {
      const lists = await this.prisma.referenceList.findMany({
        where: { key: { in: [...listKeys] }, deletedAt: null },
        select: { key: true, items: { where: { active: true }, select: { code: true } } },
      });
      const codesByKey = new Map(lists.map((l) => [l.key, new Set(l.items.map((i) => i.code))]));
      for (const [fieldKey, listKey] of listKeyByField) {
        result.set(fieldKey, codesByKey.get(listKey) ?? new Set());
      }
    }
    return result;
  }

  /**
   * Ventana de edición EFECTIVA de la entrada (2.7.2): config de la plantilla
   * (contenedor mutable) con fallback global. null = sin ventana.
   */
  private async editWindowConfigFor(templateId: string) {
    const template = await this.prisma.template.findUnique({
      where: { id: templateId },
      select: { editWindowAnchor: true, editWindowMinutes: true },
    });
    const globalCfg = await this.settings.editWindowSettings();
    return {
      config: resolveEditWindow(
        { editWindowAnchor: template?.editWindowAnchor ?? null, editWindowMinutes: template?.editWindowMinutes ?? null },
        globalCfg,
      ),
      requireMfaOverride: globalCfg.requireMfaEditWindowOverride,
    };
  }

  /**
   * Guarda de VENTANA DE EDICIÓN (Fase 2.7.2) sobre una escritura de la entrada
   * (saveSection / setDeferral / submit; NO create ni executeTransition — la
   * ventana gobierna la corrección de DATOS, no el avance del flujo). Si la
   * ventana venció: exige el permiso de excepción `logentry:write-expired` +
   * MOTIVO (GxP: corrección excepcional justificada) y, si el ajuste lo pide,
   * re-auth con MFA. Devuelve la huella del override para estampar en la
   * auditoría, o null si la escritura está dentro de ventana.
   *
   * Convive con la guarda de período en AND ("gana la más estricta"): cada guarda
   * tiene su PROPIO bypass; ésta se evalúa DESPUÉS (PERIOD_CLOSED precede). El
   * ancla EFFECTIVE usa la effectiveAt PERSISTIDA (pre-edición): editar el campo
   * de fecha efectiva no puede "reabrir" la ventana en el mismo guardado.
   */
  private async assertEditWindowWritable(
    entry: Pick<LogEntryRow, "templateId" | "recordedAt" | "effectiveAt">,
    userId: string,
    dto: { overrideReason?: string; password?: string; mfaCode?: string },
  ): Promise<EditWindowOverride | null> {
    const { config, requireMfaOverride } = await this.editWindowConfigFor(entry.templateId);
    if (!config) return null;
    const deadline = editWindowDeadline(config, entry.recordedAt, entry.effectiveAt);
    if (!isEditWindowExpired(deadline, new Date())) return null;

    const perms = await this.permissions.getEffectivePermissions(userId);
    if (!perms.has(EDIT_WINDOW_OVERRIDE_PERMISSION)) {
      throw new ForbiddenException(
        "La ventana de edición de este registro venció: no puede modificarlo (se requiere permiso de excepción).",
      );
    }
    const reason = dto.overrideReason?.trim();
    if (!reason || reason.length < 5) {
      throw new BadRequestException(
        "Editar fuera de la ventana exige un motivo (mínimo 5 caracteres): la corrección excepcional queda justificada y auditada.",
      );
    }
    let mfaVerified = false;
    if (requireMfaOverride) {
      // Mismo motor que las firmas Part 11 / gobernanza de período (step-up NIST).
      await this.reauth.verifyForSignature(userId, { password: dto.password, mfaCode: dto.mfaCode }, { requireMfa: true });
      mfaVerified = true;
    }
    return { reason, mfaVerified, windowExpiredAt: deadline.toISOString() };
  }

  /**
   * Evento de auditoría DEDICADO del override de ventana (consultable por acción:
   * "todas las ediciones fuera de ventana" es una pregunta de auditor GxP). Se
   * registra DESPUÉS de que la escritura se persistió.
   */
  private async auditEditWindowOverride(
    ctx: AuditContext,
    entryId: string,
    operation: string,
    override: EditWindowOverride,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    await this.audit.record({
      ...ctx,
      action: "logentry.editwindow.override",
      entityType: "LogEntry",
      entityId: entryId,
      metadata: {
        operation,
        reason: override.reason,
        mfaVerified: override.mfaVerified,
        windowExpiredAt: override.windowExpiredAt,
        ...extra,
      },
    });
  }

  /**
   * Por qué ESTE usuario no puede editar la sección en el estado actual (null =
   * sí puede). Es la MISMA decisión que gatea `saveSection` y que el DTO expone
   * como `blockedReason` para que la UI comunique el motivo real.
   */
  private sectionBlockedReasonFor(
    editableInStateKey: string | null,
    sectionRoleIds: string[],
    currentStateKey: string | null,
    userRoleIds: Set<string>,
  ): SectionBlockedReason | null {
    if (!isSectionEditableInState(editableInStateKey, currentStateKey)) return "WRONG_STATE";
    // Sin roles declarados = cualquier usuario con permiso de llenado puede.
    if (sectionRoleIds.length > 0 && !sectionRoleIds.some((r) => userRoleIds.has(r))) return "MISSING_ROLE";
    return null;
  }

  private async userRoleIds(userId: string): Promise<Set<string>> {
    const rows = await this.prisma.userRole.findMany({ where: { userId }, select: { roleId: true } });
    return new Set(rows.map((r) => r.roleId));
  }

  /** Nombre legible de roles por id (para "Asignada a: X" en el DTO de sección). */
  private async roleNamesById(ids: string[]): Promise<Map<string, string>> {
    const real = [...new Set(ids)];
    if (real.length === 0) return new Map();
    const roles = await this.prisma.role.findMany({ where: { id: { in: real } }, select: { id: true, name: true } });
    return new Map(roles.map((r) => [r.id, r.name]));
  }

  /** Interno: nombre legible por id de usuario (displayName o email). */
  async namesByUserId(ids: (string | null)[]): Promise<Map<string, string>> {
    const real = [...new Set(ids.filter((x): x is string => Boolean(x)))];
    if (real.length === 0) return new Map();
    const users = await this.prisma.user.findMany({ where: { id: { in: real } }, select: { id: true, displayName: true, email: true } });
    return new Map(users.map((u) => [u.id, u.displayName ?? u.email]));
  }

  private toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
    return value === null || value === undefined ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  }

  /** Interno (lo comparte LogbookQueryService): cabecera de la entrada como DTO. */
  mapEntry(e: EntrySource, templateName: string) {
    return {
      id: e.id,
      entryNumber: e.entryNumber,
      templateId: e.templateId,
      templateVersionId: e.templateVersionId,
      workflowDefinitionId: e.workflowDefinitionId,
      workflowDefinitionVersionId: e.workflowDefinitionVersionId,
      orgNodeId: e.orgNodeId,
      equipmentId: e.equipmentId,
      currentStateKey: e.currentStateKey,
      status: e.status,
      recordedAt: e.recordedAt.toISOString(),
      effectiveAt: e.effectiveAt.toISOString(),
      shiftCode: e.shiftCode,
      operationalDate: e.operationalDate,
      periodKey: e.periodKey,
      sealedAt: e.sealedAt?.toISOString() ?? null,
      entryOrigin: e.entryOrigin,
      declaredEffectiveAt: e.declaredEffectiveAt?.toISOString() ?? null,
      deferredReason: e.deferredReason,
      deferredDeclaredAt: e.deferredDeclaredAt?.toISOString() ?? null,
      voidedAt: e.voidedAt?.toISOString() ?? null,
      voidReason: e.voidReason,
      voidedById: e.voidedById,
      createdById: e.createdById,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
      templateName,
    };
  }

  private mapVersion(version: VersionWithGraph): TemplateVersionDto {
    return {
      id: version.id,
      templateId: version.templateId,
      versionNumber: version.versionNumber,
      status: version.status,
      name: version.name,
      description: version.description,
      workflowDefinitionId: version.workflowDefinitionId,
      workflowDefinitionVersionId: version.workflowDefinitionVersionId,
      requireSignature: version.requireSignature,
      recurrenceKind: version.recurrenceKind,
      recurrenceConfig: version.recurrenceConfig ?? null,
      rules: (version.rules as TemplateVersionDto["rules"]) ?? [],
      publishedAt: version.publishedAt?.toISOString() ?? null,
      sections: version.sections.map((s) => ({
        id: s.id,
        key: s.key,
        title: s.title,
        description: s.description,
        order: s.order,
        requireSignature: s.requireSignature,
        editableInStateKey: s.editableInStateKey,
        roleIds: s.roles.map((r) => r.roleId),
        fields: s.fields.map((f) => ({
          id: f.id,
          key: f.key,
          type: f.type,
          dataType: f.dataType,
          semanticRole: f.semanticRole,
          label: f.label,
          help: f.help,
          required: f.required,
          order: f.order,
          config: upgradeFieldConfig(f.type, (f.config ?? {}) as Record<string, unknown>),
          visibleWhen: (f.visibleWhen as TemplateVersionDto["sections"][number]["fields"][number]["visibleWhen"]) ?? null,
          computed: (f.computed as TemplateVersionDto["sections"][number]["fields"][number]["computed"]) ?? null,
          colSpan: f.colSpan,
          gridX: f.gridX,
          gridY: f.gridY,
          gridH: f.gridH,
          roleIds: f.roles.map((r) => r.roleId),
        })),
      })),
    };
  }

  private mapWorkflowVersion(version: WorkflowVersionWithGraph): WorkflowVersionDto {
    return {
      id: version.id,
      workflowDefinitionId: version.workflowDefinitionId,
      versionNumber: version.versionNumber,
      status: version.status,
      name: version.name,
      description: version.description,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      states: version.states.map((s) => ({
        id: s.id,
        key: s.key,
        name: s.name,
        description: s.description,
        order: s.order,
        isInitial: s.isInitial,
        isFinal: s.isFinal,
        color: s.color,
        maxStayMinutes: s.maxStayMinutes,
      })),
      transitions: version.transitions.map((t) => ({
        id: t.id,
        key: t.key,
        label: t.label,
        fromStateKey: t.fromState.key,
        toStateKey: t.toState.key,
        order: t.order,
        requireSignature: t.requireSignature,
        signatureMeaning: t.signatureMeaning,
        requireMfa: t.requireMfa,
        roleIds: t.roles.map((r) => r.roleId),
        roleNames: t.roles.map((r) => r.role.name),
      })),
    };
  }

  private async assertNodeExists(orgNodeId: string): Promise<void> {
    const exists = await this.prisma.orgNode.count({ where: { id: orgNodeId, deletedAt: null } });
    if (exists === 0) throw new BadRequestException("El nodo indicado no existe");
  }

  /**
   * Valida que el equipo (activo) esté INSTALADO en el nodo de la entrada
   * (objeto de referencia EAM, 2.8.0.1): la ubicación funcional [nodo] y el activo
   * [equipo] deben ser consistentes. El front ya ofrece solo los equipos del nodo;
   * el backend AUTORIZA la coherencia.
   */
  private async assertEquipmentInNode(equipmentId: string, orgNodeId: string): Promise<void> {
    const eq = await this.prisma.equipment.findFirst({
      where: { id: equipmentId, deletedAt: null },
      select: { orgNodeId: true, active: true },
    });
    if (!eq || !eq.active) throw new BadRequestException("El equipo indicado no existe o está inactivo");
    if (eq.orgNodeId !== orgNodeId) throw new BadRequestException("El equipo no pertenece al nodo de la entrada");
  }

  /**
   * Gobernanza del objeto de referencia EAM (Fase 2.8.0.2): autoriza el equipo contra
   * el MODO de la plantilla, en `create`/materialización (punto donde `equipmentId` se
   * estampa, igual que `orgNodeId`). Patrón notification-type SAP PM / WO-type Maximo:
   * el TIPO de registro decide si el objeto de referencia es obligatorio.
   *  - REQUIRED ⇒ obligatorio (rechaza si falta).
   *  - NONE     ⇒ la plantilla no usa equipo (rechaza si se manda uno).
   *  - OPTIONAL/SUGGESTED ⇒ permisivo (idénticos en backend; SUGGESTED solo empuja en UI).
   */
  private assertEquipmentForMode(mode: EquipmentMode, equipmentId: string | null | undefined): void {
    if (mode === "REQUIRED" && !equipmentId) {
      throw new BadRequestException("Esta plantilla exige indicar un equipo para la entrada");
    }
    if (mode === "NONE" && equipmentId) {
      throw new BadRequestException("Esta plantilla no admite equipo en la entrada");
    }
  }

  // --- Alcance de estructura de la plantilla (multi-nodo, Fase 2.8.0) ---------

  /**
   * Valida que el nodo elegido pertenezca al alcance de estructura de la plantilla:
   * cubierto por una asignación directa, o dentro del subárbol de una asignación con
   * `includeDescendants`. CERO asignaciones = GLOBAL ⇒ cualquier nodo accesible vale
   * (la accesibilidad ya se validó aparte). Cierra el diferido (a) de 2.4: el backend
   * AUTORIZA el nodo, el front solo lo ofrece.
   */
  private async assertNodeAllowedForTemplate(
    orgNodeId: string,
    assignments: Array<{ orgNodeId: string; includeDescendants: boolean; orgNode: { path: string } }>,
  ): Promise<void> {
    if (assignments.length === 0) return; // global
    if (assignments.some((a) => !a.includeDescendants && a.orgNodeId === orgNodeId)) return;
    const branches = assignments.filter((a) => a.includeDescendants);
    if (branches.length > 0) {
      const node = await this.prisma.orgNode.findUnique({ where: { id: orgNodeId }, select: { path: true } });
      if (node && branches.some((a) => node.path.startsWith(a.orgNode.path))) return;
    }
    throw new BadRequestException("El nodo indicado no pertenece al alcance de la plantilla");
  }

  /**
   * Nodos en los que el usuario PUEDE crear una entrada con esta plantilla (Fase
   * 2.8.0): intersección de las asignaciones de la plantilla (expandidas por
   * subárbol) con el alcance de NODO del usuario. Para una plantilla GLOBAL = todos
   * los nodos accesibles. El front autoselecciona si hay 1 y obliga a elegir si >1.
   */
  async eligibleNodesForTemplate(userId: string, templateId: string): Promise<TemplateEligibleNodes> {
    const template = await this.prisma.template.findFirst({
      where: { id: templateId, deletedAt: null },
      include: { nodeAssignments: { select: { orgNodeId: true, includeDescendants: true, orgNode: { select: { path: true } } } } },
    });
    if (!template) throw new NotFoundException("Plantilla no encontrada");
    // Eje de PLANTILLA (2.8): si está fuera de alcance, no hay nodos elegibles.
    await this.scope.assertTemplateInScope(userId, template.id);

    const access = await this.scope.getAccessibleNodes(userId);

    // Universo candidato por asignaciones (expandido), o null = todos (global).
    let candidateIds: Set<string> | null = null;
    if (template.nodeAssignments.length > 0) {
      candidateIds = new Set<string>();
      const branchPaths: string[] = [];
      for (const a of template.nodeAssignments) {
        candidateIds.add(a.orgNodeId);
        if (a.includeDescendants) branchPaths.push(a.orgNode.path);
      }
      if (branchPaths.length > 0) {
        const desc = await this.prisma.orgNode.findMany({
          where: { deletedAt: null, OR: branchPaths.map((p) => ({ path: { startsWith: p } })) },
          select: { id: true },
        });
        for (const d of desc) candidateIds.add(d.id);
      }
    }

    // Intersección con el alcance de nodo del usuario.
    const where: Prisma.OrgNodeWhereInput = { deletedAt: null };
    if (candidateIds !== null && access !== null) {
      where.id = { in: [...candidateIds].filter((id) => access.ids.has(id)) };
    } else if (candidateIds !== null) {
      where.id = { in: [...candidateIds] };
    } else if (access !== null) {
      where.id = { in: [...access.ids] };
    }

    const rows = await this.prisma.orgNode.findMany({ where, select: { id: true, name: true } });
    const nodeIdList = rows.map((r) => r.id);
    const readable = await this.nodePaths(new Set(nodeIdList));

    // Equipos ACTIVOS instalados en esos nodos (objeto de referencia EAM, 2.8.0.1):
    // el equipo en la entrada es OPCIONAL y se ofrece por nodo. Si el modo es NONE
    // (2.8.0.2) la plantilla no usa equipo ⇒ no se consulta ni se ofrece.
    const equip =
      nodeIdList.length && template.equipmentMode !== "NONE"
        ? await this.prisma.equipment.findMany({
          where: { orgNodeId: { in: nodeIdList }, deletedAt: null, active: true },
          select: { id: true, name: true, tag: true, orgNodeId: true },
          orderBy: [{ reportOrder: "asc" }, { name: "asc" }],
        })
      : [];
    const equipByNode = new Map<string, Array<{ id: string; name: string; tag: string | null }>>();
    for (const e of equip) {
      const list = equipByNode.get(e.orgNodeId) ?? [];
      list.push({ id: e.id, name: e.name, tag: e.tag });
      equipByNode.set(e.orgNodeId, list);
    }

    const nodes = rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        path: readable.get(r.id) ?? r.name,
        equipment: equipByNode.get(r.id) ?? [],
      }))
      .sort((a, b) => a.path.localeCompare(b.path, "es"));
    return { templateId: template.id, equipmentMode: template.equipmentMode, nodes };
  }

  /** Interno: ABAC — 403 si el nodo de la entrada está fuera del alcance del usuario. */
  async assertNodeInScope(userId: string, orgNodeId: string): Promise<void> {
    if (!(await this.scope.canAccessNode(userId, orgNodeId))) {
      throw new ForbiddenException("La entrada está fuera de su alcance");
    }
  }

  private async nodePath(orgNodeId: string): Promise<string | null> {
    return (await this.nodePaths(new Set([orgNodeId]))).get(orgNodeId) ?? null;
  }

  /** Interno: rutas legibles ("Planta › Área › Proceso") por id de nodo. */
  async nodePaths(nodeIds: Set<string>): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (nodeIds.size === 0) return result;
    const all = await this.prisma.orgNode.findMany({ select: { id: true, name: true, path: true } });
    const nameById = new Map(all.map((n) => [n.id, n.name]));
    const pathById = new Map(all.map((n) => [n.id, n.path]));
    for (const id of nodeIds) {
      const path = pathById.get(id);
      if (!path) continue;
      const names = path.split("/").filter(Boolean).map((nid) => nameById.get(nid) ?? "—");
      result.set(id, names.join(" › "));
    }
    return result;
  }
}
